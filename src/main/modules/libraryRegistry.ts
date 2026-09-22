/**
 * Leaf · 多资源库注册表（D-013）
 *
 * - 登记文件：userData/libraries.json
 * - 库目录布局：新库 = <path>/library.db + thumbs/ + bookmarks/ + clips/ + converted/
 *   旧布局（首启迁移）= path 直接引用 userData（leaf.db 与各目录平铺，legacy=true）
 * - 激活库在启动早期解析：database 路径与各服务的附属目录据此取值
 * - 切库语义 = 写入 activeLibraryId 后 relaunch（与 Eagle 重载体验一致，D-013 记录）
 */
import { app } from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { log } from '../services/LogService'

export interface LibraryEntry {
  id: string
  name: string
  /** 库根目录（legacy=true 时即 userData） */
  path: string
  /** 旧 userData 直引用布局 */
  legacy: boolean
  createdAt: number
  lastOpenedAt: number
}

interface RegistryFile {
  activeLibraryId: string
  libraries: LibraryEntry[]
}

const REGISTRY_FILE = 'libraries.json'
const LEGACY_DB = 'leaf.db'
const LIBRARY_DB = 'library.db'

/** 进程内缓存（审查 P3-29/P2-31）：activeSubdir 等热路径每次同步读盘+parse 纯浪费；
 *  本应用单实例且切库即 relaunch，缓存与磁盘不可能分叉 */
let cachedRegistry: RegistryFile | null = null

function registryPath(): string {
  return join(app.getPath('userData'), REGISTRY_FILE)
}

/** 崩溃备份只留最近 3 份（时间戳在文件名里，字典序=时间序） */
function pruneCorruptBackups(current: string): void {
  try {
    const dir = dirname(current)
    const prefix = `${REGISTRY_FILE}.corrupt-`
    const stale = readdirSync(dir)
      .filter((f) => f.startsWith(prefix))
      .sort()
      .slice(0, -3)
    for (const f of stale) rmSync(join(dir, f), { force: true })
  } catch {
    /* 清理失败不影响启动 */
  }
}

export function loadRegistry(): RegistryFile {
  if (cachedRegistry) return cachedRegistry
  const p = registryPath()
  if (existsSync(p)) {
    let parsed: RegistryFile | null = null
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as RegistryFile
      if (Array.isArray(raw.libraries)) parsed = raw
      else log.warn('libraryRegistry', 'libraries.json 缺 libraries 数组，按损坏处理')
    } catch (error) {
      log.warn('libraryRegistry', `libraries.json 解析失败: ${String(error)}`)
    }
    if (parsed) {
      if (parsed.libraries.length === 0) {
        // 合法但空列表 ≠ 损坏：不能改名备份后静默重建（用户手动清过列表时
        // 那是真实状态），但空注册表跑不了任何库，按首启登记并留痕
        log.warn('libraryRegistry', 'libraries.json 的库列表为空，按首启登记默认库')
      } else {
        cachedRegistry = parsed
        return parsed
      }
    } else {
      // 损坏：改名备份后重建（审查 P2-31）。旧行为直接覆盖写回，
      // 一次写坏 libraries.json 就把用户全部已登记库静默注销
      const backup = `${p}.corrupt-${Date.now()}`
      try {
        renameSync(p, backup)
        log.warn('libraryRegistry', `corrupt registry backed up to ${backup}`)
        pruneCorruptBackups(p)
      } catch {
        log.warn('libraryRegistry', 'registry corrupt backup failed')
      }
    }
  }
  // 首启：把现有 userData 布局登记为「默认资源库」（原位引用，零迁移成本）
  const now = Date.now()
  const entry: LibraryEntry = {
    id: 'default',
    name: '默认资源库',
    path: app.getPath('userData'),
    legacy: true,
    createdAt: now,
    lastOpenedAt: now
  }
  const reg: RegistryFile = { activeLibraryId: entry.id, libraries: [entry] }
  saveRegistry(reg)
  return reg
}

export function saveRegistry(reg: RegistryFile): void {
  const p = registryPath()
  // 原子替换（审查 P2-31）：直写时崩溃/断电会留下截断 JSON
  const tmp = `${p}.tmp-${Date.now()}`
  try {
    writeFileSync(tmp, JSON.stringify(reg, null, 2), 'utf8')
    renameSync(tmp, p)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  cachedRegistry = reg
}

export function listLibraries(): LibraryEntry[] {
  // 返回副本：缓存数组的活引用泄漏出去会让调用方就地 mutate 绕过 saveRegistry
  return [...loadRegistry().libraries]
}

/** 启动早期调用：确保注册表存在且至少有一个库（首启登记默认库） */
export function ensureRegistry(): void {
  loadRegistry()
}

export function getActiveLibrary(): LibraryEntry {
  const reg = loadRegistry()
  return reg.libraries.find((l) => l.id === reg.activeLibraryId) ?? reg.libraries[0]
}

export function setActiveLibrary(id: string): void {
  const reg = loadRegistry()
  const hit = reg.libraries.find((l) => l.id === id)
  if (!hit) throw new Error(`资源库不存在: ${id}`)
  reg.activeLibraryId = id
  hit.lastOpenedAt = Date.now()
  saveRegistry(reg)
}

export function dbPathOf(entry: LibraryEntry): string {
  return entry.legacy ? join(entry.path, LEGACY_DB) : join(entry.path, LIBRARY_DB)
}

/** 各附属目录（thumbs/wallpaper/bookmarks/clips/converted）；legacy 布局保持 userData 平铺 */
export function activeSubdir(
  name: 'thumbs' | 'wallpaper' | 'bookmarks' | 'clips' | 'converted'
): string {
  const lib = getActiveLibrary()
  return lib.legacy ? join(app.getPath('userData'), name) : join(lib.path, name)
}

/** D-020：当前库根目录（素材拷贝落 images/YYMM）。legacy 库的根就是 userData，
 *  它的 images/ 与 thumbs/ 等一样平铺在 userData 下 */
export function activeRoot(): string {
  return getActiveLibrary().path
}

export interface CreateLibraryResult {
  entry: LibraryEntry
}

/** 新建资源库：创建目录骨架并注册；库表结构在切换（重启）后由迁移链初始化 */
export function createLibrary(name: string, parentDir?: string): CreateLibraryResult {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('资源库名称不能为空')
  const base = parentDir?.trim() || app.getPath('userData')
  let safe = trimmed.replace(/[\\/:*?"<>|]/g, '-')
  // 防目录逃逸：库名为 . / .. 时 join(base, safe) 会落在 base 之外
  if (safe === '.' || safe === '..') safe = '-'
  const path = join(base, safe)
  if (existsSync(path) && existsSync(join(path, LIBRARY_DB))) {
    throw new Error(`目录已存在资源库：${path}`)
  }
  for (const sub of ['thumbs', 'wallpaper', 'bookmarks', 'clips', 'converted']) {
    mkdirSync(join(path, sub), { recursive: true })
  }
  const reg = loadRegistry()
  const now = Date.now()
  const entry: LibraryEntry = {
    id: `lib-${now.toString(36)}`,
    name: trimmed,
    path,
    legacy: false,
    createdAt: now,
    lastOpenedAt: now
  }
  reg.libraries.push(entry)
  saveRegistry(reg)
  log.info('libraryRegistry', `created library: ${entry.name} @ ${path}`)
  return { entry }
}

export function renameLibrary(id: string, name: string): LibraryEntry | undefined {
  const reg = loadRegistry()
  const hit = reg.libraries.find((l) => l.id === id)
  if (!hit) return undefined
  hit.name = name.trim() || hit.name
  saveRegistry(reg)
  return hit
}

/** 仅解除登记，不删除磁盘文件（调用方确认后自行删除目录） */
export function unregisterLibrary(id: string): boolean {
  if (id === 'default') throw new Error('默认资源库不可移除登记')
  const reg = loadRegistry()
  const before = reg.libraries.length
  reg.libraries = reg.libraries.filter((l) => l.id !== id)
  if (reg.libraries.length === before) return false
  if (reg.activeLibraryId === id) {
    reg.activeLibraryId = reg.libraries[0].id
  }
  saveRegistry(reg)
  return true
}
