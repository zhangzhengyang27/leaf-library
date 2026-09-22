/**
 * Leaf 素材库 · 内部剪贴板（F1：⌘X 剪切 / ⌘V 粘贴移动，对齐 Eagle）
 *
 * 模块级单例，与系统剪贴板无关：只承载「已剪切待粘贴」的素材 id 集合。
 * ⌘V 的优先级判定（内部剪切态 > 系统剪贴板文件导入）由 usePhotoImport.onPaste
 * 与 index.vue 右键菜单共用本模块状态实现。
 *
 * 粘贴语义：进入 folder:/unsorted 视图后 ⌘V → 素材移入该分组
 * （复用 assignPhotosToFolder 的移动语义）；其余视图提示后中止。
 */
import { ref } from 'vue'
import { useToast } from '@composables/useToast'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoData } from './usePhotoData'
import { usePhotoSelection } from './usePhotoSelection'

const toast = useToast()

/** 粘贴目标解析（纯函数便于单测）：folder:x → x；unsorted → null（移出）；其余 → 'blocked' */
export function resolvePasteTarget(view: string): string | null | 'blocked' {
  if (view.startsWith('folder:')) return view.slice(7)
  if (view === 'unsorted') return null
  return 'blocked'
}

function build() {
  const tabs = useLibraryTabs()
  const data = usePhotoData()
  const { selectedIds } = usePhotoSelection()

  /** 剪切待粘贴的素材 id（Eagle：剪切后缩略图半透明） */
  const cutPhotoIds = ref<string[]>([])
  /** 剪切时的原文件夹快照（撤销恢复用） */
  const cutFrom = new Map<string, string | null>()

  /** ⌘X：剪切当前选中（快照原文件夹供撤销） */
  function cutSelection(ids?: string[]): void {
    const target = ids && ids.length > 0 ? ids : [...selectedIds.value]
    if (target.length === 0) return
    cutFrom.clear()
    // byIds O(1) 索引：逐 id allPhotos.find 是 O(S×N)；索引里没有的 id（已被删）
    // 本来也无法恢复，跳过等价于旧的 null 条目
    for (const p of data.byIds(target)) {
      cutFrom.set(p.id, p.folderId ?? null)
    }
    cutPhotoIds.value = target
    toast.info(`已剪切 ${target.length} 项`, { description: '进入目标文件夹后 ⌘V 粘贴' })
  }

  function clearCut(): void {
    cutPhotoIds.value = []
    cutFrom.clear()
  }

  /** ⌘V（内部剪切态）：移动到当前视图对应分组；返回是否消费了本次粘贴事件 */
  async function pasteMove(): Promise<boolean> {
    if (cutPhotoIds.value.length === 0) return false
    const target = resolvePasteTarget(tabs.activeView)
    if (target === 'blocked') {
      toast.warning('请先进入目标文件夹（或未分类）再粘贴')
      return true
    }
    const ids = [...cutPhotoIds.value]
    const from = new Map(cutFrom)
    const folder = target ? data.folders.value.find((f) => f.id === target) : null
    try {
      await window.api.photos.assignPhotosToFolder(target, ids)
      await data.loadFolders()
      await data.refreshAllPools()
      toast.success(`已移动 ${ids.length} 项到「${folder?.name ?? '未分类'}」`, {
        action: { label: '撤销', onClick: () => void undoMove(ids, from) }
      })
    } catch (error) {
      toast.error('移动失败', { description: (error as Error).message })
    } finally {
      clearCut()
    }
    return true
  }

  /** 撤销：按原文件夹分组归还 */
  async function undoMove(ids: string[], from: Map<string, string | null>): Promise<void> {
    const groups = new Map<string | null, string[]>()
    for (const id of ids) {
      const origin = from.get(id) ?? null
      const list = groups.get(origin) ?? []
      list.push(id)
      groups.set(origin, list)
    }
    try {
      for (const [folderId, groupIds] of groups) {
        await window.api.photos.assignPhotosToFolder(folderId, groupIds)
      }
      await data.loadFolders()
      await data.refreshAllPools()
    } catch (error) {
      toast.error('撤销失败', { description: (error as Error).message })
    }
  }

  return { cutPhotoIds, cutSelection, clearCut, pasteMove }
}

type PhotoClipboard = ReturnType<typeof build>

let singleton: PhotoClipboard | null = null

export function usePhotoClipboard(): PhotoClipboard {
  if (!singleton) singleton = build()
  return singleton
}
