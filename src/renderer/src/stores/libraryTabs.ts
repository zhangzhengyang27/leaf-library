/**
 * Leaf 素材库 · 图库视图状态（D-011 Eagle 布局）
 *
 * D-008 的多标签机制已移除（Eagle 无标签页）：单一视图状态 + 视图历史栈
 * （支撑工具栏 ‹ › 前进/后退）。图库数据由 usePhotoData 提供，本 store
 * 只管「当前在看哪个视角 + 该视角的筛选/布局状态」。
 *
 * 持久化：localStorage（渲染端本地 UI 状态，不进 SQLite）。
 * 契约：view 字符串与 index.vue 的视图分支一致
 * （all/favorites/map/trash/duplicates/unsorted/recent/recents/
 *   similar:id/smart:id/album:id/folder:id）。
 */
import { defineStore } from 'pinia'
import type { AssetKind } from '@shared/assetTypes'
import type { HueBucket } from '@utils/photoColor'

/** 布局（Eagle 实测 4 种 + F10 自由网格——仅文件夹视图可选） */
export type LibraryLayout = 'grid' | 'waterfall' | 'list' | 'auto' | 'freeform'
/**
 * 排列方式（D-012，对齐 Eagle 10 种）。
 * - modified/created 用 003 的文件系统时间（缺失时回退 imported/updated）
 * - 随机模式沿用 shuffle 字段驱动（LayoutPopover 里作为排序项呈现）
 */
export type LibrarySort =
  | 'imported'
  | 'name'
  | 'size'
  | 'rating'
  | 'modified'
  | 'created'
  | 'extension'
  | 'dimensions'
  | 'duration'
/** 缩略图尺寸档位 */
export type ThumbSize = 'sm' | 'md' | 'lg' | 'xl'
/** 形状筛选（八轮对齐 Eagle：横/竖/方形 + 细长横/细长竖） */
export type Orientation =
  '' | 'landscape' | 'portrait' | 'square' | 'panoramic' | 'panoramicPortrait'
/** 二十六轮：形状取值（不含空值；空数组 = 不限）——Eagle 形状弹层多选/排除 */
export type OrientationValue = Exclude<Orientation, ''>

/**
 * 显示开关（D-012，Eagle 布局弹层实测 8 项）。
 * 随视图持久化；showHoverBar/showInspector 属壳层级行为，仍放这里保持单源。
 */
export interface DisplayOptions {
  /** 显示名称 */
  showName: boolean
  /** 显示简介（Eagle：卡片第二行单值，随下拉切换内容） */
  showSummary: 'none' | 'dimensions' | 'size' | 'added' | 'modified' | 'created'
  /** 显示扩展名（文件名尾缀） */
  showExtension: boolean
  /** 显示扩展名标签（卡片角标，Eagle 在缩略图左上） */
  showExtensionLabel: boolean
  /** 显示标注（描述角标） */
  showAnnotation: boolean
  /** M3（Eagle 显示开关「标注数」）：卡片渲染标注计数徽标（仅条数 >0 时显示） */
  showAnnotationCount: boolean
  /** 文件夹视图包含子文件夹内容 */
  includeSubfolders: boolean
  /** 显示横栏（悬停信息栏） */
  showHoverBar: boolean
  /** 显示检查器 */
  showInspector: boolean
  /** ④-4（Eagle 4 文件列表选项）：GIF/WebP 缩略图自动播放（关=静态，悬停才动） */
  autoPlayGif: boolean
  /** 十八轮 P3：缩略图背景（Eagle 缩略图背景子菜单）——auto=跟随主题/white=纯白/dark=深棋盘/transparent=透明 */
  thumbBackground: 'auto' | 'white' | 'dark' | 'transparent'
}

export function makeDisplayOptions(): DisplayOptions {
  return {
    showName: true,
    showSummary: 'dimensions',
    showExtension: true,
    // 二十一轮：角标渲染已随 Eagle 对齐移除，字段保留仅为旧持久化数据兼容
    showExtensionLabel: false,
    showAnnotation: false,
    // M3：Eagle 该开关默认也不开；缺字段由 loadPersisted 的逐字段合并自动补默认值
    showAnnotationCount: false,
    includeSubfolders: false,
    // 十八轮：Eagle 无卡片 hover 操作条，默认关闭
    showHoverBar: false,
    showInspector: true,
    // ④-4：默认静态缩略图（Eagle 默认行为，悬停才播动图）
    autoPlayGif: false,
    thumbBackground: 'auto'
  }
}

export interface LibraryTab {
  /** 视图标识 */
  view: string
  title: string
  kindFilter: AssetKind | null
  colorFilter: HueBucket | null
  /**
   * 二十九轮 G3：颜色匹配方式。色系=9 桶等值（走 color_hue 索引列，快）；
   * 近似色=Eagle 的「吸管 + 准确度」，走 color_close() 的 CIEDE2000 判定。
   */
  colorMatch: 'bucket' | 'close'
  /** 近似色档：取到的色 + 准确度（5–40，越大越严，同 Eagle） */
  colorClose: { hex: string; accuracy: number } | null
  /** 二十六轮：格式多选包含（扩展名小写，空 = 不限；Eagle 格式弹层 左键选择） */
  formatInclude: string[]
  /** 二十六轮：格式右键排除（Eagle 格式弹层 排除 右键） */
  formatExclude: string[]
  resolutionFilter: '' | '1k' | '2k' | '4k'
  timeFilter: '' | 'today' | 'yesterday' | '7d' | '30d' | '90d' | '365d'
  layout: LibraryLayout
  sortBy: LibrarySort
  searchKeyword: string
  // ── 检索筛选扩展 ──
  /** 二十六轮：精确评分多选（Eagle 评分弹层按星级复选；含 0 = 「尚未评分」行） */
  ratingInclude: number[]
  /** 二十六轮：排除的星级（0 = 排除未评分） */
  ratingExclude: number[]
  /** 文件大小区间 [min, max]（字节，null = 不限） */
  sizeRange: [number, number] | null
  /** 二十六轮：形状多选包含（Eagle 形状弹层 复选） */
  shapeInclude: OrientationValue[]
  /** 二十六轮：形状右键排除 */
  shapeExclude: OrientationValue[]
  /** 二十六轮：比例筛选（Eagle 形状弹层 3:4/自定；[w,h]，2% 容差匹配） */
  ratioFilter: [number, number] | null
  /** 标签多选（AND 语义，按名称） */
  tagFilter: string[]
  /** 五轮：标签匹配逻辑（false=所有 AND，true=任一 OR，Eagle 标签弹层「逻辑」） */
  tagMatchAny: boolean
  /** 二十六轮：标签匹配「等同」（Eagle ic-logic-equal：标签集合与选中完全一致） */
  tagMatchExact: boolean
  /** 五轮：右键排除的标签（Eagle 标签/文件夹弹层「排除 右键」） */
  tagExclude: string[]
  /** 五轮：仅看未标签（Eagle 标签弹层「未标签」行） */
  untaggedOnly: boolean
  /** M4（Eagle 筛选器「标注」维）：''=不限，'any'=有标注，'none'=无标注 */
  annotationFilter: '' | 'any' | 'none'
  /** D-012 文件夹筛选（folder id；'' = 不限，'none' = 未分类到文件夹） */
  folderFilter: string
  /** 五轮：文件夹多选包含（id 列表含 'none'，空=不限） */
  folderFilterIds: string[]
  /** 五轮：右键排除的文件夹 */
  folderExcludeIds: string[]
  /** 五轮：文件夹多选逻辑（false=任一 OR，true=所有 AND） */
  folderMatchAll: boolean
  /** 自定义时间区间 [from, to]（unix ms，null = 不限，按导入时间） */
  customTime: [number, number] | null
  /** D-012 修改日期区间 [from, to]（unix ms，null = 不限，按文件系统修改时间） */
  modifiedTimeRange: [number, number] | null
  /** D-012 时长区间 [min, max]（ms，null = 不限） */
  durationRange: [number, number] | null
  /** D-012 描述/备注关键词 */
  noteKeyword: string
  /** ⑤（Eagle 4.0 筛选器「完全相等」）：注释关键词精确匹配（关=包含） */
  noteKeywordExact: boolean
  /** 二十六轮：链接筛选（来源 URL 包含关键词，Eagle「链接」维度） */
  urlKeyword: string
  /** ⑤（Eagle 4.0 筛选器「完全相等」）：链接关键词精确匹配（关=包含） */
  urlKeywordExact: boolean
  /** 排除关键词（文件名/描述/标签） */
  excludeKeyword: string
  /** 随机打散 */
  shuffle: boolean
  /** 十五轮批6：排列方向（Eagle 布局弹层 升序/降序）；false=降序（默认） */
  sortAsc: boolean
  // ── 缩略图尺寸档位 ──
  thumbSize: ThumbSize
  // ── 显示开关（D-012）──
  display: DisplayOptions
}

const STORAGE_KEY = 'library.tab.v2'
const LEGACY_STORAGE_KEY = 'library.tabs.v1'
/** 历史栈上限（防无限增长） */
const HISTORY_LIMIT = 50

export function makeTab(view = 'all', title = '全部'): LibraryTab {
  return {
    view,
    title,
    kindFilter: null,
    colorFilter: null,
    colorMatch: 'bucket',
    colorClose: null,
    formatInclude: [],
    formatExclude: [],
    resolutionFilter: '',
    timeFilter: '',
    layout: 'waterfall',
    sortBy: 'imported',
    searchKeyword: '',
    ratingInclude: [],
    ratingExclude: [],
    sizeRange: null,
    shapeInclude: [],
    shapeExclude: [],
    ratioFilter: null,
    tagFilter: [],
    tagMatchAny: false,
    tagMatchExact: false,
    tagExclude: [],
    untaggedOnly: false,
    annotationFilter: '',
    customTime: null,
    modifiedTimeRange: null,
    durationRange: null,
    noteKeyword: '',
    noteKeywordExact: false,
    urlKeyword: '',
    urlKeywordExact: false,
    folderFilter: '',
    folderFilterIds: [],
    folderExcludeIds: [],
    folderMatchAll: false,
    excludeKeyword: '',
    shuffle: false,
    /** 十五轮批6：排列方向（Eagle 布局弹层 升序/降序切换）；false=降序（默认） */
    sortAsc: false,
    thumbSize: 'md',
    display: makeDisplayOptions()
  }
}

/**
 * 二十六轮：维度筛选字段集（Eagle ic-filter-lock「锁定筛选」跨视图携带 +
 * ic-filter-reset「清除全部」的作用范围）。不含布局/显示开关/搜索关键词。
 */
const FILTER_FIELD_KEYS = [
  'kindFilter',
  'colorFilter',
  'colorClose',
  'formatInclude',
  'formatExclude',
  'resolutionFilter',
  'timeFilter',
  'ratingInclude',
  'ratingExclude',
  'sizeRange',
  'shapeInclude',
  'shapeExclude',
  'ratioFilter',
  'tagFilter',
  'tagMatchAny',
  'tagMatchExact',
  'tagExclude',
  'untaggedOnly',
  'annotationFilter',
  'folderFilter',
  'folderFilterIds',
  'folderExcludeIds',
  'folderMatchAll',
  'customTime',
  'modifiedTimeRange',
  'durationRange',
  'noteKeyword',
  'noteKeywordExact',
  'urlKeyword',
  'urlKeywordExact',
  'excludeKeyword'
] as const

/** 从 tab 上摘出维度筛选字段（锁定切换视图时搬运用） */
function pickFilterFields(tab: LibraryTab): Partial<LibraryTab> {
  const out = {} as Record<(typeof FILTER_FIELD_KEYS)[number], unknown>
  for (const k of FILTER_FIELD_KEYS) {
    const v = tab[k]
    out[k] = Array.isArray(v) ? [...v] : v
  }
  return out as Partial<LibraryTab>
}

/** 把维度筛选字段重置为默认值（清除全部 / 未锁定切换视图共用；审查 I3） */
function applyFreshFilterFields(tab: LibraryTab): void {
  const fresh = makeTab(tab.view, tab.title)
  for (const k of FILTER_FIELD_KEYS) {
    tab[k] = fresh[k] as never
  }
}

interface PersistedState {
  tab: LibraryTab
  history: string[]
  histIdx: number
  /** 二十六轮：锁定筛选（Eagle ic-filter-lock，跨视图携带维度筛选） */
  filterLocked?: boolean
}

/** 二十六轮一次性迁移：单值筛选字段 → 多选包含/排除（Eagle 弹层语义） */
function migrateLegacyFilterFields(tab: Record<string, unknown>): void {
  // 审查 C1：旧持久化 JSON 没有任何新数组键（makeTab 默认值在其后的展开才合并），
  // 必须先把缺失的数组键归一化为空数组，否则守卫永远不成立、旧筛选被静默丢弃
  if (!Array.isArray(tab.formatInclude)) tab.formatInclude = []
  if (!Array.isArray(tab.formatExclude)) tab.formatExclude = []
  if (!Array.isArray(tab.shapeInclude)) tab.shapeInclude = []
  if (!Array.isArray(tab.shapeExclude)) tab.shapeExclude = []
  if (!Array.isArray(tab.ratingInclude)) tab.ratingInclude = []
  if (!Array.isArray(tab.ratingExclude)) tab.ratingExclude = []
  // 二十九轮 G3 的两个新键同样要归一：旧持久化标签上它们是 undefined，
  // 不归一的话「近似色」档一刷新就掉回色系，形状像没生效
  if (tab.colorMatch !== 'close') tab.colorMatch = 'bucket'
  const legacyClose = tab.colorClose as { hex?: unknown; accuracy?: unknown } | null
  if (
    !legacyClose ||
    typeof legacyClose.hex !== 'string' ||
    typeof legacyClose.accuracy !== 'number'
  ) {
    tab.colorClose = null
  }
  const legacyFormat = tab.formatFilter
  if (
    typeof legacyFormat === 'string' &&
    legacyFormat &&
    (tab.formatInclude as string[]).length === 0
  ) {
    tab.formatInclude = [legacyFormat]
  }
  const legacyOrientation = tab.orientation
  if (
    typeof legacyOrientation === 'string' &&
    legacyOrientation &&
    (tab.shapeInclude as string[]).length === 0
  ) {
    tab.shapeInclude = [legacyOrientation]
  }
  const legacyRating = tab.ratingFilter
  if (
    typeof legacyRating === 'number' &&
    legacyRating > 0 &&
    (tab.ratingInclude as number[]).length === 0
  ) {
    // 旧语义为「≥ N」，展开为精确星级集合保持筛选结果不变
    tab.ratingInclude = [
      legacyRating,
      legacyRating + 1,
      legacyRating + 2,
      legacyRating + 3,
      legacyRating + 4
    ].filter((r) => r <= 5)
  }
  delete tab.formatFilter
  delete tab.orientation
  delete tab.ratingFilter
  // aiSearchMode 是 09-23 并行会话连带落地的死状态（chip 现接 constants/semanticSearch
  // 的 enabled 单例，与 TitleBar 同源），字段已从类型移除，旧持久化里的残留一并清掉
  delete tab.aiSearchMode
}

function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    // 三条一次性迁移标志必须无条件先写（审查 P2-22）：旧实现只在读到持久化数据时
    // 才写标志——新装用户首轮无 raw 提前 return，标志永不落盘，第二次启动时
    // 首轮产生的默认值（waterfall/showName/摘要）被误判为「旧数据」遭到改写
    const needHoverbarMigration = !localStorage.getItem('leaf.hoverbar-migrated-v1')
    const needLayoutMigration = !localStorage.getItem('leaf.layout-migrated-v4')
    const needDisplayMigration = !localStorage.getItem('leaf.display-migrated-v2')
    if (needHoverbarMigration) localStorage.setItem('leaf.hoverbar-migrated-v1', '1')
    if (needLayoutMigration) localStorage.setItem('leaf.layout-migrated-v4', '1')
    if (needDisplayMigration) localStorage.setItem('leaf.display-migrated-v2', '1')
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (!parsed.tab || typeof parsed.tab.view !== 'string') return null
    // 二十六轮：旧单值字段迁入多选数组
    migrateLegacyFilterFields(parsed.tab as unknown as Record<string, unknown>)
    // 十八轮一次性迁移：Eagle 无卡片 hover 操作条，旧用户默认开启的统一关闭。
    if (needHoverbarMigration) {
      if (parsed.tab.display) parsed.tab.display.showHoverBar = false
    }
    // 二十三轮一次性迁移：布局语义对齐 Eagle——「自适应」=justified 行式（行高≈固定、
    // 宽度成比例、整行填满），旧瀑布流偏好（flex 定高行）迁入自适应；瀑布流改为 masonry 列式。
    if (needLayoutMigration) {
      if ((parsed.tab.layout as string) === 'waterfall') parsed.tab.layout = 'auto'
    }
    // 二十三轮一次性迁移：卡片下方名称/简介默认隐藏（对齐用户 Eagle 当前状态——纯净瀑布流；
    // 需要时可在布局弹层「显示名称 / 显示简介」重新打开）
    if (needDisplayMigration) {
      if (parsed.tab.display) {
        parsed.tab.display.showName = false
        parsed.tab.display.showSummary = 'none'
      }
    }
    // 字段容错：缺字段补默认值；display 嵌套对象逐字段合并（兼容旧版本增量加开关）
    return {
      tab: {
        ...makeTab(parsed.tab.view, parsed.tab.title),
        ...parsed.tab,
        display: { ...makeDisplayOptions(), ...(parsed.tab.display ?? {}) }
      },
      history:
        Array.isArray(parsed.history) && parsed.history.length > 0
          ? parsed.history.slice(-HISTORY_LIMIT)
          : [parsed.tab.view],
      histIdx: typeof parsed.histIdx === 'number' ? parsed.histIdx : 0
    }
  } catch {
    return null
  }
}

/** 十五轮 D18：消费窗口 URL 里的初始视图参数（#/photos?boot-view=folder:<id>），用完即清 */
function consumeBootView(): string | null {
  try {
    const m = /boot-view=([^&]+)/.exec(window.location.hash)
    if (!m) return null
    const view = decodeURIComponent(m[1])
    const cleaned = window.location.hash.replace(/[?&]boot-view=[^&]+/, '')
    window.history.replaceState(null, '', window.location.pathname + cleaned)
    // 标记「引导窗口」：不回写持久化（localStorage 跨窗口共享，避免覆盖主窗口视图状态）
    sessionStorage.setItem('leaf.boot-window', '1')
    return view
  } catch {
    return null
  }
}

export const useLibraryTabs = defineStore('libraryTabs', {
  state: () => {
    const persisted = loadPersisted()
    const bootView = consumeBootView()
    const tab = bootView ? makeTab(bootView, bootView) : (persisted?.tab ?? makeTab())
    const history = bootView ? [bootView] : (persisted?.history ?? ['all'])
    return {
      tab,
      /** 视图历史栈（view 字符串；标题由视图层按数据解析） */
      history,
      histIdx: bootView ? 0 : (persisted?.histIdx ?? 0),
      /** 二十六轮：锁定筛选（Eagle ic-filter-lock）——切换视图时维度筛选跟随 */
      filterLocked: persisted?.filterLocked ?? false
    }
  },

  getters: {
    /** 兼容消费方命名（原多标签时代的 active） */
    active(state): LibraryTab {
      return state.tab
    },
    activeView(state): string {
      return state.tab.view
    },
    canBack(state): boolean {
      return state.histIdx > 0
    },
    canForward(state): boolean {
      return state.histIdx < state.history.length - 1
    }
  },

  actions: {
    persist(): void {
      try {
        // 十五轮 D18：引导窗口（新窗口打开）不回写持久化，主窗口保持持久化真理源
        if (sessionStorage.getItem('leaf.boot-window') === '1') return
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            tab: this.tab,
            history: this.history,
            histIdx: this.histIdx,
            filterLocked: this.filterLocked
          } satisfies PersistedState)
        )
      } catch {
        /* 隐私模式等场景忽略 */
      }
    },

    /**
     * 切换视图并压入历史栈（默认行为）。
     * back/forward 内部走 pushHistory=false，不重复入栈。
     * 二十六轮：Eagle 锁定语义——锁定时维度筛选跨视图携带；未锁定且视图变化时清空
     * （审查 I3：此前 filterLocked 无 observable 行为，未锁定分支与已锁分支同义）。
     */
    setView(view: string, title: string, opts?: { history?: boolean }): void {
      const viewChanged = this.tab.view !== view
      const carried = this.filterLocked ? pickFilterFields(this.tab) : null
      this.tab.view = view
      this.tab.title = title
      if (carried) {
        Object.assign(this.tab, carried)
      } else if (viewChanged) {
        applyFreshFilterFields(this.tab)
      }
      if (opts?.history !== false) {
        // 截断前进分支后压栈；同视图连续跳转不重复记录
        if (this.history[this.histIdx] !== view) {
          this.history = this.history.slice(0, this.histIdx + 1)
          this.history.push(view)
          if (this.history.length > HISTORY_LIMIT) {
            this.history = this.history.slice(-HISTORY_LIMIT)
          }
          this.histIdx = this.history.length - 1
        }
      }
      this.persist()
    },

    /** 侧栏/树点击打开视角（保留旧 API 名，等价 setView） */
    openView(view: string, title: string): void {
      this.setView(view, title)
    },

    back(): void {
      if (!this.canBack) return
      const prevView = this.tab.view
      const carried = this.filterLocked ? pickFilterFields(this.tab) : null
      this.histIdx -= 1
      const view = this.history[this.histIdx]
      this.tab.view = view
      this.tab.title = defaultTitleForView(view)
      if (carried) {
        Object.assign(this.tab, carried)
      } else if (view !== prevView) {
        applyFreshFilterFields(this.tab)
      }
      this.persist()
    },

    forward(): void {
      if (!this.canForward) return
      const prevView = this.tab.view
      const carried = this.filterLocked ? pickFilterFields(this.tab) : null
      this.histIdx += 1
      const view = this.history[this.histIdx]
      this.tab.view = view
      this.tab.title = defaultTitleForView(view)
      if (carried) {
        Object.assign(this.tab, carried)
      } else if (view !== prevView) {
        applyFreshFilterFields(this.tab)
      }
      this.persist()
    },

    /** 二十六轮：清除全部维度筛选（Eagle ic-filter-reset） */
    clearDimensionFilters(): void {
      applyFreshFilterFields(this.tab)
      this.persist()
    },

    /** 二十六轮：切换锁定筛选 */
    toggleFilterLock(): void {
      this.filterLocked = !this.filterLocked
      this.persist()
    },

    /** 轻量持久化：筛选/布局等字段被外部直接改写后调用（FilterBar/TitleBar） */
    touch(): void {
      this.persist()
    },

    /** 视图层数据就绪后修正标题（相册/文件夹/智能夹真名） */
    syncTitle(title: string): void {
      if (this.tab.title !== title) {
        this.tab.title = title
        this.persist()
      }
    },

    /** 数据驱动标题：相册/智能夹/文件夹更名后由视图层调用 */
    retitleByViewPrefix(prefix: string, id: string, title: string): void {
      if (this.tab.view === `${prefix}${id}`) {
        this.tab.title = title
      }
      this.persist()
    },

    /** 视角失效（相册/智能夹/文件夹被删）：回退图库并截断历史 */
    invalidateViews(check: (view: string) => boolean): void {
      if (check(this.tab.view)) {
        this.tab.view = 'all'
        this.tab.title = '全部'
      }
      this.history = this.history.filter((v) => !check(v))
      if (this.history.length === 0) this.history = ['all']
      this.histIdx = Math.min(this.histIdx, this.history.length - 1)
      if (this.history[this.histIdx] !== this.tab.view) {
        this.histIdx = this.history.indexOf(this.tab.view)
        if (this.histIdx < 0) {
          this.histIdx = this.history.length - 1
          this.tab.view = this.history[this.histIdx]
          this.tab.title = defaultTitleForView(this.tab.view)
        }
      }
      this.persist()
    },

    /** 测试辅助：清空持久化并重置为默认视图 */
    resetForTests(): void {
      try {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      } catch {
        /* ignore */
      }
      this.tab = makeTab()
      this.history = ['all']
      this.histIdx = 0
      this.filterLocked = false
    }
  }
})

/** 视图默认标题（数据驱动标题覆盖前先给个兜底） */
export function defaultTitleForView(view: string): string {
  if (view === 'all') return '全部'
  if (view === 'untagged') return '未加标签'
  if (view === 'favorites') return '收藏'
  if (view === 'map') return '地图'
  if (view === 'trash') return '回收站'
  if (view === 'duplicates') return '相似查重'
  if (view === 'unsorted') return '未分类'
  if (view === 'recent') return '最近添加'
  if (view === 'recents') return '最近查看'
  if (view.startsWith('similar:')) return '相似图片'
  if (view.startsWith('smart:')) return '智能文件夹'
  if (view.startsWith('album:')) return '相册'
  if (view.startsWith('folder:')) return '文件夹'
  if (view.startsWith('tag:')) return '标签'
  return '图库'
}
