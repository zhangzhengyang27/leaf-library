<script setup lang="ts">
/**
 * LibraryPanel · Eagle 式树形侧栏（D-011 + 三轮 G3~G7/G10 对齐 Eagle 实测）
 *
 * 结构（Eagle 4 实测）：
 * 库名行（库名 ▼ 切换 / 点击回「全部」）
 * → 固定项：全部 / 未分类 / 未标签 / 随机模式 / 标签管理 / 回收站（资源社区为有意差异不做）
 * → 智能文件夹组（组头无计数；预置行=收藏/最近添加/最近查看；＋常驻）
 * → 文件夹组（组头带总数+折叠；树行带 ▸ 逐行折叠、计数右对齐）
 * → 相册组（Leaf 扩展组，Eagle 无手动相册——功能依赖侧栏入口，样式与其余组一致）
 * → 底部筛选框。
 * Eagle 侧栏无标签组（标签归「标签管理」页），三轮已移除。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDialogs } from '../composables/useDialogs'
import { useToast } from '@composables/useToast'
import AppIcon from '@components/AppIcon.vue'
import UTooltip from '@components/ui/UTooltip.vue'
import { useContextMenu, type MenuItem } from '@composables/useContextMenu'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoData } from '../composables/usePhotoData'
import { usePhotoActions } from '../composables/usePhotoActions'
import { usePhotoImport } from '../composables/usePhotoImport'
import PanelRow from './LibraryPanelRow.vue'
import AutoTagModal from './AutoTagModal.vue'
import type { PhotoFolder } from '../../../types/photo'

const router = useRouter()
const route = useRoute()
const menu = useContextMenu()
const tabs = useLibraryTabs()
const data = usePhotoData()
const actions = usePhotoActions()
// 侧栏文件夹行接外部拖入：与网格共用同一个导入漏斗（模块单例）
const photoImport = usePhotoImport()

interface TreeItem {
  key: string
  view: string
  title: string
  icon: string
  count?: number
  color?: string | null
  /** 为 true 时用 color 给图标染色（如文件夹）；为 false/缺省则 color 仅渲染为色点 */
  tintIcon?: boolean
  /** R5 文件夹封面缩略图（存在时替代图标） */
  coverUrl?: string
  /** 二十四轮：emoji 图标（Eagle 文件夹图标，存在时替代图形图标） */
  emoji?: string
}

// ── 固定项（三轮 G3：全部 / 未分类 / 未标签 / 最近使用 / 随机模式 / 标签管理 / 回收站；
//    十五轮批6 补「最近使用」——Eagle 4.0 固定项实测，位于 未标签 与 随机模式 之间）──

const fixedItems = computed<TreeItem[]>(() => [
  {
    key: 'all',
    view: 'all',
    title: '全部',
    icon: 'ic_all',
    count: data.sidebarCounts.value.all
  },
  {
    key: 'unsorted',
    view: 'unsorted',
    title: '未分类',
    icon: 'ic_tagUncategorized',
    count: data.unsortedPhotos.value.length
  },
  {
    key: 'untagged',
    view: 'untagged',
    title: '未标签',
    icon: 'ic_untaggeds',
    count: data.sidebarCounts.value.untagged
  },
  {
    key: 'recents',
    view: 'recents',
    title: '最近使用',
    icon: 'ic_clock',
    count: data.sidebarCounts.value.recentViewed
  },
  { key: 'random', view: 'random', title: '随机模式', icon: 'ic_random' },
  { key: 'tag-manager', view: '', title: '标签管理', icon: 'ic_tagAll' },
  {
    key: 'trash',
    view: 'trash',
    title: '回收站',
    icon: 'ic_trashbin',
    count: data.recycleCount.value
  }
])

onMounted(() => {
  // 预拉固定入口数据（用于计数）
  void data.loadUnsorted()
  void data.loadRecent()
})

// ── 小节：智能文件夹（预置行 + 用户智能夹）/ 文件夹 / 相册 ──

const smartItems = computed<TreeItem[]>(() =>
  data.smartAlbums.value.map((a) => ({
    key: `smart:${a.id}`,
    view: `smart:${a.id}`,
    title: a.name,
    icon: 'context-menu/ic-smart-folder-rule'
  }))
)

const albumItems = computed<TreeItem[]>(() =>
  data.albums.value.map((a) => ({
    key: `album:${a.id}`,
    view: `album:${a.id}`,
    title: a.name,
    icon: 'ic_box',
    count: a.photoCount
  }))
)

/** 二十四轮：Eagle 文件夹图标为统一灰蓝色（不再按名称派生彩虹色）；
 *  用户在右键菜单设置的颜色（f.color）优先 */
const EAGLE_FOLDER_COLOR = '#64748b'

// ── 二十四轮：快速访问（Eagle 右键「添加至"快速访问"」，localStorage 收藏文件夹 id）──

const QUICK_KEY = 'leaf.quick-access'
const quickAccessIds = ref<Set<string>>(loadQuickAccess())
function loadQuickAccess(): Set<string> {
  try {
    const raw = localStorage.getItem(QUICK_KEY)
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set<string>()
  }
}
function toggleQuickAccess(fid: string): void {
  const next = new Set(quickAccessIds.value)
  if (next.has(fid)) next.delete(fid)
  else next.add(fid)
  quickAccessIds.value = next
  try {
    localStorage.setItem(QUICK_KEY, JSON.stringify([...next]))
  } catch {
    /* ignore */
  }
}

/** 快速访问分组行（指向 folder 视图，星形图标） */
const quickItems = computed<TreeItem[]>(() =>
  data.folders.value
    .filter((f) => quickAccessIds.value.has(f.id))
    .map((f) => ({
      key: `quick:${f.id}`,
      view: `folder:${f.id}`,
      title: f.name,
      icon: 'context-menu/ic-favorite-add',
      count: f.photoCount
    }))
)

// ── 二十四轮：文件夹排列（Eagle 右键「排列▸」；自定义 = 数据库顺序）──

type FolderSortMode = 'custom' | 'name' | 'created' | 'modified'
const FOLDER_SORT_KEY = 'leaf.folder-sort'
const folderSort = ref<FolderSortMode>(loadFolderSort())
function loadFolderSort(): FolderSortMode {
  const raw = localStorage.getItem(FOLDER_SORT_KEY)
  return raw === 'name' || raw === 'created' || raw === 'modified' ? raw : 'custom'
}
function setFolderSort(mode: FolderSortMode): void {
  folderSort.value = mode
  try {
    localStorage.setItem(FOLDER_SORT_KEY, mode)
  } catch {
    /* ignore */
  }
}
function sortFolderList(list: typeof data.folders.value): typeof data.folders.value {
  const arr = [...list]
  if (folderSort.value === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  else if (folderSort.value === 'created') arr.sort((a, b) => b.createdAt - a.createdAt)
  else if (folderSort.value === 'modified') arr.sort((a, b) => b.updatedAt - a.updatedAt)
  return arr
}

// ── G7 文件夹树：逐行折叠（展开态 localStorage 持久化；默认全部折叠，根级常驻）──

const EXPANDED_KEY = 'leaf.sidebar-folder-expanded'
function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY)
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set<string>()
  }
}
const expandedFolderIds = ref<Set<string>>(loadExpanded())

function toggleFolderExpand(fid: string): void {
  const next = new Set(expandedFolderIds.value)
  if (next.has(fid)) next.delete(fid)
  else next.add(fid)
  expandedFolderIds.value = next
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
  } catch {
    /* ignore */
  }
}

interface FlatFolder {
  item: TreeItem
  depth: number
  hasChildren: boolean
  expanded: boolean
}
/** 文件夹树：按 parentId 递归拍平；仅展开的节点递归子级（Eagle 逐行折叠）；
 *  同级按「排列」排序（自定义 = 数据库顺序） */
const flatFolders = computed<FlatFolder[]>(() => {
  const byParent = new Map<string | null, typeof data.folders.value>()
  for (const f of data.folders.value) {
    const key = f.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(f)
  }
  const out: FlatFolder[] = []
  const walk = (parentId: string | null, depth: number): void => {
    for (const f of sortFolderList(byParent.get(parentId) ?? [])) {
      const children = byParent.get(f.id) ?? []
      const expanded = expandedFolderIds.value.has(f.id)
      out.push({
        item: {
          key: `folder:${f.id}`,
          view: `folder:${f.id}`,
          title: f.hasPassword && !unlockedFolderIds.value.has(f.id) ? `${f.name} 🔒` : f.name,
          icon: 'ic_folder-close',
          count: f.photoCount,
          color: f.color ?? EAGLE_FOLDER_COLOR,
          tintIcon: true,
          coverUrl: f.coverPhotoId ? `thumb://256/${f.coverPhotoId}` : undefined,
          emoji: f.icon
        },
        depth,
        hasChildren: children.length > 0,
        expanded
      })
      if (expanded) walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

const isActive = (view: string): boolean => tabs.activeView === view
const inTagManager = computed(() => String(route.name || '') === 'tags')

// ── 二十四轮：Eagle 式行内新建/重命名（无弹窗）──

/** 当前正在行内重命名的文件夹 id（actions 单例共享；侧栏渲染编辑行） */
const renamingFolderId = computed(() => actions.renamingFolderId.value)

/** Eagle：新建后自动展开父链、跳入新文件夹视图，行进入编辑态 */
watch(renamingFolderId, (fid) => {
  if (!fid) return
  const folder = data.folders.value.find((f) => f.id === fid)
  if (!folder) return
  if (folder.parentId) {
    const next = new Set(expandedFolderIds.value)
    let pid: string | null | undefined = folder.parentId
    const seen = new Set<string>()
    while (pid && !seen.has(pid)) {
      seen.add(pid)
      next.add(pid)
      pid = data.folders.value.find((f) => f.id === pid)?.parentId ?? null
    }
    expandedFolderIds.value = next
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
    } catch {
      /* ignore */
    }
  }
  tabs.setView(`folder:${fid}`, folder.name)
  router.push('/photos').catch(() => {
    /* 已在图库 */
  })
})

function commitFolderRename(fid: string, value: string): void {
  void actions.commitFolderInlineRename(fid, value)
}
function cancelFolderRename(): void {
  actions.cancelFolderInlineRename()
}

function openItem(item: TreeItem): void {
  // 「标签管理」不是视图：打开标签管理页（Eagle 固定项）
  if (item.key === 'tag-manager') {
    openTagManager()
    return
  }
  // R4：带密码的文件夹需先解锁（本会话内记住）
  if (item.view.startsWith('folder:')) {
    const fid = item.view.slice(7)
    const folder = data.folders.value.find((f) => f.id === fid)
    if (folder?.hasPassword && !unlockedFolderIds.value.has(fid)) {
      requestPrompt({
        title: `「${folder.name}」已加密`,
        label: '输入文件夹密码',
        initialValue: '',
        confirmLabel: '解锁',
        onSubmit: async (pw) => {
          const ok = await window.api.photos.verifyFolderPassword(fid, pw)
          if (ok) {
            unlockedFolderIds.value.add(fid)
            tabs.setView(item.view, item.title)
            router.push('/photos').catch(() => {})
          } else {
            useToast().error('密码错误')
          }
        }
      })
      return
    }
  }
  tabs.setView(item.view, item.title)
  router.push('/photos').catch(() => {
    /* 已在图库 */
  })
}

/** 点击库名回「全部」已并入「全部」固定项（Eagle：库名行=切换菜单） */

// ── 右键菜单 ──

function openAlbumMenu(item: TreeItem, e: MouseEvent): void {
  menu.open(
    e.clientX,
    e.clientY,
    [
      { key: 'open', label: '打开', icon: 'ic-arrow-right' },
      { key: 'd1', divider: true },
      { key: 'rename', label: '重命名', icon: 'context-menu/ic-rename' },
      { key: 'delete', label: '删除相册', icon: 'context-menu/ic-file-move-trash', danger: true }
    ],
    (key) => {
      if (key === 'open') openItem(item)
      else if (key === 'rename') actions.renameAlbumById(item.key.slice(6), item.title)
      else if (key === 'delete') actions.deleteAlbumById(item.key.slice(6), item.title)
    }
  )
}

/** G10：文件夹右键对齐 Eagle（打开/在新窗口中打开/重命名/改变颜色/新建/删除；
 *  「在访达中显示」不实现——Leaf 文件夹为虚拟分组，无磁盘位置） */
/** D19：Eagle 色板（存储 hex；空串=恢复自动色），以菜单色点行呈现（Eagle 同款） */
const FOLDER_COLORS: Array<{ key: string; hex: string }> = [
  { key: '无颜色', hex: '#e8e8e8' },
  { key: '红', hex: '#e54545' },
  { key: '橙', hex: '#f29a3a' },
  { key: '黄', hex: '#e8c93a' },
  { key: '绿', hex: '#5bb85d' },
  { key: '青', hex: '#3ac9d9' },
  { key: '蓝', hex: '#3a7af2' },
  { key: '紫', hex: '#9a5bf2' },
  { key: '粉', hex: '#f25bc8' }
]

function applyFolderColor(fid: string, hex: string | null): void {
  void window.api.photos
    .setFolderColor(fid, hex || null)
    .then(() => data.loadFolders())
    .catch((err: Error) => useToast().error('设置文件夹颜色失败', { description: err.message }))
}

/** 展开/收起：单个文件夹 */
function toggleExpand(fid: string): void {
  toggleFolderExpand(fid)
}
/** 展开/收起同阶层（同级）文件夹 */
function toggleSiblingExpand(fid: string): void {
  const folder = data.folders.value.find((f) => f.id === fid)
  const siblings = data.folders.value.filter(
    (f) => (f.parentId ?? null) === (folder?.parentId ?? null) && f.id !== fid
  )
  const allExpanded = siblings.every((f) => expandedFolderIds.value.has(f.id))
  const next = new Set(expandedFolderIds.value)
  for (const f of siblings) {
    if (allExpanded) next.delete(f.id)
    else next.add(f.id)
  }
  expandedFolderIds.value = next
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
  } catch {
    /* ignore */
  }
}
/** 展开/收起所有文件夹 */
function toggleAllExpand(): void {
  if (expandedFolderIds.value.size > 0) {
    expandedFolderIds.value = new Set()
  } else {
    expandedFolderIds.value = new Set(data.folders.value.map((f) => f.id))
  }
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expandedFolderIds.value]))
  } catch {
    /* ignore */
  }
}

/** 「在父文件夹显示子文件夹内容」= 该文件夹的 includeSubfolders 视图覆盖 */
function folderIncludesSubfolders(fid: string): boolean {
  const f = data.folders.value.find((x) => x.id === fid)
  if (!f?.viewDisplay) return false
  try {
    return (JSON.parse(f.viewDisplay) as Record<string, boolean>).includeSubfolders === true
  } catch {
    return false
  }
}
function toggleShowSubContent(fid: string): void {
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

/** 二十四轮：folder-icon 子菜单的 emoji 候选（Eagle 文件夹图标▸） */
const FOLDER_ICON_EMOJIS = [
  '📁',
  '📂',
  '🗂️',
  '📅',
  '📷',
  '🎨',
  '🎬',
  '🎵',
  '💼',
  '🏠',
  '⭐',
  '❤️',
  '🔥',
  '📚',
  '💡',
  '🛠️'
]

/** 二十四轮：fid 是否为 targetId 的祖先（move 子菜单排除自身后代，防环） */
function isDescendantFolder(targetId: string, fid: string): boolean {
  let pid: string | null | undefined = fid
  const seen = new Set<string>()
  while (pid && !seen.has(pid)) {
    if (pid === targetId) return true
    seen.add(pid)
    pid = data.folders.value.find((f) => f.id === pid)?.parentId ?? null
  }
  return false
}

/** 二十四轮：移动文件夹（改父级） */
function moveFolder(fid: string, target: string | null): void {
  void window.api.photos
    .movePhotoFolder(fid, target)
    .then(() => {
      void data.loadFolders()
      useToast().success(target ? '文件夹已移动' : '已移动到根目录')
    })
    .catch((err: Error) => useToast().error('移动失败', { description: err.message }))
}

/** 二十四轮：克隆文件夹（复制名称+「 副本」、描述、颜色、图标、视图覆盖、自动标签） */
async function cloneFolder(fid: string): Promise<void> {
  const f = data.folders.value.find((x) => x.id === fid)
  if (!f) return
  try {
    const created = await window.api.photos.createPhotoFolder(`${f.name} 副本`, f.parentId)
    if (f.description) await window.api.photos.setFolderDescription(created.id, f.description)
    if (f.color) await window.api.photos.setFolderColor(created.id, f.color)
    if (f.icon) await window.api.photos.setFolderIcon(created.id, f.icon)
    if (f.viewLayout || f.viewSort || f.viewDisplay) {
      await window.api.photos.setFolderViewSettings(created.id, {
        layout: f.viewLayout ?? null,
        sort: f.viewSort ?? null,
        display: f.viewDisplay ?? null
      })
    }
    const autoTags = await window.api.photos.getFolderAutoTags(fid)
    if (autoTags.length > 0) await window.api.photos.setFolderAutoTags(created.id, autoTags)
    await data.loadFolders()
    useToast().success('文件夹已克隆', { description: created.name })
  } catch (error) {
    useToast().error('克隆失败', { description: (error as Error).message })
  }
}

/** 二十四轮：自动标签可视化编辑器（Eagle 设置自动标签对话框） */
const autoTagFolder = ref<PhotoFolder | null>(null)
function openAutoTagDialog(fid: string): void {
  autoTagFolder.value = data.folders.value.find((f) => f.id === fid) ?? null
}
/** 编辑器保存后：刷新列表；若在对话框里改了名，同步当前视图标题 */
function onAutoTagChanged(newName: string): void {
  const fid = autoTagFolder.value?.id
  void data.loadFolders()
  if (fid && newName && newName !== autoTagFolder.value?.name) {
    tabs.retitleByViewPrefix('folder:', fid, newName)
  }
  autoTagFolder.value = null
}

/** 二十四轮：复制文本到剪贴板（navigator.clipboard 失败时回退 execCommand） */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

function openFolderMenu(item: TreeItem, e: MouseEvent): void {
  const fid = item.key.slice(7)
  const folder = data.folders.value.find((f) => f.id === fid)
  const hasPw = folder?.hasPassword === true
  const inQuick = quickAccessIds.value.has(fid)
  const otherLibs = libraryList.value.filter((l) => !l.active)
  const moveTargets: MenuItem[] = [
    {
      key: 'to-root',
      label: '移动到根目录',
      icon: 'context-menu/ic-folder-move',
      disabled: (folder?.parentId ?? null) === null
    },
    ...sortFolderList(data.folders.value)
      .filter((f) => f.id !== fid && !isDescendantFolder(fid, f.id))
      .map((f) => ({
        key: f.id,
        label: f.name,
        icon: 'context-menu/ic-search-scope-folder',
        disabled: (folder?.parentId ?? null) === f.id
      }))
  ]
  menu.open(
    e.clientX,
    e.clientY,
    [
      {
        key: 'new',
        label: '新增文件夹',
        icon: 'context-menu/ic-folder-new-folder',
        shortcut: '⌘⇧N'
      },
      {
        key: 'new-sub',
        label: '新增子文件夹',
        icon: 'context-menu/ic-folder-new-sub-folder',
        shortcut: '⌥N'
      },
      {
        key: 'move',
        label: '移动文件夹',
        icon: 'context-menu/ic-folder-move',
        children: moveTargets
      },
      { key: 'd0', divider: true },
      {
        key: 'quick',
        label: inQuick ? '从"快速访问"移除' : '添加至"快速访问"',
        icon: 'context-menu/ic-favorite-add'
      },
      { key: 'd1', divider: true },
      { key: 'rename', label: '重命名', icon: 'context-menu/ic-rename', shortcut: '⌘R' },
      { key: 'copy-link', label: '复制链接', icon: 'context-menu/ic-folder-copy-link' },
      {
        key: 'auto-tag',
        label: '设置自动标签',
        icon: 'context-menu/ic-folder-auto-tag',
        shortcut: '⌘⇧R'
      },
      {
        key: 'password',
        label: '密码保护',
        icon: 'context-menu/ic-password',
        children: [
          {
            key: 'pw-set',
            label: hasPw ? '更改密码' : '设置密码',
            icon: 'context-menu/ic-password'
          },
          {
            key: 'pw-remove',
            label: '移除密码',
            icon: 'context-menu/ic-file-remove-folder',
            disabled: !hasPw
          }
        ]
      },
      {
        key: 'sort',
        label: '排列',
        icon: 'context-menu/ic-order-by',
        children: (['custom', 'name', 'created', 'modified'] as const).map((mode) => ({
          key: mode,
          label: {
            custom: '自定义',
            name: '名称',
            created: '添加日期',
            modified: '修改日期'
          }[mode],
          checked: folderSort.value === mode
        }))
      },
      { key: 'd2', divider: true },
      { key: 'expand-this', label: '展开/收起文件夹', icon: 'context-menu/ic-expand' },
      {
        key: 'expand-siblings',
        label: '展开/收起同阶层文件夹',
        icon: 'context-menu/ic-expand-same'
      },
      {
        key: 'expand-all',
        label: '展开/收起所有文件夹',
        icon: 'context-menu/ic-expand-all',
        shortcut: '/'
      },
      { key: 'd3', divider: true },
      { key: 'clone', label: '克隆', icon: 'context-menu/ic-clone' },
      { key: 'd4', divider: true },
      {
        key: 'export',
        label: '导出...',
        icon: 'context-menu/ic-export',
        children: [
          {
            key: 'do',
            label: '导出为文件夹',
            icon: 'context-menu/ic-export-computer'
          }
        ]
      },
      {
        key: 'add-lib',
        label: '添加至其它资源库...',
        icon: 'context-menu/ic-folder-add-to',
        children:
          otherLibs.length > 0
            ? otherLibs.map((l) => ({ key: l.id, label: l.name }))
            : [{ key: 'none', label: '没有其它资源库', disabled: true }]
      },
      { key: 'd5', divider: true },
      {
        key: 'show-sub',
        label: '在父文件夹显示子文件夹内容',
        icon: 'context-menu/ic-folder-show-sub-folder-content',
        checked: folderIncludesSubfolders(fid)
      },
      {
        key: 'folder-icon',
        label: '文件夹图标',
        icon: 'context-menu/ic-emoji',
        grid: true,
        children: [
          {
            key: '__none',
            label: '无图标',
            icon: 'context-menu/ic-folder-remove',
            checked: !folder?.icon
          },
          ...FOLDER_ICON_EMOJIS.map((em) => ({
            key: em,
            label: em,
            checked: folder?.icon === em
          }))
        ]
      },
      { key: 'colors', colors: FOLDER_COLORS },
      { key: 'd6', divider: true },
      {
        key: 'delete',
        label: '删除文件夹',
        icon: 'context-menu/ic-folder-remove',
        shortcut: '⌘⌫',
        danger: true
      }
    ],
    (key) => {
      if (key.startsWith('color:folder-icon:')) {
        const dotKey = key.split(':')[2]
        const hex = FOLDER_COLORS.find((c) => c.key === dotKey)?.hex ?? ''
        applyFolderColor(fid, hex === '#e8e8e8' ? '' : hex)
        return
      }
      if (key.startsWith('sub:move:')) {
        const child = key.slice('sub:move:'.length)
        moveFolder(fid, child === 'to-root' ? null : child)
        return
      }
      if (key === 'quick') {
        toggleQuickAccess(fid)
        useToast().success(quickAccessIds.value.has(fid) ? '已添加至快速访问' : '已从快速访问移除')
        return
      }
      if (key === 'copy-link') {
        void copyText(`leaf://folder/${fid}`).then((ok) =>
          ok
            ? useToast().success('链接已复制', { description: `leaf://folder/${fid}` })
            : useToast().error('复制失败')
        )
        return
      }
      if (key === 'auto-tag') {
        openAutoTagDialog(fid)
        return
      }
      if (key === 'sub:password:pw-set') {
        if (!hasPw) {
          requestPrompt({
            title: '设置文件夹密码',
            label: '输入文件夹密码',
            initialValue: '',
            confirmLabel: '保存',
            onSubmit: async (pw) => {
              if (!pw) return
              await window.api.photos.setFolderPassword(fid, pw)
              await data.loadFolders()
              useToast().success('文件夹密码已设置', { description: '打开该文件夹需输入密码' })
            }
          })
          return
        }
        // 已加密：主进程要求先验旧密码（审查 P2-4），故两步收密码。
        // 第二个 prompt 必须等当前这个走完 submit 后再开——UPromptModal 在
        // onSubmit resolve 之后才把 pendingPrompt 置 null，同步嵌套会被它覆盖。
        requestPrompt({
          title: '更改文件夹密码',
          label: '输入当前密码',
          initialValue: '',
          confirmLabel: '下一步',
          onSubmit: async (oldPw) => {
            if (!oldPw) return
            const ok = await window.api.photos.verifyFolderPassword(fid, oldPw).catch(() => false)
            if (!ok) {
              useToast().error('当前密码不正确')
              return
            }
            setTimeout(() => {
              requestPrompt({
                title: '更改文件夹密码',
                label: '输入新密码',
                initialValue: '',
                confirmLabel: '保存',
                onSubmit: async (pw) => {
                  if (!pw) return
                  await window.api.photos.setFolderPassword(fid, pw, oldPw)
                  await data.loadFolders()
                  useToast().success('文件夹密码已更新')
                }
              })
            }, 0)
          }
        })
        return
      }
      if (key === 'sub:password:pw-remove') {
        requestPrompt({
          title: '移除文件夹密码',
          label: '输入原密码',
          initialValue: '',
          confirmLabel: '移除',
          onSubmit: async (pw) => {
            const ok = await window.api.photos.removeFolderPassword(fid, pw)
            if (ok) {
              await data.loadFolders()
              useToast().success('已移除文件夹密码')
            } else {
              useToast().error('密码错误，移除失败')
            }
          }
        })
        return
      }
      if (key.startsWith('sub:sort:')) {
        const mode = key.slice('sub:sort:'.length)
        if (mode === 'name' || mode === 'created' || mode === 'modified' || mode === 'custom') {
          setFolderSort(mode)
        }
        return
      }
      if (key === 'clone') {
        void cloneFolder(fid)
        return
      }
      if (key === 'sub:export:do') {
        void window.api.photos
          .exportFolder(fid)
          .then((n) => useToast().success(`已导出 ${n} 个文件`, { description: '见所选目录' }))
          .catch((err: Error) => useToast().error('导出失败', { description: err.message }))
        return
      }
      if (key.startsWith('sub:add-lib:')) {
        const libId = key.slice('sub:add-lib:'.length)
        const target = libraryList.value.find((l) => l.id === libId)
        if (!target) return
        void window.api.photos
          .getFolderPhotos(fid)
          .then((photos) =>
            window.api.libraries.moveTo(
              libId,
              photos.map((p) => p.id)
            )
          )
          .then((result) => {
            void data.loadFolders()
            useToast().success('已添加至其它资源库', {
              description: `「${target.name}」新增 ${result.moved} 项；重复跳过 ${result.skipped} 项`
            })
          })
          .catch((err: Error) => useToast().error('添加失败', { description: err.message }))
        return
      }
      if (key.startsWith('sub:folder-icon:')) {
        const emoji = key.slice('sub:folder-icon:'.length)
        void window.api.photos
          .setFolderIcon(fid, emoji === '__none' ? null : emoji)
          .then(() => data.loadFolders())
          .catch((err: Error) => useToast().error('设置失败', { description: err.message }))
        return
      }
      if (key === 'new') {
        // 二十四轮（Eagle ⌘⇧N）：无弹窗，根目录立即创建 + 行内命名
        void actions.createFolderInline()
        return
      }
      if (key === 'new-sub') {
        // 二十四轮（Eagle ⌥N）：无弹窗，在该文件夹下立即创建 + 行内命名
        void actions.createFolderInline(fid)
        return
      }
      if (key === 'expand-this') {
        toggleExpand(fid)
        return
      }
      if (key === 'expand-siblings') {
        toggleSiblingExpand(fid)
        return
      }
      if (key === 'expand-all') {
        toggleAllExpand()
        return
      }
      if (key === 'show-sub') {
        toggleShowSubContent(fid)
        return
      }
      // R4：锁定文件夹的重命名/删除需先通过密码验证（title 可能带 🔒 标记，用真实名称）；
      // 未锁定的重命名走侧栏行内编辑（Eagle ⌘R 行为）
      if (folder?.hasPassword && !unlockedFolderIds.value.has(fid)) {
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
            unlockedFolderIds.value.add(fid)
            if (key === 'rename') actions.startFolderInlineRename(fid)
            else if (key === 'delete') actions.deleteFolderById(fid, folder.name)
          }
        })
        return
      }
      if (key === 'rename') actions.startFolderInlineRename(fid)
      else if (key === 'delete') actions.deleteFolderById(fid, folder?.name ?? item.title)
    },
    { searchable: true }
  )
}

/** 二十四轮：快速访问行右键菜单 */
function openQuickMenu(item: TreeItem, e: MouseEvent): void {
  const fid = item.key.slice(6)
  menu.open(
    e.clientX,
    e.clientY,
    [
      { key: 'open', label: '打开', icon: 'ic-arrow-right' },
      { key: 'd1', divider: true },
      {
        key: 'remove',
        label: '从"快速访问"移除',
        icon: 'context-menu/ic-favorite-remove'
      }
    ],
    (key) => {
      if (key === 'open') openItem(item)
      else if (key === 'remove') {
        toggleQuickAccess(fid)
        useToast().success('已从快速访问移除')
      }
    }
  )
}

function openSmartMenu(item: TreeItem, e: MouseEvent): void {
  menu.open(
    e.clientX,
    e.clientY,
    [
      { key: 'open', label: '打开', icon: 'ic-arrow-right' },
      { key: 'd1', divider: true },
      { key: 'edit', label: '编辑规则', icon: 'context-menu/ic-rename' },
      { key: 'delete', label: '删除收藏夹', icon: 'context-menu/ic-file-move-trash', danger: true }
    ],
    (key) => {
      if (key === 'open') openItem(item)
      else if (key === 'edit') {
        const album = data.smartAlbums.value.find((a) => a.id === item.key.slice(6))
        if (album) actions.openSmartAlbumModal(album)
      } else if (key === 'delete') {
        const album = data.smartAlbums.value.find((a) => a.id === item.key.slice(6))
        if (album) actions.deleteSmartAlbumById(album)
      }
    }
  )
}

/** 打开标签管理页（D-013 页化；Eagle 固定项「标签管理」） */
function openTagManager(): void {
  void router.push('/tags')
}

// ── D-013 分组折叠（localStorage 持久化，对齐 Eagle 侧栏组头折叠） ──

const COLLAPSED_KEY = 'leaf.sidebar-collapsed'
function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set<string>()
  }
}
const collapsedGroups = ref<Set<string>>(loadCollapsed())

function toggleGroup(id: string): void {
  const next = new Set(collapsedGroups.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedGroups.value = next
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
  } catch {
    /* ignore */
  }
}

/** D-013 侧栏底部筛选框：按名称过滤树行 */
const sideFilter = ref('')
function matchesFilter(name: string): boolean {
  const q = sideFilter.value.trim().toLowerCase()
  return !q || name.toLowerCase().includes(q)
}

// ── 十二轮：左栏可见性（设置页·左栏开关，localStorage） ──
const SIDEBAR_VIS_KEY = 'leaf.sidebar-visibility'
const sidebarVis = ref(loadSidebarVis())
function loadSidebarVis(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SIDEBAR_VIS_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}
function vis(key: string): boolean {
  // 相册组为 Leaf 扩展（Eagle 无），默认隐藏
  if (key === 'albumGroup') return sidebarVis.value['albumGroup'] === true
  return sidebarVis.value[key] !== false
}
// 具名处理函数：匿名函数无法 removeEventListener（路由无 keep-alive，
// photos ↔ settings 来回一趟就累积一个监听 + 组件闭包泄漏）
function onSidebarVisibility(): void {
  sidebarVis.value = loadSidebarVis()
}
onMounted(() => window.addEventListener('leaf:sidebar-visibility', onSidebarVisibility))
onUnmounted(() => window.removeEventListener('leaf:sidebar-visibility', onSidebarVisibility))

// ── R4/R5：文件夹解锁会话缓存 + 封面/锁标记 ──
const unlockedFolderIds = ref<Set<string>>(new Set())

// ── D-013 多资源库切换 ──

interface LibraryView {
  id: string
  name: string
  path: string
  legacy: boolean
  active: boolean
}
const { requestPrompt, requestConfirm } = useDialogs()
const libraryList = ref<LibraryView[]>([])
const activeLibraryName = ref('默认资源库')

async function reloadLibraries(): Promise<void> {
  try {
    const res = await window.api.libraries.list()
    libraryList.value = res.libraries
    activeLibraryName.value = res.libraries.find((l) => l.active)?.name ?? '默认资源库'
  } catch {
    /* ignore */
  }
}
void reloadLibraries()

function openLibraryMenu(e: MouseEvent): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const others = libraryList.value.filter((l) => !l.active)
  menu.open(
    rect.left,
    rect.bottom + 4,
    [
      ...libraryList.value.map((l) => ({
        key: `lib-${l.id}`,
        label: l.active ? `✓ ${l.name}` : l.name,
        icon: l.active ? 'ic-check' : 'ic-library-opened'
      })),
      { key: 'd1', divider: true },
      { key: 'create', label: '新建资源库…', icon: 'ic-library-panel-create' },
      { key: 'rename', label: '重命名当前资源库…', icon: 'ic-manage-device-edit' },
      {
        key: 'merge',
        label: '合并其它资源库…',
        icon: 'ic-library-panel-merge',
        disabled: others.length === 0
      },
      {
        key: 'remove',
        label: '移除资源库登记…',
        icon: 'ic-manage-device-remove',
        disabled: libraryList.value.length < 2
      }
    ],
    async (key) => {
      if (key.startsWith('lib-')) {
        const id = key.slice(4)
        const target = libraryList.value.find((l) => l.id === id)
        if (!target || target.active) return
        requestConfirm(
          '切换资源库',
          `切换到「${target.name}」将重新加载应用。`,
          '切换',
          async () => {
            await window.api.libraries.switchTo(id)
          }
        )
      } else if (key === 'create') {
        requestPrompt({
          title: '新建资源库',
          label: '资源库名称',
          initialValue: '',
          confirmLabel: '创建',
          onSubmit: async (name) => {
            const created = await window.api.libraries.create(name)
            requestConfirm(
              '切换到新资源库？',
              `「${created.name}」已创建，切换将重新加载应用。`,
              '切换',
              async () => {
                await window.api.libraries.switchTo(created.id)
              }
            )
          }
        })
      } else if (key === 'rename') {
        requestPrompt({
          title: '重命名资源库',
          label: '新名称',
          initialValue: activeLibraryName.value,
          confirmLabel: '重命名',
          onSubmit: async (name) => {
            const res = await window.api.libraries.list()
            if (res.activeId) await window.api.libraries.rename(res.activeId, name)
            await reloadLibraries()
          }
        })
      } else if (key === 'merge') {
        requestPrompt({
          title: '合并其它资源库',
          label: '来源资源库名称',
          initialValue: '',
          confirmLabel: '合并',
          onSubmit: async (name) => {
            const source = libraryList.value.find((l) => !l.active && l.name === name.trim())
            if (!source) {
              useToast().error('未找到该资源库', { description: name })
              return
            }
            const result = await window.api.libraries.mergeFrom(source.id)
            useToast().success('合并完成', {
              description: `新增 ${result.photosAdded} 项素材、${result.tagsAdded} 个标签；跳过重复 ${result.photosSkipped} 项`
            })
          }
        })
      } else if (key === 'remove') {
        requestPrompt({
          title: '移除资源库登记',
          label: '要移除的资源库名称（不删除磁盘文件）',
          initialValue: '',
          confirmLabel: '移除登记',
          onSubmit: async (name) => {
            const source = libraryList.value.find((l) => l.name === name.trim())
            if (!source) {
              useToast().error('未找到该资源库', { description: name })
              return
            }
            const ok = await window.api.libraries.unregister(source.id)
            if (ok) useToast().success('已移除登记')
            else useToast().error('移除失败', { description: '默认资源库不可移除' })
            await reloadLibraries()
          }
        })
      }
    }
  )
}

function openTrashMenu(e: MouseEvent): void {
  menu.open(
    e.clientX,
    e.clientY,
    [
      { key: 'open', label: '打开回收站', icon: 'context-menu/ic-file-move-trash' },
      { key: 'd1', divider: true },
      {
        key: 'clear',
        label: '清空回收站',
        icon: 'context-menu/ic-trash-empty',
        danger: true,
        disabled: data.recycleCount.value === 0
      }
    ],
    (key) => {
      if (key === 'open')
        openItem({ key: 'trash', view: 'trash', title: '回收站', icon: 'ic_trashbin' })
      else if (key === 'clear') actions.handleClearRecycleBin()
    }
  )
}

// ── 拖拽落点（相册/文件夹）──

const dragOverKey = ref<string | null>(null)

function hasPhotoPayload(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes('application/x-leaf-photos') === true
}
function onDrop(item: TreeItem, e: DragEvent): void {
  dragOverKey.value = null
  if (!hasPhotoPayload(e)) {
    // 外部（Finder）拖入：落到哪一行就导入哪个文件夹（Eagle uploadFolderToSidebar(path, parent)）。
    // 必须 stopPropagation：否则 window 级 drop 会再导一遍，而且落点是「当前视图」不是这一行
    if (item.view.startsWith('folder:') && e.dataTransfer?.types.includes('Files')) {
      e.stopPropagation()
      void photoImport.dropFilesTo(e, item.key.slice(7))
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
  if (item.view.startsWith('album:')) {
    actions.addToAlbum(item.key.slice(6), ids)
  } else if (item.view.startsWith('folder:')) {
    actions.addToFolder(item.key.slice(7), ids)
  }
}
</script>

<template>
  <aside
    class="flex h-full w-[var(--shell-library-panel-w)] shrink-0 flex-col overflow-hidden border-r border-line-subtle bg-[rgba(44,47,50,0.03)] dark:bg-[rgba(248,249,251,0.03)]"
  >
    <div class="flex-1 overflow-y-auto px-2 pb-3 pt-2">
      <!-- 库名行（Eagle：整行点击弹出资源库菜单；回「全部」走「全部」项） -->
      <div
        class="mb-2 flex h-10 items-center rounded-md px-1 transition-colors duration-fast hover:bg-surface-hover"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left focus-visible:shadow-ring-focus focus-visible:outline-none"
          aria-label="切换资源库"
          @click="openLibraryMenu($event)"
        >
          <span
            class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm"
          >
            <AppIcon icon="ic_folder-close" />
          </span>
          <span class="min-w-0 truncate text-[13px] font-semibold text-fg-primary">{{
            activeLibraryName
          }}</span>
          <AppIcon icon="ic_unfold-more" :size="13" class="ml-0.5 shrink-0 text-fg-muted" />
        </button>
      </div>

      <!-- 固定项（G3：Eagle 顺序；十二轮按设置页·左栏开关过滤） -->
      <div class="mb-1">
        <PanelRow
          v-for="item in fixedItems.filter((i) => (i.key === 'all' ? true : vis(i.key)))"
          :key="item.key"
          :item="item"
          :active="item.key === 'tag-manager' ? inTagManager : isActive(item.view)"
          @open="openItem(item)"
          @contextmenu="item.key === 'trash' && openTrashMenu($event)"
        />
      </div>

      <!-- 智能文件夹（G4/G6：组头无计数；预置行收藏/最近添加/最近查看；＋常驻） -->
      <div v-if="vis('smartGroup')" class="mb-1">
        <div class="group flex items-center pl-2 pr-1 pb-1">
          <span class="mr-0.5 select-none text-xs font-medium text-fg-muted">智能文件夹</span>
          <button
            type="button"
            class="flex size-4 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:text-fg-primary"
            :aria-expanded="!collapsedGroups.has('smart')"
            :aria-label="collapsedGroups.has('smart') ? '展开智能文件夹' : '折叠智能文件夹'"
            @click="toggleGroup('smart')"
          >
            <AppIcon
              icon="ic-arrow-right"
              :size="12"
              :class="collapsedGroups.has('smart') ? '' : 'rotate-90'"
            />
          </button>
          <div class="min-w-2 flex-1" />
          <UTooltip content="新增智能文件夹" position="right">
            <button
              type="button"
              class="flex size-5 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:bg-surface-hover hover:text-fg-primary"
              aria-label="新增智能文件夹"
              @click="actions.openSmartAlbumModal(null)"
            >
              <AppIcon icon="ic-sidebar-add" :size="13" />
            </button>
          </UTooltip>
        </div>
        <template v-if="!collapsedGroups.has('smart')">
          <PanelRow
            v-for="item in smartItems.filter((i) => matchesFilter(i.title))"
            :key="item.key"
            :item="item"
            :active="isActive(item.view)"
            @open="openItem(item)"
            @contextmenu="openSmartMenu(item, $event)"
          />
        </template>
      </div>

      <!-- 快速访问（二十四轮：Eagle 右键「添加至"快速访问"」，收藏文件夹） -->
      <div v-if="vis('quickGroup') && quickItems.length > 0" class="mb-1">
        <div class="group flex items-center pl-2 pr-1 pb-1">
          <span class="select-none text-xs font-medium text-fg-muted">快速访问</span>
          <button
            type="button"
            class="flex size-4 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:text-fg-primary"
            :aria-expanded="!collapsedGroups.has('quick')"
            :aria-label="collapsedGroups.has('quick') ? '展开快速访问' : '折叠快速访问'"
            @click="toggleGroup('quick')"
          >
            <AppIcon
              icon="ic-arrow-right"
              :size="12"
              :class="collapsedGroups.has('quick') ? '' : 'rotate-90'"
            />
          </button>
        </div>
        <template v-if="!collapsedGroups.has('quick')">
          <PanelRow
            v-for="qItem in quickItems.filter((i) => matchesFilter(i.title))"
            :key="qItem.key"
            :item="qItem"
            :active="isActive(qItem.view)"
            @open="openItem(qItem)"
            @contextmenu="openQuickMenu(qItem, $event)"
          />
        </template>
      </div>

      <!-- 文件夹（组头带总数；树行 G7 逐行折叠） -->
      <div v-if="vis('folderGroup')" class="mb-1">
        <div class="group flex items-center pl-2 pr-1 pb-1">
          <span class="select-none text-xs font-medium text-fg-muted"
            >文件夹 ({{ data.folders.value.length }})</span
          >
          <button
            type="button"
            class="flex size-4 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:text-fg-primary"
            :aria-expanded="!collapsedGroups.has('folder')"
            :aria-label="collapsedGroups.has('folder') ? '展开文件夹' : '折叠文件夹'"
            @click="toggleGroup('folder')"
          >
            <AppIcon
              icon="ic-arrow-right"
              :size="12"
              :class="collapsedGroups.has('folder') ? '' : 'rotate-90'"
            />
          </button>
          <div class="min-w-2 flex-1" />
          <UTooltip content="新建文件夹" position="right">
            <button
              type="button"
              class="flex size-5 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:bg-surface-hover hover:text-fg-primary"
              aria-label="新建文件夹"
              @click="actions.createFolderInline()"
            >
              <AppIcon icon="ic-sidebar-add" :size="13" />
            </button>
          </UTooltip>
        </div>
        <template v-if="!collapsedGroups.has('folder')">
          <PanelRow
            v-for="node in flatFolders.filter((n) => matchesFilter(n.item.title))"
            :key="node.item.key"
            :item="node.item"
            :active="isActive(node.item.view)"
            :indent="false"
            :style="{ paddingLeft: `${8 + node.depth * 16}px` }"
            :expandable="node.hasChildren"
            :expanded="node.expanded"
            :depth="node.depth"
            :drop-target="true"
            :drag-over="dragOverKey === node.item.key"
            :editing="renamingFolderId === node.item.key.slice(7)"
            @open="openItem(node.item)"
            @toggle-expand="toggleFolderExpand(node.item.key.slice(7))"
            @contextmenu="openFolderMenu(node.item, $event)"
            @edit-commit="commitFolderRename(node.item.key.slice(7), $event)"
            @edit-cancel="cancelFolderRename"
            @drag-over="dragOverKey = node.item.key"
            @drag-leave="dragOverKey === node.item.key && (dragOverKey = null)"
            @drop="onDrop(node.item, $event)"
          />
        </template>
      </div>

      <!-- 相册（Leaf 扩展组：Eagle 无手动相册，功能依赖侧栏入口） -->
      <div v-if="vis('albumGroup')" class="mb-1">
        <div class="group flex items-center pl-2 pr-1 pb-1">
          <span class="select-none text-xs font-medium text-fg-muted"
            >相册 ({{ albumItems.length }})</span
          >
          <button
            type="button"
            class="flex size-4 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:text-fg-primary"
            :aria-expanded="!collapsedGroups.has('album')"
            :aria-label="collapsedGroups.has('album') ? '展开相册' : '折叠相册'"
            @click="toggleGroup('album')"
          >
            <AppIcon
              icon="ic-arrow-right"
              :size="12"
              :class="collapsedGroups.has('album') ? '' : 'rotate-90'"
            />
          </button>
          <div class="min-w-2 flex-1" />
          <UTooltip content="新建相册" position="right">
            <button
              type="button"
              class="flex size-5 items-center justify-center rounded-sm text-fg-muted opacity-0 transition-all duration-fast group-hover:opacity-100 hover:bg-surface-hover hover:text-fg-primary"
              aria-label="新建相册"
              @click="actions.openAlbumModal()"
            >
              <AppIcon icon="ic-sidebar-add" :size="13" />
            </button>
          </UTooltip>
        </div>
        <template v-if="!collapsedGroups.has('album')">
          <PanelRow
            v-for="item in albumItems.filter((i) => matchesFilter(i.title))"
            :key="item.key"
            :item="item"
            :active="isActive(item.view)"
            :drop-target="true"
            :drag-over="dragOverKey === item.key"
            @open="openItem(item)"
            @contextmenu="openAlbumMenu(item, $event)"
            @drag-over="dragOverKey = item.key"
            @drag-leave="dragOverKey === item.key && (dragOverKey = null)"
            @drop="onDrop(item, $event)"
          />
        </template>
      </div>
    </div>

    <!-- D-013 底部筛选框（对齐 Eagle 侧栏筛选） -->
    <div class="shrink-0 border-t border-line-subtle p-2">
      <div class="relative">
        <span class="absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted">
          <AppIcon icon="ic_search" :size="12" />
        </span>
        <input
          v-model="sideFilter"
          type="text"
          placeholder="筛选"
          class="h-8 w-full rounded-md border border-line-default bg-surface-1 pl-7 pr-2 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500"
        />
      </div>
    </div>

    <!-- 二十四轮：自动标签可视化编辑器（Eagle 设置自动标签对话框） -->
    <AutoTagModal
      v-if="autoTagFolder"
      :folder="autoTagFolder"
      :dictionary-tags="data.dictionaryTags.value.map((t) => t.name)"
      @close="autoTagFolder = null"
      @changed="onAutoTagChanged"
    />
  </aside>
</template>
