/**
 * Leaf 素材库 · 文件夹卡片动作层（特性：父文件夹视图的子文件夹卡片）
 *
 * 网格/列表里的文件夹卡片复用侧栏同款链路，本 composable 是它们的单点出口：
 * - openFolderView：双击进入 = 侧栏 openItem 的导航语义（含密码解锁前置，R4）；
 * - openFolderCardMenu：右键菜单挂侧栏 openFolderMenu 的既有项（打开/重命名/
 *   「在父文件夹显示子文件夹内容」/删除）。侧栏完整菜单与 LibraryPanel 本地态
 *   （快速访问/排列/展开树）强耦合，按任务口径只挂这四个既有项；item 的
 *   key/label/icon 与侧栏菜单逐字对齐，行为链全部走既有单例（actions/dialogs）；
 * - dropPhotosToFolderCard：拖拽落点 = 侧栏行 onDrop 同款（库内素材移入 +
 *   外部文件导入该文件夹，stopPropagation 防 window 级 drop 再导一遍）。
 *
 * 模块级单例（与 usePhotoData 同范式）；解锁集独立于侧栏（侧栏的
 * unlockedFolderIds 是其组件本地态，不动它的树逻辑——本表仅卡片侧记账）。
 */
import { useContextMenu, type MenuItem } from '@composables/useContextMenu'
import { useRouter } from 'vue-router'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoData } from './usePhotoData'
import { usePhotoActions } from './usePhotoActions'
import { usePhotoImport } from './usePhotoImport'
import { useDialogs } from './useDialogs'
import { useToast } from '@composables/useToast'

/** 卡片侧的会话内解锁记账（侧栏解锁过的文件夹在卡片侧会再次询问，v1 边界） */
const cardUnlockedFolderIds = new Set<string>()

export function useFolderCardActions() {
  const menu = useContextMenu()
  const router = useRouter()
  const tabs = useLibraryTabs()
  const data = usePhotoData()
  const actions = usePhotoActions()
  const photoImport = usePhotoImport()
  const { requestPrompt } = useDialogs()

  /** 与侧栏 openItem 同款的导航（folder:id 视图 + 回图库路由） */
  function navigateToFolder(fid: string): void {
    const folder = data.folders.value.find((f) => f.id === fid)
    tabs.setView(`folder:${fid}`, folder?.name ?? '文件夹')
    router.push('/photos').catch(() => {
      /* 已在图库 */
    })
  }

  /** 双击进入：带密码的文件夹先解锁（侧栏 openItem 同款两段式） */
  function openFolderView(fid: string): void {
    const folder = data.folders.value.find((f) => f.id === fid)
    if (folder?.hasPassword && !cardUnlockedFolderIds.has(fid)) {
      requestPrompt({
        title: `「${folder.name}」已加密`,
        label: '输入文件夹密码',
        initialValue: '',
        confirmLabel: '解锁',
        onSubmit: async (pw) => {
          const ok = await window.api.photos.verifyFolderPassword(fid, pw)
          if (ok) {
            cardUnlockedFolderIds.add(fid)
            navigateToFolder(fid)
          } else {
            useToast().error('密码错误')
          }
        }
      })
      return
    }
    navigateToFolder(fid)
  }

  /** 锁定文件夹的重命名/删除：先解锁再执行（侧栏菜单同款门禁） */
  function withFolderUnlock(fid: string, run: () => void): void {
    const folder = data.folders.value.find((f) => f.id === fid)
    if (folder?.hasPassword && !cardUnlockedFolderIds.has(fid)) {
      requestPrompt({
        title: `「${folder.name}」已加密`,
        label: '输入文件夹密码',
        initialValue: '',
        confirmLabel: '解锁',
        onSubmit: async (pw) => {
          const ok = await window.api.photos.verifyFolderPassword(fid, pw)
          if (!ok) {
            useToast().error('密码错误')
            return
          }
          cardUnlockedFolderIds.add(fid)
          run()
        }
      })
      return
    }
    run()
  }

  /** 「在父文件夹显示子文件夹内容」= 该文件夹的 includeSubfolders 视图覆盖翻转
   *  （侧栏 toggleShowSubContent 同款：写 m005 视图覆盖 JSON 后重拉 folders） */
  function toggleFolderIncludesSubfolders(fid: string): void {
    const f = data.folders.value.find((x) => x.id === fid)
    if (!f) return
    const display: Record<string, boolean> = {}
    if (f.viewDisplay) {
      try {
        Object.assign(display, JSON.parse(f.viewDisplay) as Record<string, boolean>)
      } catch {
        /* 容错 */
      }
    }
    display.includeSubfolders = !display.includeSubfolders
    void window.api.photos
      .setFolderViewSettings(fid, {
        layout: f.viewLayout ?? null,
        sort: f.viewSort ?? null,
        display: JSON.stringify(display)
      })
      .then(() => data.loadFolders())
      .catch((err: Error) => useToast().error('设置失败', { description: err.message }))
  }

  /** 卡片右键菜单（打开/重命名/显示子文件夹内容/删除——侧栏 openFolderMenu 的既有项子集） */
  function openFolderCardMenu(fid: string, x: number, y: number): void {
    const folder = data.folders.value.find((f) => f.id === fid)
    const items: MenuItem[] = [
      { key: 'open', label: '打开', icon: 'ic-arrow-right' },
      { key: 'd1', divider: true },
      { key: 'rename', label: '重命名', icon: 'context-menu/ic-rename', shortcut: '⌘R' },
      {
        key: 'show-sub',
        label: '在父文件夹显示子文件夹内容',
        icon: 'context-menu/ic-folder-show-sub-folder-content',
        checked: folder?.viewDisplay
          ? (() => {
              try {
                return (
                  (JSON.parse(folder.viewDisplay) as Record<string, boolean>).includeSubfolders ===
                  true
                )
              } catch {
                return false
              }
            })()
          : false
      },
      { key: 'd2', divider: true },
      {
        key: 'delete',
        label: '删除文件夹',
        icon: 'context-menu/ic-folder-remove',
        shortcut: '⌘⌫',
        danger: true
      }
    ]
    menu.open(
      x,
      y,
      items,
      (key) => {
        if (key === 'open') openFolderView(fid)
        else if (key === 'show-sub') toggleFolderIncludesSubfolders(fid)
        else if (key === 'rename') withFolderUnlock(fid, () => actions.startFolderInlineRename(fid))
        else if (key === 'delete')
          withFolderUnlock(fid, () => actions.deleteFolderById(fid, folder?.name ?? '文件夹'))
      },
      { searchable: true }
    )
  }

  /** 库内素材载荷判定（侧栏 hasPhotoPayload 同款） */
  function hasPhotoPayload(e: DragEvent): boolean {
    return e.dataTransfer?.types.includes('application/x-leaf-photos') === true
  }

  /** 拖拽落到卡片：库内素材移入该文件夹；外部文件导入该文件夹（侧栏 onDrop 同款） */
  function dropPhotosToFolderCard(fid: string, e: DragEvent): void {
    if (!hasPhotoPayload(e)) {
      // 外部（Finder）拖入：导入到卡片对应的文件夹。必须 stopPropagation：
      // 否则 window 级 drop 会再导一遍，而且落点会变成「当前视图」
      if (e.dataTransfer?.types.includes('Files')) {
        e.stopPropagation()
        void photoImport.dropFilesTo(e, fid)
      }
      return
    }
    e.preventDefault()
    const raw = e.dataTransfer?.getData('application/x-leaf-photos')
    if (!raw) return
    let ids: string[] = []
    try {
      ids = JSON.parse(raw) as string[]
    } catch {
      return
    }
    if (ids.length === 0) return
    // 与侧栏同链路：addToFolder 内部落库后刷新 folders/未分类池/文件夹池
    actions.addToFolder(fid, ids)
  }

  return {
    openFolderView,
    openFolderCardMenu,
    hasPhotoPayload,
    dropPhotosToFolderCard
  }
}
