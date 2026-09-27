<script setup lang="ts">
/**
 * TitleBar · Eagle 式单行工具栏（D-011 布局 + 三轮 G1/G2 对齐 Eagle 实测）
 *
 * 全宽一行（mac hiddenInset 拖拽区），控件顺序对齐 Eagle 4：
 * 左段  🔔通知 / ＋导入菜单 / ▤侧栏开关
 * 中段  ‹ › 视图历史 + 当前视图名（单段，Eagle 实拍无路径面包屑）+ 进度 pill
 * 右段  −滑块+ / ⚡插件 / ⋯更多 / ▦布局弹层 / ▽筛选▾（维度池） / 🔍搜索
 * Eagle 工具栏无 主题/设置/关于 按钮——移入「更多」菜单（原生菜单栏亦有 ⌘, 设置）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@components/AppIcon.vue'
import UTooltip from '../ui/UTooltip.vue'
import LayoutPopover from './LayoutPopover.vue'
import DimensionPoolPopover from './DimensionPoolPopover.vue'
// F6：通知中心重新挂载（组件/事件链路完整，此前缺挂载点导致设置页开关悬空）
import NotificationCenter from './NotificationCenter.vue'
import PluginCenterModal from '../plugins/PluginCenterModal.vue'
import ActionsModal from '../ActionsModal.vue'
import QuickSwitcherModal from './QuickSwitcherModal.vue'
import { useContextMenu } from '@composables/useContextMenu'
import { useRunInLibrary } from '@composables/useRunInLibrary'
import { useLibraryUI } from '../../composables/useLibraryUI'
import { useLibraryTabs, type LibraryLayout } from '@renderer/stores/libraryTabs'
import {
  ensurePinned,
  loadPinnedDimensions,
  reorderDimension,
  savePinnedDimensions,
  type DimensionId
} from '@views/photos/constants/filterDimensions'
import {
  SEARCH_SCOPES,
  toggleSearchScope,
  useSearchScopes
} from '@views/photos/constants/searchScopes'
import { usePhotoData } from '@views/photos/composables/usePhotoData'
import { usePhotoFilters } from '@views/photos/composables/usePhotoFilters'
import { usePhotoActions } from '@views/photos/composables/usePhotoActions'
import { usePhotoSearch } from '@views/photos/composables/usePhotoSearch'
import { useSemanticSearch } from '@views/photos/constants/semanticSearch'
import { useToast } from '@composables/useToast'
import { useAiBatch } from '@views/photos/composables/useAiBatch'

const route = useRoute()
const router = useRouter()
const menu = useContextMenu()
const { panelVisible, togglePanel, ensureFilterBarVisible } = useLibraryUI()

const tabs = useLibraryTabs()
const data = usePhotoData()
const filters = usePhotoFilters()
const actions = usePhotoActions()
const search = usePhotoSearch()
const aiBatch = useAiBatch()
const runInLib = useRunInLibrary()
/** 二十七轮：搜索范围勾选集（Eagle ˅ 面板；与 usePhotoFilters 匹配共享单例） */
const searchScopes = useSearchScopes()
// G1 文搜图：开关与状态在 constants/semanticSearch（模块级单例，与范围勾选集同构）
const semantic = useSemanticSearch()
const toast = useToast()
/** 顶层 ref 才会在模板里自动解包；直接写 semantic.enabled 拿到的是 Ref 对象，恒真 */
const semanticEnabled = semantic.enabled
const semanticState = semantic.state
async function searchLibraryByImage(): Promise<void> {
  const files = await window.api.photos.selectFiles()
  const img = files?.[0]
  if (!img) return
  const ids = await semantic.searchByImage(img)
  if (ids === null) {
    toast.warning('以图搜库内没跑起来', {
      description: semantic.state.value.error || '模型未下载（设置 › 内容识别）'
    })
    return
  }
  // 搜索框里显示"我用什么搜的"：图搜没有关键词，不写的话用户只看到结果突然变少
  const label = img.split(/[\\/]/).pop() ?? img
  localSearchKeyword.value = label
  search.handleSearch(label)
  if (ids.length === 0) toast.info('库里没有能解出画面的素材', { description: `「${label}」` })
  else if (ids.length >= 24)
    // 图像档的余弦分布重叠（见 IMAGE_MIN_SCORE 的实测说明），分数撑不起置信度，
    // 所以这里说的是"排在前面的"，不是"够像的"
    toast.info(`已列出按画面排在最前的 ${ids.length} 张（分数只用于排序，不代表够像）`)
}

/** 面板打开时刷一次就绪态：只在"开关已开"时才刷的话，模型下好了按钮仍会卡在灰态 */
function toggleSearchPanel(): void {
  searchPanelOpen.value = !searchPanelOpen.value
  if (searchPanelOpen.value) void semantic.refreshReady()
}

async function onSemanticToggle(): Promise<void> {
  await semantic.toggle()
  // 开关一翻就要重算当前结果：只改状态不重跑，用户会看到上一档的结果被当成这一档的
  const q = localSearchKeyword.value.trim()
  if (q !== '') search.handleSearch(q)
}

const semanticHint = computed(() => {
  if (!semanticState.value.ready)
    return 'AI 语义搜索：模型未下载。到 设置 › 内容识别 下载后启用（约 754MB，一次性的）'
  if (semanticEnabled.value && semanticState.value.count === 0)
    return `AI 判定没有语义相近的素材（阈值 ${semanticState.value.minScoreText.toFixed(2)}，按 48 图池实测标定）`
  return semanticEnabled.value
    ? 'AI 语义搜索已开启：按画面内容搜，可与文件夹/标签/维度筛选组合'
    : '开启 AI 语义搜索：按画面内容搜图，而不是按文件名'
})

const isMac = computed(() => navigator.userAgent.includes('Mac'))

// ── 面包屑 ──

const inLibrary = computed(() => String(route.name || '') === 'photos')
const inTagManager = computed(() => String(route.name || '') === 'tags')

interface Crumb {
  label: string
}

/** Eagle 实拍核实（三十一轮复测）：标题栏只渲染当前视图名**单段**——进入
 *  DOC / AI 原生开发 / AI-Agent 三级目录时像素级截图仅显示「AI-Agent」，无
 *  「/」路径串、点击无反应（「DOC / AI-Agent」只是容器的 aria-label，此前
 *  R6 轮把它误读成了可见的完整路径面包屑）。筛选/搜索生效时追加的
 *  「搜索结果 (N)」为二十六轮 Eagle 实测行为，保留。 */
const breadcrumb = computed<Crumb[]>(() => {
  if (inTagManager.value) return [{ label: '标签管理' }]
  if (!inLibrary.value) return []
  const segs: Crumb[] = []
  const view = tabs.activeView
  if (view.startsWith('folder:') && filters.activeFolder.value) {
    segs.push({ label: filters.activeFolder.value.name })
  } else if (view.startsWith('album:') && filters.activeAlbum.value) {
    segs.push({ label: filters.activeAlbum.value.name })
  } else if (view.startsWith('smart:') && filters.activeSmartAlbum.value) {
    segs.push({ label: filters.activeSmartAlbum.value.name })
  } else {
    segs.push({ label: view === 'all' ? '全部' : tabs.active.title })
  }
  if (filters.hasDimensionFilters.value || filters.isSearchMode.value) {
    segs.push({ label: `搜索结果 (${filters.totalCount.value})` })
  }
  return segs
})

// ── 布局弹层（LayoutPopover 承担布局/排列/显示开关）──

const LAYOUT_LABEL: Record<LibraryLayout, string> = {
  grid: '网格布局',
  waterfall: '瀑布流布局',
  list: '列表布局',
  auto: '自适应布局',
  freeform: '自由网格'
}

/** 二十一轮：工具栏布局按钮为 Eagle 同款固定图标（不随当前布局切换） */
const LAYOUT_TOOLBAR_ICON = 'ic-toolbar-layout'

// ── 搜索框（D-012 自 FilterBar 移入；⌘F 聚焦 id=library-search）──

const localSearchKeyword = ref(tabs.active.searchKeyword)

watch(
  () => tabs.active.searchKeyword,
  (v) => {
    localSearchKeyword.value = v
  }
)

const handleSearchInput = (): void => {
  search.handleSearch(localSearchKeyword.value)
}

// ── 二十七轮：搜索框一比一对齐 Eagle 实测 ──
// 结构：[🔍][˅] 输入框 [⊗/📷]；˅ 开关「搜索范围」面板（名称/文件夹名/文件夹描述/
// 扩展名/标签/链接/注释 勾选集，全局记住）；输入即搜（实时过滤）+ ⊗ 清除；
// 输入右缘 ⊗ 替换相机按钮（Eagle 同形态）。AI 开关与最近搜索收纳在范围面板底部（Leaf 增值区）。

const HISTORY_KEY = 'leaf.search-history'
const HISTORY_MAX = 10
const searchPanelOpen = ref(false)
const searchHistory = ref<string[]>(loadSearchHistory())

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

/** 回车提交时记入历史（去重、最新在前、截断上限） */
function commitSearchHistory(): void {
  const term = localSearchKeyword.value.trim()
  if (!term) return
  searchHistory.value = [term, ...searchHistory.value.filter((s) => s !== term)].slice(
    0,
    HISTORY_MAX
  )
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory.value))
  } catch {
    /* 存储满时静默 */
  }
}

function applyHistoryTerm(term: string): void {
  localSearchKeyword.value = term
  search.handleSearch(term)
  searchPanelOpen.value = false
}

function clearSearchHistory(): void {
  searchHistory.value = []
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    /* 忽略 */
  }
}

/** ⊗ 清除：清空关键词并实时恢复视图（Eagle 同款清除按钮） */
function clearSearchInput(): void {
  localSearchKeyword.value = ''
  search.handleSearch('')
}

const searchDropEl = ref<HTMLDivElement | null>(null)
function onSearchDropMousedown(e: MouseEvent): void {
  if (searchDropEl.value && !searchDropEl.value.contains(e.target as Node)) {
    searchPanelOpen.value = false
  }
}
watch(searchPanelOpen, (open) => {
  if (open) document.addEventListener('mousedown', onSearchDropMousedown, true)
  else document.removeEventListener('mousedown', onSearchDropMousedown, true)
})
onUnmounted(() => document.removeEventListener('mousedown', onSearchDropMousedown, true))

// ── 缩略图大小三件套（− 滑块 + 数值，4 档）──

const THUMB_STEPS = ['sm', 'md', 'lg', 'xl'] as const
const thumbStep = computed({
  get: () => THUMB_STEPS.indexOf(tabs.active.thumbSize),
  set: (v: number) => {
    tabs.active.thumbSize = THUMB_STEPS[v] ?? 'md'
    tabs.persist()
  }
})
function thumbDec(): void {
  if (thumbStep.value > 0) thumbStep.value = thumbStep.value - 1
}
function thumbInc(): void {
  if (thumbStep.value < THUMB_STEPS.length - 1) thumbStep.value = thumbStep.value + 1
}

// ── 视图历史 ──

function goBack(): void {
  tabs.back()
  if (route.path !== '/photos') router.push('/photos').catch(() => {})
}
function goForward(): void {
  tabs.forward()
  if (route.path !== '/photos') router.push('/photos').catch(() => {})
}

// ── ＋ 添加菜单（Eagle：工具栏第二颗按钮）──

function openImportMenu(e: MouseEvent): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menu.open(
    rect.left,
    rect.bottom + 4,
    [
      { key: 'folder', label: '导入文件夹…', icon: 'context-menu/ic-import-local' },
      { key: 'files', label: '导入文件…', icon: 'ic_add' },
      { key: 'd1', divider: true },
      { key: 'bookmark', label: '收藏网址…', icon: 'context-menu/ic-import-links' }
    ],
    (key) => {
      if (key === 'folder') void actions.handleImportFolder()
      else if (key === 'files') void actions.handleImportFiles()
      else if (key === 'bookmark')
        // 弹窗宿主在 /photos 视图（审查 P2-23）：非 photos 路由先切回
        runInLib(() => (actions.bookmarkModalOpen.value = true))
    }
  )
}

// ── 十五轮 C14：移除工具栏「⋯更多」按钮（Eagle 工具栏无 ⋯）──
// 原菜单入口去向：命令面板 ⌘K/标签管理/新增智能文件夹/筛选行开关/设置/关于
// → 原生菜单已有；地图/查重/选择模式/批量重命名/WebP/导出/移除/密码锁/主题 → 本轮迁入原生菜单。

// ── 主题（入口在原生「显示」菜单与设置页；Eagle 走偏好设置）──

/**
 * 代码审查 P1：themeIcon 改为响应式——旧实现直接读
 * document.documentElement.classList（无响应式依赖），切换主题后图标不更新。
 */
/** 阶段 5.1 插件系统：⚡ 打开插件管理面板 */
/** 十五轮批6：⇄ 快速跳转器（Eagle ic_switch 同位） */
const switcherOpen = ref(false)
const pluginsOpen = ref(false)
const openPlugins = (): void => {
  pluginsOpen.value = true
}
// 十五轮 D20：卡片右键「插件…」经窗口事件打开管理面板（面板本体挂在 TitleBar）
window.addEventListener('leaf:open-plugins', openPlugins)
onUnmounted(() => window.removeEventListener('leaf:open-plugins', openPlugins))

/** 十五轮批5：✦ 素材动作宏（Eagle ic-toolbar-action 同位） */
const actionsOpen = ref(false)
const openActions = (): void => {
  actionsOpen.value = true
}
window.addEventListener('leaf:open-actions', openActions)
onUnmounted(() => window.removeEventListener('leaf:open-actions', openActions))

// ── 筛选维度池（G2：漏斗▾ = 维度池弹层，与 FilterBar「＋」同源）──
// （ensureFilterBarVisible 在上方 useLibraryUI 解构处）

const pinnedDims = ref<DimensionId[]>(loadPinnedDimensions())
function togglePinnedDim(id: DimensionId): void {
  const adding = !pinnedDims.value.includes(id)
  pinnedDims.value = adding
    ? ensurePinned(pinnedDims.value, id)
    : pinnedDims.value.filter((d) => d !== id)
  // 固定必须立即可见：筛选行默认隐藏（⌘⇧F），否则 chip 落进看不见的行
  if (adding) ensureFilterBarVisible()
  savePinnedDimensions([...pinnedDims.value])
  window.dispatchEvent(new CustomEvent('leaf:dimensions-changed'))
}
/** Eagle 点行语义（D-012 修复轮）：漏斗池点行 = 固定如未固定 + 让 FilterBar 打开取值面板 */
function openDimension(id: DimensionId): void {
  pinnedDims.value = ensurePinned(pinnedDims.value, id)
  savePinnedDimensions([...pinnedDims.value])
  ensureFilterBarVisible()
  window.dispatchEvent(new CustomEvent('leaf:dimensions-changed'))
  window.dispatchEvent(new CustomEvent('leaf:dimension-open-panel', { detail: id }))
}
/** 二十六轮：池内拖拽排序（与 FilterBar 共用 localStorage 单源 + 同步事件） */
function reorderPinnedDim(from: DimensionId, to: DimensionId): void {
  reorderDimension(from, to)
  window.dispatchEvent(new CustomEvent('leaf:dimensions-changed'))
}
function reloadDims(): void {
  pinnedDims.value = loadPinnedDimensions()
}
onMounted(() => {
  window.addEventListener('leaf:dimensions-changed', reloadDims)
  // 就绪态要无条件刷一次：开关关着时也要知道能不能开（面板里的置灰判定靠它）
  void semantic.refreshReady()
})
onUnmounted(() => window.removeEventListener('leaf:dimensions-changed', reloadDims))

/** 24px 图标按钮基类（Eagle .content-panel .toolbar .ic-btn{min-width:24px}，图标 16px） */
const iconBtn =
  'flex h-6 w-6 items-center justify-center rounded-md text-fg-secondary transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover hover:text-fg-primary focus-visible:shadow-ring-focus focus-visible:outline-none'
</script>

<template>
  <header
    class="LeafTitleBar LeafTitleBar-drag relative z-30 flex h-[var(--shell-topbar-h)] shrink-0 items-stretch border-b border-line-subtle bg-glass-bg pr-2 backdrop-blur-[var(--glass-blur)]"
  >
    <!-- 顶部 1px 内高光 -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-glass-highlight"
      aria-hidden="true"
    />

    <!-- ── 左段：侧栏列宽区域（Eagle：红绿灯占位 + ＋导入/⇄跳转/▤侧栏 靠右）── -->
    <div
      class="flex shrink-0 items-center border-r border-line-subtle bg-[rgba(44,47,50,0.03)] transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] dark:bg-[rgba(248,249,251,0.03)]"
      :class="[
        isMac ? 'pl-[76px]' : 'pl-2',
        panelVisible ? 'w-[var(--shell-library-panel-w)] justify-end pr-3' : 'justify-start pr-1'
      ]"
    >
      <div class="LeafTitleBar-nodrag flex items-center gap-0.5">
        <NotificationCenter />
        <UTooltip content="导入" position="bottom">
          <button :class="iconBtn" aria-label="导入" :disabled="!inLibrary" @click="openImportMenu">
            <AppIcon icon="ic_add" />
          </button>
        </UTooltip>
        <!-- 十五轮批6：⇄ 快速跳转器（Eagle ic_switch 同位：文件夹/标签/智能文件夹/文档） -->
        <UTooltip content="快速跳转" position="bottom">
          <button :class="iconBtn" aria-label="快速跳转" @click="switcherOpen = true">
            <AppIcon icon="ic_switch" />
          </button>
        </UTooltip>
        <UTooltip content="显示/隐藏侧栏" position="bottom">
          <button :class="iconBtn" aria-label="显示/隐藏侧栏" @click="togglePanel">
            <AppIcon icon="ic_toggle-sidebar" />
          </button>
        </UTooltip>
      </div>
    </div>

    <!-- ── 右段：‹ › 面包屑 | 居中缩放滑块 | 图标 + 搜索（Eagle 顺序）── -->
    <div class="relative flex min-w-0 flex-1 items-center pl-1">
      <button
        type="button"
        :class="[
          iconBtn,
          'LeafTitleBar-nodrag',
          tabs.canBack ? '' : 'opacity-35 hover:bg-transparent'
        ]"
        :disabled="!tabs.canBack"
        aria-label="后退"
        @click="goBack"
      >
        <AppIcon icon="ic-toolbar-prev" />
      </button>
      <button
        type="button"
        :class="[
          iconBtn,
          'LeafTitleBar-nodrag',
          tabs.canForward ? '' : 'opacity-35 hover:bg-transparent'
        ]"
        :disabled="!tabs.canForward"
        aria-label="前进"
        @click="goForward"
      >
        <AppIcon icon="ic-toolbar-next" />
      </button>

      <nav
        class="LeafTitleBar-nodrag ml-1 flex min-w-0 items-center gap-1 text-[15px]"
        aria-label="视图名称"
      >
        <template v-for="(seg, i) in breadcrumb" :key="`${seg.label}-${i}`">
          <span v-if="i > 0" class="shrink-0 text-fg-muted">/</span>
          <span
            class="truncate"
            :class="
              i === breadcrumb.length - 1 ? 'font-medium text-fg-primary' : 'text-fg-secondary'
            "
          >
            {{ seg.label }}
          </span>
        </template>
      </nav>
      <span
        v-if="!inLibrary && !inTagManager"
        class="select-none text-sm font-semibold text-fg-primary"
        >Leaf</span
      >

      <!-- 居中缩放滑块（Eagle：主区域中央 − ● +） -->
      <div
        v-if="inLibrary"
        class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <div class="LeafTitleBar-nodrag pointer-events-auto mr-1 flex items-center gap-0.5">
          <button
            type="button"
            :class="[iconBtn, thumbStep <= 0 ? 'opacity-35' : '']"
            :disabled="thumbStep <= 0"
            aria-label="缩小缩略图"
            @click="thumbDec"
          >
            <AppIcon icon="ic-toolbar-zoom-out" />
          </button>
          <input
            v-model.number="thumbStep"
            type="range"
            min="0"
            max="3"
            step="1"
            class="thumb-slider h-3 w-[130px] cursor-pointer"
            aria-label="缩略图大小"
          />
          <button
            type="button"
            :class="[iconBtn, thumbStep >= 3 ? 'opacity-35' : '']"
            :disabled="thumbStep >= 3"
            aria-label="放大缩略图"
            @click="thumbInc"
          >
            <AppIcon icon="ic-toolbar-zoom-in" />
          </button>
        </div>
      </div>

      <!-- 进度 pill（处理中提示；Eagle 走通知中心，Leaf 双通道暂留） -->
      <div
        v-if="data.processing.value"
        class="LeafTitleBar-nodrag ml-auto mr-1 flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-[11px] text-brand-600 dark:text-brand-400"
        title="后台正在生成缩略图、解析 EXIF 与感知哈希"
      >
        <svg class="size-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
          />
        </svg>
        {{ data.processing.value.done }}/{{ data.processing.value.total }}
      </div>
      <!-- AI 批量摘要进度：与处理管线 chip 同形态，跑完即隐 -->
      <div
        v-if="aiBatch.progress.value"
        class="LeafTitleBar-nodrag ml-1 mr-1 flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-[11px] text-brand-600 dark:text-brand-400"
        title="AI 正在逐个生成摘要与标签"
      >
        <svg class="size-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
          />
        </svg>
        AI {{ aiBatch.progress.value.done }}/{{ aiBatch.progress.value.total }}
      </div>

      <!-- 工具按钮组：🧩插件 ⚡动作 ▦布局 ▽筛选（Eagle 顺序与图形） -->
      <div
        class="LeafTitleBar-nodrag ml-auto flex shrink-0 items-center gap-0.5"
        :class="inLibrary ? '' : 'hidden'"
      >
        <template v-if="inLibrary">
          <!-- 插件（Eagle 拼图同位） -->
          <UTooltip content="插件" position="bottom">
            <button :class="iconBtn" aria-label="插件" @click="openPlugins">
              <AppIcon icon="ic-toolbar-plugin" />
            </button>
          </UTooltip>
          <!-- 十五轮批5：⚡ 动作（Eagle ic-toolbar-action 同位；素材动作宏） -->
          <UTooltip content="动作" position="bottom">
            <button :class="iconBtn" aria-label="动作" @click="actionsOpen = true">
              <AppIcon icon="ic-toolbar-action" />
            </button>
          </UTooltip>
          <!-- 布局弹层（Eagle 固定分栏图标） -->
          <LayoutPopover :disabled="!inLibrary">
            <template #trigger="{ toggle }">
              <UTooltip
                :content="`布局：${LAYOUT_LABEL[tabs.active.layout]}（点击展开）`"
                position="bottom"
              >
                <button :class="iconBtn" aria-label="布局与显示选项" @click="toggle">
                  <AppIcon :icon="LAYOUT_TOOLBAR_ICON" />
                </button>
              </UTooltip>
            </template>
          </LayoutPopover>
          <!-- 筛选：维度池（Eagle ic-toolbar-filter 漏斗同位；生效时蓝点角标） -->
          <DimensionPoolPopover
            :pinned="pinnedDims"
            @toggle="togglePinnedDim"
            @open="openDimension"
            @reorder="reorderPinnedDim"
          >
            <template #default="{ toggle }">
              <UTooltip content="筛选维度" position="bottom">
                <button :class="iconBtn" aria-label="筛选维度" @click="toggle">
                  <span class="relative flex">
                    <AppIcon icon="ic-toolbar-filter" />
                    <span
                      v-if="filters.hasDimensionFilters.value"
                      class="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-brand-500"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </UTooltip>
            </template>
          </DimensionPoolPopover>
        </template>
      </div>

      <!-- 搜索框（二十七轮：一比一对齐 Eagle——[🔍][˅] 输入框 [⊗/📷]；输入即搜；
             ˅ 开关「搜索范围」面板；⊗ 清除出现时替换相机按钮；
             聚焦不变宽（Eagle 聚焦仅边框变蓝）） -->
      <div
        v-if="inLibrary"
        ref="searchDropEl"
        class="LeafTitleBar-nodrag relative ml-1 flex w-[180px] shrink-0 items-center"
      >
        <span class="absolute left-2 flex items-center gap-0.5 text-fg-muted">
          <AppIcon icon="ic_search" :size="14" />
          <!-- 语义档开着时常驻亮个标记：状态得在面板关着时也看得见 -->
          <AppIcon
            v-if="semanticEnabled"
            icon="context-menu/ic-ai"
            :size="12"
            class="text-brand-500"
            :title="semanticHint"
          />
          <button
            type="button"
            class="flex items-center rounded-sm p-0.5 transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:text-fg-primary"
            :class="searchPanelOpen ? 'text-fg-primary' : ''"
            title="搜索范围"
            aria-label="搜索范围"
            @mousedown.prevent
            @click="toggleSearchPanel"
          >
            <AppIcon icon="ic-toolbar-arrow-down" :size="10" />
          </button>
        </span>
        <input
          id="library-search"
          v-model="localSearchKeyword"
          type="text"
          placeholder="搜索"
          class="h-8 w-full rounded-lg border border-line-default bg-surface-1 pr-7 text-[13px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500"
          :class="semanticEnabled ? 'pl-[64px]' : 'pl-[46px]'"
          @input="handleSearchInput"
          @keydown.enter="commitSearchHistory"
        />
        <!-- ⊗ 清除（有输入时替换相机按钮，Eagle 同形态） -->
        <button
          v-if="localSearchKeyword"
          type="button"
          class="absolute right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-hover text-fg-secondary transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:text-fg-primary"
          title="清除搜索"
          aria-label="清除搜索"
          @click="clearSearchInput"
        >
          <AppIcon icon="ic-modal-close" :size="9" />
        </button>
        <!-- 以图搜图按钮（空输入时显示；Eagle ic-search-by-image 同位） -->
        <button
          v-else
          type="button"
          class="absolute right-1 flex h-5 w-5 items-center justify-center rounded-sm text-fg-muted transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover hover:text-fg-primary"
          title="以图搜图（选择外部图片，搜索引擎搜图）"
          aria-label="以图搜图"
          @click="actions.reverseImageSearch()"
        >
          <AppIcon icon="ic-search-by-image" :size="14" />
        </button>

        <!-- 搜索范围面板（Eagle ˅ 下拉一比一：窄面板/紧凑行/行尾白色对勾）
             + Leaf 增值区（AI 开关 / 高级语法 / 最近搜索，分隔线下） -->
        <div
          v-if="searchPanelOpen"
          class="absolute right-0 top-9 z-50 max-h-[70vh] w-[150px] overflow-y-auto rounded-md border border-line-default bg-surface-1 py-1 shadow-lg app-scroll"
        >
          <p class="px-3 pb-0.5 pt-0.5 text-[10px] leading-4 text-fg-tertiary">搜索范围:</p>
          <button
            v-for="scope in SEARCH_SCOPES"
            :key="scope.id"
            type="button"
            class="flex w-full items-center gap-1.5 px-3 py-[3px] text-left text-[11px] text-fg-primary transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover"
            :title="searchScopes.includes(scope.id) ? '点击取消该范围' : '点击搜索该范围'"
            @click="toggleSearchScope(scope.id)"
          >
            <AppIcon :icon="scope.icon" :size="12" class="shrink-0 text-fg-secondary" />
            <span class="min-w-0 flex-1 truncate">{{ scope.label }}</span>
            <!-- Eagle 勾选态 = 行尾白色对勾；未勾选 = 同图标弱化占位 -->
            <AppIcon
              icon="context-menu/ic-context-menu-checkbox"
              :size="12"
              :class="
                searchScopes.includes(scope.id) ? 'text-fg-primary' : 'text-fg-primary opacity-20'
              "
            />
          </button>

          <!-- ── Leaf 增值区（Eagle 面板无此内容）── -->
          <!-- G1 AI 语义档：开关放这儿而不是常驻工具栏（低频但一旦开了要显眼，
               所以输入框左缘另给一个亮起的 ✨ 标记回显状态） -->
          <div class="my-1 border-t border-line-default" />
          <button
            type="button"
            class="flex w-full items-center gap-1.5 px-3 py-[3px] text-left text-[11px] transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="!semanticState.ready"
            :title="semanticHint"
            @click="onSemanticToggle"
          >
            <AppIcon
              icon="context-menu/ic-ai"
              :size="12"
              class="shrink-0"
              :class="semanticEnabled ? 'text-brand-500' : 'text-fg-secondary'"
            />
            <span class="min-w-0 flex-1 truncate">AI 语义</span>
            <AppIcon
              icon="context-menu/ic-context-menu-checkbox"
              :size="12"
              :class="semanticEnabled ? 'text-fg-primary' : 'text-fg-primary opacity-20'"
            />
          </button>
          <!-- 以图搜库内：选一张外部图走本地图像向量档。相机那颗键仍是"跳百度搜图"
               （Eagle 的语义，不改它），库内这一档单独放，两者结果形态完全不同 -->
          <button
            type="button"
            class="flex w-full items-center gap-1.5 px-3 py-[3px] text-left text-[11px] transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="!semanticState.ready || semanticState.loading"
            :title="
              semanticState.ready
                ? '选一张图片，用本地向量档在库里找画面相近的素材'
                : '需要先在 设置 › 内容识别 下载模型'
            "
            @click="searchLibraryByImage"
          >
            <AppIcon icon="ic-search-by-image" :size="12" class="shrink-0 text-fg-secondary" />
            <span class="min-w-0 flex-1 truncate">以图搜库内</span>
          </button>

          <!-- round20：高级搜索语法提示 -->
          <div class="px-3 py-1.5">
            <p class="text-[10px] text-fg-tertiary">高级搜索</p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
              <code class="rounded bg-surface-hover px-1">cat OR dog</code> 任一匹配
            </p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
              <code class="rounded bg-surface-hover px-1">(a || b) -c</code> 分组+排除
            </p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
              <code class="rounded bg-surface-hover px-1">"cat food"</code> 精确短语
            </p>
          </div>
          <template v-if="searchHistory.length > 0">
            <div class="my-1 border-t border-line-default" />
            <p class="px-3 py-0.5 text-[10px] text-fg-tertiary">最近搜索</p>
            <button
              v-for="term in searchHistory"
              :key="term"
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-fg-secondary transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover hover:text-fg-primary"
              @click="applyHistoryTerm(term)"
            >
              <AppIcon icon="ic_search" :size="12" class="text-fg-muted" />
              <span class="truncate">{{ term }}</span>
            </button>
            <div class="my-1 border-t border-line-default" />
            <button
              type="button"
              class="w-full px-3 py-1 text-left text-[11px] text-fg-muted transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover hover:text-danger"
              @click="clearSearchHistory"
            >
              清除搜索历史
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 插件中心（D-025 P1） -->
    <PluginCenterModal v-model="pluginsOpen" />
    <!-- 十五轮批5：素材动作宏弹层 -->
    <ActionsModal v-model="actionsOpen" />
    <!-- 十五轮批6：⇄ 快速跳转器弹层 -->
    <QuickSwitcherModal v-model="switcherOpen" />
  </header>
</template>

<style scoped>
/* app-region 不能进 tailwind 任意值，用原生属性 */
.LeafTitleBar-drag {
  -webkit-app-region: drag;
}

/* 拖拽区内可点击的控件一律 no-drag */
.LeafTitleBar :deep(.LeafTitleBar-nodrag),
.LeafTitleBar :deep(.LeafTitleBar-nodrag *) {
  -webkit-app-region: no-drag;
}

/* Eagle 式缩略图滑块（十五轮对齐 app.css slider 形态：细线轨道 + 圆点滑钮） */
.thumb-slider {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
}
.thumb-slider::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 1px;
  background: var(--border-strong);
}
.thumb-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-primary);
  margin-top: -5px;
}
.thumb-slider:focus-visible {
  outline: 2px solid var(--brand-500);
  outline-offset: 2px;
}
</style>
