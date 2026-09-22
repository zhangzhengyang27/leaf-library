/**
 * Leaf 素材库 · 键盘导航与多选（D-008 新增）
 *
 * 统一接管窗口级键盘：
 * - ↑↓←→ 移动高亮（扁平展示顺序，跨 section 连续）
 * - Enter 预览高亮项 / Esc 关预览·退选择
 * - Space QuickLook（保留原让路规则：表单焦点/弹窗打开/锁屏/地图视图）
 * - ⌘A 全选、Delete 移除选中、⌘F 聚焦搜索
 * 多选（⌘click / Shift-click）的点击入口在 PhotoGrid/PhotoListView，
 * 范围选取共用本模块的 flat 顺序与 anchor。
 */
import { ref, type Ref } from 'vue'
import { isPlayableVideoFile } from '@shared/assetTypes'
import type { Photo } from '@renderer/types/photo'
import { useDialogs } from './useDialogs'
import { usePhotoClipboard } from './usePhotoClipboard'
import { usePhotoFilters } from './usePhotoFilters'
import { usePhotoActions } from './usePhotoActions'
import { usePreview } from './usePreview'

/** 键盘高亮项（网格/列表渲染 focus ring 用） */
const navActiveId = ref<string | null>(null)

/** Shift 连选锚点（扁平索引） */
let anchorIndex = -1

interface KeyboardCtx {
  selectedIds: Ref<string[]>
  isSelectionMode: Ref<boolean>
  anyModalOpen: () => boolean
  focusSearch: () => void
  scrollToPhoto: (id: string) => void
  selectMaybeAll: () => void
  /** D-012 F2 就地重命名（仅在单选时触发） */
  beginRename?: () => void
  /** R5 F8 进入高级模式（检查器信息全展开） */
  toggleAdvancedMode?: () => void
  /** 十八轮 P3 F5 进入简报模式（全屏幻灯片） */
  toggleBriefMode?: () => void
  /** R5 ⌘G 黑白预览（预览内切换，不用退回网格右键） */
  toggleGrayscale?: () => void
  /** 当前是否处于简报模式（预览打开时键盘层让路 PhotoPreview 的 ←→/空格） */
  isBriefMode?: () => boolean
  /** R2 ⌘D 创建副本（单选） */
  duplicateSelected?: () => void
  /** R2 ⌥⌘C 复制文件路径 */
  copyPath?: () => void
  /** 对齐菜单「复制文件 ⌘C」：原文件复制到系统剪贴板 */
  copyFiles?: () => void
  /** 八轮：⌘⇧N 新增文件夹（Eagle create.folder） */
  createFolder?: () => void
  /** 八轮：⌘⇧T 打开标签筛选弹层（Eagle open.tagfilter） */
  openTagFilter?: () => void
}

function isFormTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.tagName === 'BUTTON' || // 保留按钮的空格键盘激活（审查 B4）
    el.isContentEditable
  )
}

function build() {
  const filters = usePhotoFilters()
  const preview = usePreview()
  const actions = usePhotoActions()
  const clipboard = usePhotoClipboard()
  const { pendingConfirm } = useDialogs()

  /** 由 index.vue 注入的上下文（弹窗开关聚合 + 选中态） */
  let ctx: KeyboardCtx | null = null

  function bind(context: KeyboardCtx): void {
    ctx = context
  }

  const flat = (): Photo[] => filters.flatDisplayPhotos.value

  function setSelection(ids: string[]): void {
    if (!ctx) return
    ctx.selectedIds.value = ids
    if (ids.length > 0) ctx.isSelectionMode.value = true
  }

  function moveNav(delta: number, extend: boolean): void {
    const pool = flat()
    if (pool.length === 0) return
    const currentId = navActiveId.value
    const currentIdx = currentId ? pool.findIndex((p) => p.id === currentId) : -1
    const nextIdx = Math.max(0, Math.min(pool.length - 1, currentIdx + delta))
    const target = pool[nextIdx]
    if (!target) return
    navActiveId.value = target.id
    ctx?.scrollToPhoto(target.id)
    if (extend && anchorIndex >= 0) {
      const [from, to] = [Math.min(anchorIndex, nextIdx), Math.max(anchorIndex, nextIdx)]
      setSelection(pool.slice(from, to + 1).map((p) => p.id))
    }
  }

  function handleClickSelect(
    photoId: string,
    e: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
  ): void {
    const pool = flat()
    const idx = pool.findIndex((p) => p.id === photoId)
    if (e.shiftKey && anchorIndex >= 0 && idx >= 0) {
      const [from, to] = [Math.min(anchorIndex, idx), Math.max(anchorIndex, idx)]
      setSelection(pool.slice(from, to + 1).map((p) => p.id))
      return
    }
    if (idx >= 0) anchorIndex = idx
    if ((e.metaKey || e.ctrlKey) && ctx) {
      if (!ctx.isSelectionMode.value) ctx.isSelectionMode.value = true
      const has = ctx.selectedIds.value.includes(photoId)
      setSelection(
        has
          ? ctx.selectedIds.value.filter((x) => x !== photoId)
          : [...ctx.selectedIds.value, photoId]
      )
      navActiveId.value = photoId
      return
    }
    navActiveId.value = photoId
  }

  function handleGlobalKeydown(e: KeyboardEvent): void {
    if (actions.locked.value) return // 锁屏状态下不响应（审查 B3）
    if (e.repeat && !e.key.startsWith('Arrow')) return

    // 预览打开时：←→ 翻页、Esc/空格 关闭（QuickLook 语义）
    // 简报模式下 ←→/空格由 PhotoPreview 自行处理（否则双消费一次按跳两张）；
    // F5 在简报内 = 退出（PhotoPreview 注释承诺过，这里补上实现）
    if (preview.previewPhoto.value) {
      // 预览内有表单（描述 textarea / 添加标签 input）：ESC 与 ←→ 属于输入与光标移动，
      // 不能被关掉预览/翻页吃掉——空格会打断输入并丢弃未提交的描述，
      // ←→ 会翻页并因 photo.id 变更重置草稿。F5 不是输入键，保留。
      // ESC 只对文本控件让路（不含按钮）：点过工具栏后焦点停在按钮上，
      // 此时 ESC 仍须能关预览。
      const inTextField = !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select')
      if (e.key === 'F5') {
        e.preventDefault()
        ctx?.toggleBriefMode?.()
      } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyG') {
        e.preventDefault()
        ctx?.toggleGrayscale?.()
      } else if (e.key === 'Escape') {
        if (!inTextField) {
          e.preventDefault()
          preview.close()
        }
      } else if (!inTextField && !ctx?.isBriefMode?.()) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          preview.previous()
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          preview.next()
        } else if (e.code === 'Space' && !isFormTarget(e.target)) {
          // QuickLook 习惯：预览中再按空格 = 关闭（焦点在输入控件/按钮上时让路）。
          // 可内联播放的视频与音频例外——空格归播放/暂停，由 PhotoPreview 处理。
          const cur = preview.previewPhoto.value
          if (cur?.kind === 'audio') return
          if (cur?.kind === 'video' && isPlayableVideoFile(cur.fileName)) return
          e.preventDefault()
          preview.close()
        }
      }
      return
    }

    if (isFormTarget(e.target)) return
    if (ctx?.anyModalOpen() || pendingConfirm.value) return

    // 弹窗/表单之外的窗口级快捷键。
    // 字母键一律用 e.code 判定：macOS 上 ⌥（Alt）会改写 e.key（⌥⌘C 是 'ç'），
    // 按 key 匹配会让 ⌥⌘C 这类组合永远匹配不上
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.code === 'KeyA') {
      e.preventDefault()
      if (filters.isTrashView.value || filters.isMapView.value) return
      ctx?.selectMaybeAll()
      return
    }
    if (meta && e.code === 'KeyF') {
      e.preventDefault()
      ctx?.focusSearch()
      return
    }
    // F1 ⌘X 剪切选中（内部剪贴板；⌘V 粘贴即移动，优先于文件导入）
    if (meta && !e.shiftKey && !e.altKey && e.code === 'KeyX') {
      if (ctx && ctx.selectedIds.value.length > 0 && !filters.isTrashView.value) {
        e.preventDefault()
        clipboard.cutSelection()
      }
      return
    }
    if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) {
      // 对齐菜单标注「丢到回收站 ⌘⌫」：裸 Backspace 不再直接删除（易误删），
      // 键盘上的 Delete 键（fn+⌫）保持可用
      if (ctx && ctx.selectedIds.value.length > 0 && !filters.isTrashView.value) {
        e.preventDefault()
        actions.handleDeleteIds([...ctx.selectedIds.value])
      }
      return
    }
    // 十八轮 P3 F5 简报模式（全屏幻灯片）
    if (e.key === 'F5') {
      e.preventDefault()
      ctx?.toggleBriefMode?.()
      return
    }
    // R5 F8 高级模式（检查器信息全展开）
    if (e.key === 'F8') {
      e.preventDefault()
      ctx?.toggleAdvancedMode?.()
      return
    }
    // R2 ⌘D 创建副本（单选）
    if (meta && e.code === 'KeyD' && !e.altKey) {
      if (
        ctx?.duplicateSelected &&
        ctx.selectedIds.value.length === 1 &&
        !filters.isTrashView.value
      ) {
        e.preventDefault()
        ctx.duplicateSelected()
      }
      return
    }
    // 八轮 ⌘⇧N 新增文件夹 / ⌘⇧T 标签筛选（Eagle keybinds: create.folder / open.tagfilter）
    if (meta && e.shiftKey && !e.altKey) {
      if (e.code === 'KeyN') {
        e.preventDefault()
        ctx?.createFolder?.()
        return
      }
      if (e.code === 'KeyT') {
        e.preventDefault()
        ctx?.openTagFilter?.()
        return
      }
    }
    // 八轮 ⌘J 快速搜索（Eagle quicksearch，与 ⌘F 同为聚焦搜索）
    if (meta && !e.shiftKey && !e.altKey && e.code === 'KeyJ') {
      e.preventDefault()
      ctx?.focusSearch()
      return
    }
    // R2 ⌥⌘C 复制文件路径
    if (meta && e.altKey && e.code === 'KeyC') {
      if (ctx?.copyPath && ctx.selectedIds.value.length > 0) {
        e.preventDefault()
        ctx.copyPath()
      }
      return
    }
    // 对齐菜单「复制文件 ⌘C」：复制原文件到系统剪贴板（Finder 可粘贴）。
    // macOS 上该组合键经编辑菜单项 → 合成 keydown 到达（原生菜单会吞键）
    if (meta && !e.altKey && !e.shiftKey && e.code === 'KeyC') {
      if (ctx?.copyFiles && ctx.selectedIds.value.length > 0) {
        e.preventDefault()
        ctx.copyFiles()
      }
      return
    }
    // 对齐菜单「重命名 ⌘R」（与 F2 等效，单选）
    if (meta && !e.altKey && !e.shiftKey && e.code === 'KeyR') {
      if (ctx?.beginRename && ctx.selectedIds.value.length === 1 && !filters.isTrashView.value) {
        e.preventDefault()
        ctx.beginRename()
      }
      return
    }
    // D-012 F2 就地重命名（单选）
    if (e.key === 'F2') {
      if (ctx?.beginRename && ctx.selectedIds.value.length === 1 && !filters.isTrashView.value) {
        e.preventDefault()
        ctx.beginRename()
      }
      return
    }
    if (e.key === 'Escape') {
      if (ctx && ctx.selectedIds.value.length > 0) {
        ctx.selectedIds.value = []
        ctx.isSelectionMode.value = false
        navActiveId.value = null
      }
      clipboard.clearCut()
      return
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      const delta =
        e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -6 : 6
      moveNav(delta, e.shiftKey)
      return
    }
    if (e.key === 'Enter' && navActiveId.value) {
      e.preventDefault()
      const photo = flat().find((p) => p.id === navActiveId.value)
      if (photo) preview.openPhoto(photo)
      return
    }
    // 空格 QuickLook（原六期逻辑：锚点为最近查看项）。
    // 回收站/查重/相似视图同样可预览（旧实现被 showFilters 条件误伤），
    // 仅地图视图让路
    if (e.code === 'Space') {
      if (filters.isMapView.value) return
      e.preventDefault()
      if (preview.previewPhoto.value) {
        preview.close()
        return
      }
      const pool = flat()
      if (pool.length === 0) return
      // 锚点优先级：唯一选中项 → 键盘高亮项 → 最近查看项 → 池首。
      // 只认「最近查看」会无视用户刚点的那一行：列表页点第 7 行再按空格，
      // 弹出来的是池首第 1 个素材
      const onlySelected =
        ctx && ctx.selectedIds.value.length === 1 ? ctx.selectedIds.value[0] : null
      const anchorId = onlySelected ?? navActiveId.value ?? preview.lastViewedId.value
      const anchor = anchorId ? pool.find((p) => p.id === anchorId) : undefined
      preview.openPhoto(anchor ?? pool[0])
    }
  }

  function bindWindow(): () => void {
    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
  }

  return {
    navActiveId,
    bind,
    bindWindow,
    handleClickSelect,
    clearNav: () => {
      navActiveId.value = null
    }
  }
}

type Keyboard = ReturnType<typeof build>

let singleton: Keyboard | null = null

export function usePhotoKeyboard(): Keyboard {
  if (!singleton) singleton = build()
  return singleton
}
