/**
 * Leaf 素材库 · 收集入口（§2.A）
 *
 * 统一封装两类入库：
 * - 本地文件拖拽到窗口（DataTransfer.files[].path）→ photos:importPaths
 * - ⌘V 粘贴（系统剪贴板里的文件路径）→ photos:getClipboardFiles → importPaths
 * 均复用既有导入管线（后台自动缩略图/EXIF），导入后刷新全库。
 *
 * 模块级单例：拖拽/粘贴在 index.vue 调同一份逻辑。
 */
import { ref } from 'vue'
import { useToast } from '@composables/useToast'
import type { Photo } from '@renderer/types/photo'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoClipboard } from './usePhotoClipboard'
import { usePhotoData } from './usePhotoData'

const toast = useToast()

const importing = ref(false)
const dragActive = ref(false)
let dragDepth = 0

/** File/blob → 裸 base64（Data URL 去头），供 importBlob 走 IPC 入库 */
/** File/blob → 裸 base64（Data URL 去头），供 importBlob 走 IPC 入库 */
function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result ?? '')
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取失败'))
    reader.readAsDataURL(f)
  })
}

function build() {
  const data = usePhotoData()
  const tabs = useLibraryTabs()
  const clipboard = usePhotoClipboard()

  /** 当前视图对应的文件夹 id（拖拽/粘贴/导入落点），非文件夹视图为 null */
  const currentFolderId = (): string | null => {
    const v = tabs.activeView
    return v.startsWith('folder:') ? v.slice(7) : null
  }

  /** 把系统文件路径交给后台管线入库（拖拽/粘贴共用）；
   *  目录在主进程按磁盘层级镜像建夹（Eagle 口径），folderId 是挂载点：
   *  散装文件与镜像树的根都归进它（并触发其自动标签规则），null = 侧栏根级 */
  const importPaths = async (filePaths: string[], folderId?: string | null): Promise<void> => {
    if (filePaths.length === 0) return
    importing.value = true
    try {
      const newPhotos: Photo[] = await window.api.photos.importPaths(filePaths, folderId ?? null)
      // 建夹/归组都已在主进程完成，侧栏计数与文件夹树要跟着刷新
      await data.loadFolders()
      toast.success(`成功导入 ${newPhotos.length} 个素材`)
      // 并发刷新全库相关池（避免多次串行整库拉取）
      await data.refreshAllPools()
    } catch (error) {
      console.error('导入失败:', error)
      toast.error('导入失败', { description: (error as Error).message })
    } finally {
      importing.value = false
    }
  }

  /** ⌘V 粘贴：从剪贴板读取文件路径并入库 */
  const pasteFromClipboard = async (): Promise<void> => {
    try {
      const paths = await window.api.photos.getClipboardFiles()
      if (paths.length === 0) {
        toast.info('剪贴板里没有可识别的素材文件')
        return
      }
      await importPaths(paths, currentFolderId())
    } catch (error) {
      console.error('粘贴导入失败:', error)
      toast.error('粘贴导入失败', { description: (error as Error).message })
    }
  }

  /** 粘贴内存位图（截图/网页复制的图，无磁盘路径）直接入库 */
  const importBlobs = async (blobs: File[], folderId?: string | null): Promise<void> => {
    if (blobs.length === 0) return
    importing.value = true
    try {
      let n = 0
      for (const b of blobs) {
        const base64 = await fileToBase64(b)
        const res = await window.api.photos.importBlob({ mime: b.type, base64 })
        if (res.ok && res.photo) {
          n += 1
          if (folderId) {
            await window.api.photos.assignPhotosToFolder(folderId, [res.photo.id])
          }
        } else {
          toast.error('粘贴的图片导入失败', { description: res.error })
        }
      }
      if (n > 0) {
        if (folderId) await data.loadFolders()
        toast.success(`成功导入 ${n} 个素材`)
        await data.refreshAllPools()
      }
    } catch (error) {
      console.error('粘贴图片导入失败:', error)
      toast.error('粘贴图片导入失败', { description: (error as Error).message })
    } finally {
      importing.value = false
    }
  }

  // ── 拖拽落点：window 级 dragenter/over/leave/drop ──

  const onDragEnter = (e: DragEvent): void => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    dragDepth += 1
    dragActive.value = true
  }

  const onDragOver = (e: DragEvent): void => {
    if (!e.dataTransfer) return
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const onDragLeave = (e: DragEvent): void => {
    e.preventDefault()
    // 与 onDragEnter 同守卫：非文件拖拽（纯文本/链接）不参与计数，
    // 否则 dragDepth 被污染、遮罩可能永久滞留或提前消失
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) dragActive.value = false
  }

  /** 从 DataTransfer 解析绝对路径：Electron 32+ 移除了 File.path，改用 preload 暴露的
   *  webUtils.getPathForFile；无磁盘路径的内存位图（截图/网页复制的图）单独收集。
   *  单个文件项解析失败只计数不中断整批。 */
  const extractDropEntries = (
    dt: DataTransfer
  ): { paths: string[]; blobs: File[]; failed: number } => {
    const paths: string[] = []
    const blobs: File[] = []
    let failed = 0
    for (const f of Array.from(dt.files)) {
      let p = ''
      try {
        const viaWebUtils = window.api?.getPathForFile?.(f)
        if (typeof viaWebUtils === 'string' && viaWebUtils.length > 0) p = viaWebUtils
      } catch (err) {
        // webUtils 对非文件项会抛错；计数便于诊断「拖放无反应」类反馈
        failed++
        console.warn('[import] getPathForFile 失败:', (err as Error).message)
      }
      if (!p) {
        const legacy = (f as unknown as { path?: string }).path
        if (typeof legacy === 'string' && legacy.length > 0) p = legacy
      }
      if (p) paths.push(p)
      // 内存位图没有磁盘路径：转 base64 入库而非报错
      else if (f.type.startsWith('image/')) blobs.push(f)
      else failed++
    }
    return { paths, blobs, failed }
  }

  /** 一次落点导入：folderId = 目标文件夹（null = 侧栏根级）。
   *  拖到侧栏某个文件夹行上时由该行调用，落到别处时由 window 级 onDrop 调用。
   *  无论谁调，都要收掉全屏拖拽遮罩——侧栏那条路径不会冒泡到 window 的 drop。 */
  const dropFilesTo = async (e: DragEvent, folderId: string | null): Promise<void> => {
    e.preventDefault()
    dragDepth = 0
    dragActive.value = false
    const dt = e.dataTransfer
    if (!dt) return
    const { paths, failed } = extractDropEntries(dt)
    if (paths.length === 0) {
      // 此前为静默 return——用户侧表现为「拖放没反应」，无任何线索；
      // 显式提示以区分「事件未到达」「文件项为空」「路径解析失败」三种情形
      if (dt.files.length === 0) toast.info('没有检测到可导入的文件')
      else
        toast.error(`无法读取所拖文件的路径（${failed}/${dt.files.length} 项解析失败）`, {
          description: '可尝试改用「导入」按钮选择文件，并把此提示截图反馈'
        })
      return
    }
    await importPaths(paths, folderId)
  }

  const onDrop = (e: DragEvent): void => {
    void dropFilesTo(e, currentFolderId())
  }

  const bindWindowDrag = (): (() => void) => {
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }

  /** 粘贴监听（⌘V / Ctrl+V 仅在非输入焦点时拦截） */
  const onPaste = async (e: ClipboardEvent): Promise<void> => {
    const target = e.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return
    }
    // F1：内部剪切态优先——⌘V 语义为「粘贴移动」而非文件导入（Eagle 行为）
    if (clipboard.cutPhotoIds.value.length > 0) {
      e.preventDefault()
      void clipboard.pasteMove()
      return
    }
    const dt = e.clipboardData
    if (dt && dt.files && dt.files.length > 0) {
      e.preventDefault()
      const { paths, blobs, failed } = extractDropEntries(dt)
      if (paths.length === 0 && blobs.length === 0) {
        toast.error(`无法读取所粘贴文件的路径（${failed}/${dt.files.length} 项解析失败）`)
        return
      }
      const fid = currentFolderId()
      if (paths.length > 0) await importPaths(paths, fid)
      await importBlobs(blobs, fid)
    } else {
      void pasteFromClipboard()
    }
  }

  const bindWindowPaste = (): (() => void) => {
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }

  return {
    importing,
    dragActive,
    importPaths,
    dropFilesTo,
    pasteFromClipboard,
    bindWindowDrag,
    bindWindowPaste
  }
}

type ImportApi = ReturnType<typeof build>

let singleton: ImportApi | null = null

export function usePhotoImport(): ImportApi {
  if (!singleton) singleton = build()
  return singleton
}
