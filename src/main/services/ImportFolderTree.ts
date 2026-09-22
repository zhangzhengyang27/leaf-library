/**
 * Leaf · 目录树导入（对齐 Eagle 的 walkTreeSync + createFolderStruture + uploadFilesFromFolder）
 *
 * Eagle 拖入/导入一个目录时镜像磁盘层级建夹：每个文件挂在「它自己那一级目录」
 * 对应的文件夹上，空的非 junk 子目录同样建出来，拖到某个文件夹上则整棵树挂在它下面。
 * 本模块把这套语义落到 photo_folders（parent_id 层级）上，FS 扫描与写库分离：
 * 扫描是纯函数（临时目录即可单测），写库通过 deps 注入（测试用内存库）。
 */
import { promises as fsp } from 'fs'
import { basename, join } from 'path'
import { isBundlePath } from '../utils/pathPolicy'

/** 单次导入扫描的文件上限：超出即截断（与旧 collectDirectoryFiles 同口径） */
export const SCAN_LIMIT = 5000
const MAX_DEPTH = 16
const JUNK = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '__macosx'])

export const isJunkName = (name: string): boolean => {
  const lower = name.toLowerCase()
  return lower.startsWith('.') || JUNK.has(lower) || lower.startsWith('~$')
}

export interface DirTree {
  /** 该目录的绝对路径 */
  dir: string
  /** 目录名（basename）；根节点用它作为镜像文件夹名 */
  name: string
  /** 直接位于该目录下的文件（含 .app 等「按单文件收」的应用包） */
  files: string[]
  /** 子目录镜像，已按名字排序；空目录也在 */
  folders: DirTree[]
}

export interface TreeScan {
  tree: DirTree
  /** 达到 SCAN_LIMIT 被截断 */
  truncated: boolean
  /** 读取失败的子目录数（未授权/瞬间被删） */
  failedDirs: number
  /** 全树文件总数 */
  fileCount: number
}

/** 与 Eagle 侧栏一致：中文 + 数字自然序 */
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

/**
 * 递归扫描目录成树。规则沿用原 collectDirectoryFiles：
 * 跳过 junk 与软链（防环），.app 等应用包按单个文件项收集，深度超 MAX_DEPTH 停止下探。
 */
export async function buildDirectoryTree(root: string): Promise<TreeScan> {
  let truncated = false
  let failedDirs = 0
  let fileCount = 0

  const walk = async (dir: string, depth: number): Promise<DirTree> => {
    const node: DirTree = { dir, name: basename(dir), files: [], folders: [] }
    let items: import('fs').Dirent[]
    try {
      items = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      failedDirs += 1
      return node
    }
    const dirs: string[] = []
    for (const item of items) {
      if (isJunkName(item.name)) continue
      const full = join(dir, item.name)
      if (item.isSymbolicLink()) continue
      if (item.isFile()) {
        if (fileCount >= SCAN_LIMIT) {
          truncated = true
          continue
        }
        fileCount += 1
        node.files.push(full)
      } else if (item.isDirectory()) {
        // 应用包（.app/.keynote 等）整体当一个素材，不下探
        if (isBundlePath(item.name)) {
          if (fileCount >= SCAN_LIMIT) {
            truncated = true
            continue
          }
          fileCount += 1
          node.files.push(full)
        } else {
          dirs.push(full)
        }
      }
    }
    for (const sub of dirs) {
      if (truncated) break
      if (depth >= MAX_DEPTH) {
        truncated = true
        break
      }
      node.folders.push(await walk(sub, depth + 1))
    }
    node.files.sort((a, b) => collator.compare(basename(a), basename(b)))
    node.folders.sort((a, b) => collator.compare(a.name, b.name))
    return node
  }

  const tree = await walk(root, 0)
  return { tree, truncated, failedDirs, fileCount }
}

export interface ImportDeps<P extends { id: string } = { id: string }> {
  /** 同名同级复用：返回已存在文件夹的 id，没有则 null（避免重复导入建出第二棵空树） */
  findByName(parentId: string | null, name: string): string | null
  create(parentId: string | null, name: string): string
  /** 入库并返回新建的素材（已存在的重复路径不返回，因此不会把老素材从别的文件夹拽走） */
  addFiles(paths: string[]): P[]
  assign(folderId: string, photoIds: string[]): void
  /** 回滚用：删掉本次刚建出来的文件夹（含其子树） */
  remove(folderId: string): void
}

export interface ImportTreeResult<P extends { id: string } = { id: string }> {
  /** 本次新建的全部素材，扁平（供调用方刷新与计数） */
  photos: P[]
  /** 本次新建的文件夹 id（复用的不计入） */
  folders: string[]
  truncated: boolean
  failedDirs: number
  fileCount: number
}

/**
 * 把一个磁盘目录镜像进 photo_folders 并入库其文件。
 * @param parentId 挂载点（当前文件夹视图），null = 侧栏根级
 *
 * 整目录一个文件都没有时什么都不建（返回空 photos + fileCount 0），
 * 由调用方提示「没有可导入的文件」——避免误选空目录留下一个孤零零的文件夹。
 */
export async function importDirectoryTree<P extends { id: string }>(
  root: string,
  parentId: string | null,
  deps: ImportDeps<P>
): Promise<ImportTreeResult<P>> {
  const { tree, truncated, failedDirs, fileCount } = await buildDirectoryTree(root)
  const photos: P[] = []
  const folders: string[] = []
  if (fileCount === 0) return { photos, folders, truncated, failedDirs, fileCount }

  const place = (node: DirTree, under: string | null): void => {
    const existing = deps.findByName(under, node.name)
    const folderId = existing ?? deps.create(under, node.name)
    if (!existing) folders.push(folderId)
    if (node.files.length > 0) {
      const created = deps.addFiles(node.files)
      if (created.length > 0) {
        deps.assign(
          folderId,
          created.map((p) => p.id)
        )
        photos.push(...created)
      }
    }
    for (const child of node.folders) place(child, folderId)
  }
  place(tree, parentId)
  // 一个素材都没新增（整目录都已在库中）→ 刚建的镜像树全是空壳，回滚掉。
  // 否则「同一目录再导入到别的文件夹下」会在侧栏留一整棵空树。
  if (photos.length === 0 && folders.length > 0) {
    for (const id of folders) deps.remove(id)
    folders.length = 0
  }
  return { photos, folders, truncated, failedDirs, fileCount }
}
