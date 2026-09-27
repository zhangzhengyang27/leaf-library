/**
 * Leaf 素材库 · 视图模型与筛选（D-008 重构）
 *
 * 从原 index.vue 迁出：视图分支判断、类型/色相/格式/分辨率/时间快筛、
 * 关键词匹配、排序、分组 displaySections 与预览翻页池 currentPool。
 * 筛选状态存于活动 tab（useLibraryTabs），切 tab 自动保留各自筛选。
 *
 * 模块级单例：所有 computeds 内部即时读取 tabs.active，tab 切换自动响应。
 */
import { computed, ref, watch } from 'vue'
import { hueBucketOf, type HueBucket } from '@utils/photoColor'
import { accuracyToMaxDelta, colorListCloseTo } from '@shared/colorMatch'
import type { Photo, PhotoSection } from '@renderer/types/photo'
import {
  useLibraryTabs,
  type DisplayOptions,
  type LibraryLayout,
  type LibrarySort,
  type OrientationValue
} from '@renderer/stores/libraryTabs'
import { usePhotoData } from './usePhotoData'
import { searchMatch, type SearchScopeOptions } from './useAdvancedSearch'
import { useQueryWords } from './useQueryWords'
import { useSearchScopes } from '../constants/searchScopes'
import { buildFiltersSpec, buildSearchSpec, RESOLUTION_MIN } from './usePhotoFilterSpec'
import type { PhotoFolder } from '@renderer/types/photo'

const DAY_MS = 86_400_000

let cachedDayKey = -1
let cachedTodayStart = 0
/** 今日 0 点（按天缓存；审查 M12：计数循环避免对每张图构造 Date） */
function todayStart(): number {
  const dayKey = Math.floor(Date.now() / DAY_MS)
  if (dayKey !== cachedDayKey) {
    cachedDayKey = dayKey
    cachedTodayStart = new Date().setHours(0, 0, 0, 0)
  }
  return cachedTodayStart
}

/**
 * 二十六轮：导入时间预设判定（matchQuick 与筛选行计数共用）。
 * 昨日=仅昨天当天（不含今日），其余=自今日 0 点/ N 日前起算。
 */
function matchImportTimePreset(p: Photo, t: string): boolean {
  const ts = todayStart()
  if (t === 'today') return p.importedAt >= ts
  if (t === 'yesterday') return p.importedAt >= ts - DAY_MS && p.importedAt < ts
  const days = t === '7d' ? 7 : t === '90d' ? 90 : t === '365d' ? 365 : 30
  return p.importedAt >= Date.now() - days * DAY_MS
}

/** 二十七轮：时间预设 → [start, end) 边界（保存筛选→智能夹规则映射用；end=0 无上界） */
function importTimePresetBounds(t: string): [number, number] {
  const ts = todayStart()
  if (t === 'today') return [ts, 0]
  if (t === 'yesterday') return [ts - DAY_MS, ts]
  const days = t === '7d' ? 7 : t === '90d' ? 90 : t === '365d' ? 365 : 30
  return [Date.now() - days * DAY_MS, 0]
}

/** 二十六轮：扩展名（小写，无扩展名 = ''）——格式维度多选/排除共用 */
function extOfFile(p: Photo): string {
  const idx = p.fileName.lastIndexOf('.')
  return idx >= 0 ? p.fileName.slice(idx + 1).toLowerCase() : ''
}

/** 二十六轮：形状归类（无宽高 = null）——形状维度多选/排除与计数共用 */
function shapeOf(p: Photo): OrientationValue | null {
  if (!p.width || !p.height) return null
  const ratio = p.width / p.height
  if (ratio >= 3) return 'panoramic'
  if (ratio <= 1 / 3) return 'panoramicPortrait'
  if (ratio > 1.1) return 'landscape'
  if (ratio < 0.9) return 'portrait'
  return 'square'
}

/** 二十六轮：比例容差匹配（Eagle 形状弹层 3:4 等比例行；±2% 相对容差） */
function ratioMatches(p: Photo, target: [number, number]): boolean {
  if (!p.width || !p.height) return false
  const t = target[0] / target[1]
  if (t <= 0) return false
  return Math.abs(p.width / p.height - t) / t <= 0.02
}

/**
 * 关键词匹配（round20：集成高级搜索 OR/括号/引号/排除词）。
 * 无高级语法时走原快速路径（空格 AND），保证性能。
 */
function matchKeyword(p: Photo, query: string, opts?: SearchScopeOptions): boolean {
  // 词由主进程分词后经 useQueryWords 缓存传过来：两侧各切一次会得出两套结果
  return searchMatch(p, query, {
    ...opts,
    words: opts?.words ?? useQueryWords().wordsFor(query)
  })
}

/** 素材所属文件夹的名称/描述（folderName/folderDesc 搜索范围用）。
 *  收 Map：筛选每次变化对全池逐图调用，旧实现 folders.find 是 O(N×F)。 */
function folderScopeTextOf(
  p: Photo,
  folderMap: Map<string, PhotoFolder>
): { folderName: string; folderDesc: string } {
  if (p.folderId == null) return { folderName: '', folderDesc: '' }
  const f = folderMap.get(p.folderId)
  return { folderName: f?.name ?? '', folderDesc: f?.description ?? '' }
}

function groupByDate(photos: Photo[]): PhotoSection[] {
  const grouped = new Map<string, Photo[]>()
  for (const photo of photos) {
    if (!grouped.has(photo.dateSection)) {
      grouped.set(photo.dateSection, [])
    }
    grouped.get(photo.dateSection)!.push(photo)
  }
  return Array.from(grouped.entries())
    .map(([dateSection, photos]) => ({ dateSection, photos }))
    .sort((a, b) => b.dateSection.localeCompare(a.dateSection))
}

/** D-012「显示子文件夹内容」：根文件夹 ∪ 全部后代的 id 集（导出供单测断言形状） */
export function descendantFolderIds(
  folders: Array<{ id: string; parentId: string | null }>,
  rootId: string
): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const f of folders) {
    if (f.parentId == null) continue
    const arr = childrenOf.get(f.parentId) ?? []
    arr.push(f.id)
    childrenOf.set(f.parentId, arr)
  }
  const out = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const cur = queue.pop() as string
    for (const c of childrenOf.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c)
        queue.push(c)
      }
    }
  }
  return out
}

/**
 * 组内排序（D-012：对齐 Eagle 排列方式；imported 保持导入序/日期分组序）。
 * 随机模式不走这里——由 shuffle 字段驱动 stableShuffleOrder。
 */
function sortPhotos(photos: Photo[], sortBy: string, asc = false): Photo[] {
  const sorted = sortPhotosBase(photos, sortBy)
  if (!asc) return sorted
  // 升序：整组反转后置顶项仍保持在最前（Eagle 行为）
  const rev = [...sorted].reverse()
  return [...rev.filter((p) => p.pinnedAt), ...rev.filter((p) => !p.pinnedAt)]
}

function sortPhotosBase(photos: Photo[], sortBy: string): Photo[] {
  // R5 置顶：pinnedAt 优先（稳定排序，组内保持原序）
  const by = (cmp: (a: Photo, b: Photo) => number): Photo[] =>
    [...photos].sort((a, b) => Number(!!b.pinnedAt) - Number(!!a.pinnedAt) || cmp(a, b))
  const extOf = (p: Photo): string => {
    const i = p.fileName.lastIndexOf('.')
    return i < 0 ? '' : p.fileName.slice(i + 1).toLowerCase()
  }
  const pixelsOf = (p: Photo): number => (p.width ?? 0) * (p.height ?? 0)
  switch (sortBy) {
    case 'name': // Eagle「标题」
      return by((a, b) => a.fileName.localeCompare(b.fileName))
    case 'modified': // 文件系统修改时间，缺列回退 updated_at
      return by((a, b) => (b.fsModifiedAt ?? b.modifiedAt) - (a.fsModifiedAt ?? a.modifiedAt))
    case 'created': // 文件系统创建时间，缺列回退拍摄/更新时间
      return by((a, b) => (b.fsCreatedAt ?? b.createdAt) - (a.fsCreatedAt ?? a.createdAt))
    case 'extension':
      return by((a, b) => extOf(a).localeCompare(extOf(b)) || a.fileName.localeCompare(b.fileName))
    case 'size':
      return by((a, b) => b.fileSize - a.fileSize)
    case 'dimensions':
      return by((a, b) => pixelsOf(b) - pixelsOf(a))
    case 'rating':
      return by((a, b) => b.rating - a.rating)
    case 'duration':
      return by((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    default: // imported（置顶仍优先，组内保持导入序）
      return [...photos].sort((a, b) => Number(!!b.pinnedAt) - Number(!!a.pinnedAt))
  }
}

// ── 相似结果池（由 useDuplicateScan 反向注入，避免循环依赖）──

const similarMatches = ref<Photo[]>([])
const similarSourceName = ref('')

export function installSearchPools(): {
  similarMatches: typeof similarMatches
  similarSourceName: typeof similarSourceName
} {
  return { similarMatches, similarSourceName }
}

/**
 * §2.C 随机模式稳定化：仅在「视图候选池成员」变化时重新洗牌，
 * 改筛选/排序/关键词等不重排，避免每次 computed 重算都重新乱序导致跳动。
 */
let shuffleKey = ''
let shuffleIds: string[] = []

/**
 * 代码审查 S2：轻量池指纹替代 `pool.map(id).join('|')`（5 万条 ≈ 30 万字符的
 * O(N) 拼接 + 大字符串比较）。首/尾 + 8 等距采样，碰撞概率极低且即使碰撞
 * 也只是少一次重排，不影响正确性。
 */
function poolFingerprint(pool: Photo[]): string {
  if (pool.length === 0) return '0'
  let f = `${pool.length}:${pool[0].id}:${pool[pool.length - 1].id}`
  const step = Math.max(1, Math.floor(pool.length / 8))
  for (let i = step; i < pool.length; i += step) f += `:${pool[i].id}`
  return f
}

function stableShuffleOrder(pool: Photo[]): string[] {
  const key = poolFingerprint(pool)
  if (key !== shuffleKey) {
    shuffleIds = pool.map((p) => p.id)
    for (let i = shuffleIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffleIds[i], shuffleIds[j]] = [shuffleIds[j], shuffleIds[i]]
    }
    shuffleKey = key
  }
  return shuffleIds
}

function build() {
  const tabs = useLibraryTabs()
  const data = usePhotoData()
  /** 二十七轮：搜索范围（Eagle ˅ 面板勾选集；模块单例 ref，勾选即触发结果重算） */
  const searchScopes = useSearchScopes()

  /** 活动 tab（computed 引用，切 tab 自动跟随） */
  const tab = computed(() => tabs.active)

  // ── 视图分支 ──
  const isTrashView = computed(() => tab.value.view === 'trash')
  const isMapView = computed(() => tab.value.view === 'map')
  const isDuplicateView = computed(() => tab.value.view === 'duplicates')
  const isSimilarView = computed(() => tab.value.view.startsWith('similar:'))
  const activeAlbumId = computed(() =>
    tab.value.view.startsWith('album:') ? tab.value.view.slice(6) : null
  )
  const activeAlbum = computed(
    () => data.albums.value.find((a) => a.id === activeAlbumId.value) ?? null
  )
  const activeFolderId = computed(() =>
    tab.value.view.startsWith('folder:') ? tab.value.view.slice(7) : null
  )
  const activeFolder = computed(
    () => data.folders.value.find((f) => f.id === activeFolderId.value) ?? null
  )
  const activeSmartAlbumId = computed(() =>
    tab.value.view.startsWith('smart:') ? tab.value.view.slice(6) : null
  )
  const activeSmartAlbum = computed(
    () => data.smartAlbums.value.find((a) => a.id === activeSmartAlbumId.value) ?? null
  )

  // ── 十二轮：文件夹独立视图设置（m005，对齐 Eagle 每文件夹覆盖）──

  /** 生效布局：文件夹覆盖优先于全局 */
  const viewLayout = computed<LibraryLayout>(() => {
    const o = activeFolder.value?.viewLayout
    return o && o !== 'global' ? (o as LibraryLayout) : tab.value.layout
  })
  /** 生效排列：文件夹覆盖优先于全局 */
  const viewSortBy = computed<LibrarySort>(() => {
    const o = activeFolder.value?.viewSort
    return o && o !== 'global' ? (o as LibrarySort) : tab.value.sortBy
  })
  /** 生效显示开关：文件夹 JSON 覆盖逐键合并于全局 */
  const viewDisplay = computed<DisplayOptions>(() => {
    const raw = activeFolder.value?.viewDisplay
    if (!raw) return tab.value.display
    try {
      return { ...tab.value.display, ...(JSON.parse(raw) as Partial<DisplayOptions>) }
    } catch {
      return tab.value.display
    }
  })

  /** 搜索模式：有关键词且不是回收站/查重/相似等专用视图 */
  const isSearchMode = computed(
    () =>
      !!tab.value.searchKeyword.trim() &&
      !isTrashView.value &&
      !isDuplicateView.value &&
      !isSimilarView.value
  )

  /** 筛选器可见性（trash/查重/相似不显示快筛） */
  const showFilters = computed(
    () => !isTrashView.value && !isDuplicateView.value && !isSimilarView.value
  )

  // ── 快筛匹配 ──

  function matchKind(p: Photo): boolean {
    return !tab.value.kindFilter || p.kind === tab.value.kindFilter
  }

  function matchColor(p: Photo): boolean {
    const close = tab.value.colorClose
    if (close) {
      // 近似色档与主进程 color_close() 必须同口径（同一份 @shared/colorMatch）：
      // 两条路径不一致就会「切一下分页开关，同一筛选的结果变了」
      const colors = [p.colorDominant, ...(p.palette ?? [])].filter((c): c is string => !!c)
      return colorListCloseTo(colors, close.hex, accuracyToMaxDelta(close.accuracy))
    }
    if (!tab.value.colorFilter) return true
    return !!p.colorDominant && hueBucketOf(p.colorDominant) === tab.value.colorFilter
  }

  /** 二十六轮：精确评分多选（含 0=尚未评分；空集不限；排除集优先于「尚未评分」外的判断） */
  function matchRating(p: Photo): boolean {
    const inc = tab.value.ratingInclude
    if (inc.length > 0) return inc.includes(p.rating)
    const ex = tab.value.ratingExclude
    return ex.length === 0 || !ex.includes(p.rating)
  }

  /** §2.C 文件大小区间（字节） */
  function matchSize(p: Photo): boolean {
    const r = tab.value.sizeRange
    if (!r) return true
    const [min, max] = r
    if (min > 0 && p.fileSize < min) return false
    if (max > 0 && p.fileSize > max) return false
    return true
  }

  /** 二十六轮：形状多选包含/排除 + 比例筛选（Eagle 形状弹层语义） */
  function matchShape(p: Photo): boolean {
    const r = tab.value.ratioFilter
    const ex = tab.value.shapeExclude
    const inc = tab.value.shapeInclude
    if (r) {
      // 比例筛选与横/竖归类叠加生效（AND，审查 M9：并非命中即通过）
      if (!ratioMatches(p, r)) return false
    }
    const v = shapeOf(p)
    if (v && ex.includes(v)) return false
    if (inc.length > 0) return v !== null && inc.includes(v)
    return true
  }

  /** §2.C 标签多选（AND/OR 逻辑可切，二十六轮：+ Eagle「等同」= 标签集合完全一致）；排除标签 + 仅看未标签 */
  function matchTags(p: Photo): boolean {
    if (tab.value.untaggedOnly && p.tags.length > 0) return false
    const ex = tab.value.tagExclude
    if (ex.length > 0) {
      const exLower = ex.map((e) => e.toLowerCase())
      if (p.tags.some((pt) => exLower.includes(pt.toLowerCase()))) return false
    }
    const t = tab.value.tagFilter
    if (!t || t.length === 0) return true
    const has = (tag: string): boolean =>
      p.tags.some((pt) => pt.toLowerCase() === tag.toLowerCase())
    if (tab.value.tagMatchExact) {
      // Eagle ic-logic-equal：素材标签集合与选中集合完全一致
      if (p.tags.length !== t.length) return false
      return t.every(has)
    }
    return tab.value.tagMatchAny ? t.some(has) : t.every(has)
  }

  /** §2.C 排除关键词 */
  function matchExclude(p: Photo): boolean {
    const kw = tab.value.excludeKeyword.trim().toLowerCase()
    if (!kw) return true
    return !(
      p.fileName.toLowerCase().includes(kw) ||
      (p.description ?? '').toLowerCase().includes(kw) ||
      p.tags.some((t) => t.toLowerCase().includes(kw))
    )
  }

  /** §2.C 自定义时间区间（按导入时间） */
  function matchCustomTime(p: Photo): boolean {
    const c = tab.value.customTime
    if (!c) return true
    const [from, to] = c
    if (from > 0 && p.importedAt < from) return false
    if (to > 0 && p.importedAt > to) return false
    return true
  }

  /** D-012 时长区间（ms） */
  function matchDuration(p: Photo): boolean {
    const r = tab.value.durationRange
    if (!r) return true
    const [min, max] = r
    const d = p.durationMs
    if (d == null) return false
    if (min > 0 && d < min) return false
    if (max > 0 && d > max) return false
    return true
  }

  /** D-012 描述/备注关键词（⑤：支持 Eagle「完全相等」逻辑） */
  function matchNoteKeyword(p: Photo): boolean {
    const kw = tab.value.noteKeyword.trim().toLowerCase()
    if (!kw) return true
    const desc = (p.description ?? '').toLowerCase()
    return tab.value.noteKeywordExact ? desc === kw : desc.includes(kw)
  }

  /** D-012 文件夹筛选（'' = 不限，'none' = 未分类）；五轮：多选并/交 + 排除 */
  function matchFolderFilter(p: Photo): boolean {
    const ex = tab.value.folderExcludeIds
    if (ex.length > 0) {
      if (p.folderId == null) {
        if (ex.includes('none')) return false
      } else if (ex.includes(p.folderId)) {
        return false
      }
    }
    const ids = tab.value.folderFilterIds
    if (ids.length > 0) {
      const inSet = (id: string): boolean =>
        id === 'none' ? p.folderId == null : p.folderId === id
      return tab.value.folderMatchAll ? ids.every(inSet) : ids.some(inSet)
    }
    const f = tab.value.folderFilter
    if (!f) return true
    if (f === 'none') return p.folderId == null
    return p.folderId === f
  }

  /** D-012 修改日期区间（按文件系统修改时间，缺列视为不匹配） */
  function matchModifiedTime(p: Photo): boolean {
    const r = tab.value.modifiedTimeRange
    if (!r) return true
    const [from, to] = r
    const m = p.fsModifiedAt
    if (m == null) return false
    if (from > 0 && m < from) return false
    if (to > 0 && m > to) return false
    return true
  }

  /** 二十六轮：链接筛选（⑤：支持 Eagle「完全相等」逻辑） */
  function matchUrlKeyword(p: Photo): boolean {
    const kw = tab.value.urlKeyword.trim().toLowerCase()
    if (!kw) return true
    const url = (p.sourceUrl ?? '').toLowerCase()
    return tab.value.urlKeywordExact ? url === kw : url.includes(kw)
  }

  /**
   * M4 标注维本地判定（与 buildSmartAlbumWhere 的 EXISTS/NOT EXISTS 同口径）：
   * 分页主池/收藏/文件夹/搜索由 SQL 下推；相册/智能夹/最近添加/随机等仍走 matchAll
   * 的路径靠这份在场信息。真值三态：true=有 / false=无 / null=计数未到——
   * 未知放行（不误杀），计数落地后 computed 自然重算。
   */
  function annotationHas(p: Photo): boolean | null {
    const known = annotationPresence.value.get(p.id)
    if (known !== undefined) return known
    // 徽标缓存（M3，开关打开时才有数据）能补的先补，省一次闪烁
    const badge = data.annotationCounts.value.get(p.id)
    return badge === undefined ? null : badge > 0
  }
  function matchAnnotation(p: Photo): boolean {
    const f = tab.value.annotationFilter
    if (!f) return true
    const has = annotationHas(p)
    if (has === null) return true
    return f === 'any' ? has : !has
  }

  function matchQuick(p: Photo): boolean {
    if (tab.value.resolutionFilter) {
      const min = RESOLUTION_MIN[tab.value.resolutionFilter]
      if (Math.max(p.width ?? 0, p.height ?? 0) < min) return false
    }
    if (tab.value.timeFilter) {
      // 八轮：对齐 Eagle 筛选选项（今日/昨日/最近 7/30/90/365 日）
      if (!matchImportTimePreset(p, tab.value.timeFilter)) return false
    }
    return true
  }

  /** 二十六轮：格式多选包含/排除（Eagle 格式弹层 左键选择/右键排除） */
  function matchFormat(p: Photo): boolean {
    const ext = extOfFile(p)
    const ex = tab.value.formatExclude
    if (ex.length > 0 && ex.includes(ext)) return false
    const inc = tab.value.formatInclude
    if (inc.length > 0) return inc.includes(ext)
    return true
  }

  /** 全部快筛叠加：类型 + 颜色 + 格式/分辨率/时间 + §2.C 检索项 + D-012 维度 + M4 标注 */
  function matchAll(p: Photo): boolean {
    return (
      matchKind(p) &&
      matchColor(p) &&
      matchFormat(p) &&
      matchQuick(p) &&
      matchRating(p) &&
      matchSize(p) &&
      matchShape(p) &&
      matchTags(p) &&
      matchExclude(p) &&
      matchCustomTime(p) &&
      matchDuration(p) &&
      matchNoteKeyword(p) &&
      matchUrlKeyword(p) &&
      matchFolderFilter(p) &&
      matchModifiedTime(p) &&
      matchAnnotation(p)
    )
  }

  /**
   * 二十六轮：任一维度筛选生效（Eagle 生效态：负向 token / 行尾 保存·锁定·清除 /
   * 漏斗蓝点 / 面包屑「搜索结果 (N)」的判定源）。不含关键词搜索与布局显示项。
   */
  const hasDimensionFilters = computed<boolean>(() => {
    const t = tab.value
    return (
      !!t.kindFilter ||
      !!t.colorFilter ||
      !!t.colorClose ||
      t.formatInclude.length > 0 ||
      t.formatExclude.length > 0 ||
      !!t.resolutionFilter ||
      !!t.timeFilter ||
      t.ratingInclude.length > 0 ||
      t.ratingExclude.length > 0 ||
      !!t.sizeRange ||
      t.shapeInclude.length > 0 ||
      t.shapeExclude.length > 0 ||
      !!t.ratioFilter ||
      t.tagFilter.length > 0 ||
      t.tagExclude.length > 0 ||
      t.untaggedOnly ||
      !!t.annotationFilter ||
      !!t.folderFilter ||
      t.folderFilterIds.length > 0 ||
      t.folderExcludeIds.length > 0 ||
      !!t.customTime ||
      !!t.modifiedTimeRange ||
      !!t.durationRange ||
      !!t.noteKeyword ||
      !!t.urlKeyword ||
      !!t.excludeKeyword
    )
  })

  // ── 分页化阶段 2：主视图分页门控（docs/PAGINATION_DESIGN.md）──
  // 仅当「无维度筛选 + 非搜索/地图/查重/相似/随机/AI 视图」时，主池可窗口取数
  // （imported_at 流序与全量路径一致，展示语义逐字节相同）。
  // 地图/查重/相似从 allPhotos 派生专用池，必须全量；筛选激活即翻假，
  // 翻转时触发一次 loadPhotos 在「窗口 ↔ 全量」间切换（回退语义）。
  const canPageMain = computed(
    () =>
      // 阶段 3：维度筛选已下推 SQL（buildFiltersSpec → getPage.filters），
      // 不再因此退回全量路径；搜索视图走全局搜索池分支
      !isSearchMode.value &&
      !isMapView.value &&
      !isDuplicateView.value &&
      !isSimilarView.value &&
      !isTrashView.value &&
      !tab.value.shuffle &&
      tab.value.view !== 'random'
  )
  // 静态回滚开关（设计文档不变式 #4）：localStorage 置 'leaf:use-paged-main'='0'
  // 强制走全量路径；动态门控负责筛选激活时的自动切换
  // 阶段 3：首帧注入初始 spec（不触发重载）
  data.setPagedFilters(((s) => (Object.keys(s).length > 0 ? s : undefined))(buildFiltersSpec()))
  /**
   * 维度筛选变化 → 重载「当前展示的那个分页池」。
   * 四个池（主/收藏/文件夹/搜索）共用同一份 spec（setPagedFilters 注入）；分支顺序
   * 与 displaySections 的池优先级一致——早先只重载主池，收藏/文件夹/搜索视图下
   * 点筛选 chip 亮起、网格不动（那三个池既不下推，展示层也不再本地 matchAll）。
   */
  const reloadPagedPoolForSpec = (): void => {
    if (isSearchMode.value) {
      // 搜索池要连关键词一起重装配：只下发维度 spec 会丢掉 searchKeyword/AST
      const q = tab.value.searchKeyword
      if (data.usePagedSearch()) void data.loadSearchPage(true, q, buildSearchSpec(q))
      return
    }
    if (tab.value.view === 'favorites') {
      if (data.usePagedFavorites()) void data.loadFavoritesPage(true)
      return
    }
    if (activeFolderId.value) {
      if (data.usePagedFolder()) void data.loadFolderPage(true)
      return
    }
    if (canPageMain.value && data.mainPagedActive.value) void data.loadPhotos()
  }
  // 阶段 3：维度筛选变化 → 注入 spec 并重载分页池
  watch(
    () => JSON.stringify(buildFiltersSpec()),
    () => {
      const spec = buildFiltersSpec()
      data.setPagedFilters(Object.keys(spec).length > 0 ? spec : undefined)
      // 非 immediate：首帧不重载（应用启动自会加载）；仅筛选变化时分页态重载
      reloadPagedPoolForSpec()
    }
  )
  data.registerMainPageGate(() => {
    try {
      if (localStorage.getItem('leaf:use-paged-main') === '0') return false
    } catch {
      /* localStorage 不可用时按开关开启处理 */
    }
    return canPageMain.value
  })
  watch(canPageMain, (on, off) => {
    if (on !== off) void data.loadPhotos()
  })

  // ── 文件夹拍平 scope 注入（特性：子文件夹卡片 + D-012「显示子文件夹内容」回归修复）──
  // 生效值 = viewDisplay（文件夹覆盖已并入全局），卡片显隐与拍平取数共用这一个真值源。
  // scope（根 ∪ 后代 id 集）交给 usePhotoData 决定两条取数路径：分页走
  // view:'all' + filters.folderIds IN 下推；非分页回滚走 queryPhotosByRules——
  // 两条都不再依赖主视图 allPhotos 分页累积池（过期/部分，正是原回归根因）。
  // 视图切换时的池刷新由 bindViewWatcher 负责（其 watcher 在本文件之后创建，
  // 回调先于它执行，scope 先就位）；这里只在「开关原地翻转 / folders 落地改变
  // scope」时补一次刷新，避免与 bindViewWatcher 双重拉取。
  const includeSubfoldersActive = computed(() => viewDisplay.value.includeSubfolders)
  let lastFolderScopeKey = ''
  let prevScopedFolderId: string | null = null
  watch(
    [activeFolderId, includeSubfoldersActive, () => data.folders.value],
    ([fid, inc]) => {
      if (!fid) {
        data.setFolderPageScope(null)
        prevScopedFolderId = null
        lastFolderScopeKey = ''
        return
      }
      const scope = inc ? Array.from(descendantFolderIds(data.folders.value, fid)) : null
      data.setFolderPageScope(scope)
      const key = scope ? [...scope].sort().join(',') : ''
      const fidUnchanged = fid === prevScopedFolderId
      prevScopedFolderId = fid
      // 同一文件夹内的原地翻转（或 folders 晚到改变后代集）才需要本侧补刷新；
      // 换文件夹的刷新由 bindViewWatcher 兜住，这里只记 key 不拉取
      if (!fidUnchanged || key === lastFolderScopeKey) {
        lastFolderScopeKey = key
        return
      }
      lastFolderScopeKey = key
      void data.refreshFolderPhotos(fid)
    },
    { immediate: true }
  )

  // ── 翻页池（视图候选池，未叠加快筛）──

  const currentPool = computed<Photo[]>(() => {
    if (isMapView.value) {
      return data.allPhotos.value.filter((p) => p.latitude != null && p.longitude != null)
    }
    if (isSimilarView.value) return similarMatches.value
    if (activeFolderId.value) return data.folderPhotos.value
    if (activeAlbumId.value) return data.albumPhotos.value
    if (activeSmartAlbumId.value) return data.smartAlbumPhotos.value
    if (tab.value.view === 'unsorted') return data.unsortedPhotos.value
    if (tab.value.view === 'recent') return data.recentPhotos.value
    if (tab.value.view === 'recents') return data.recentViewedPhotos.value
    return data.allPhotos.value
  })

  // ── M4 标注维：客户端在场信息（photoId → 是否有标注）──
  // 维度激活时才拉（不激活零 IPC）；与 usePhotoData 的徽标计数缓存（M3）解耦——
  // 那份只在徽标开关打开时补拉，且截断在 2000 id，做筛选判据不够格。
  // 分块 500 对齐 repo 的 IN 上限；合并进缓存（往返回切视图不重拉已知的 id）。
  const annotationPresence = ref(new Map<string, boolean>())
  let annotationSeq = 0
  const ANNOTATION_CHUNK = 500
  watch(
    [() => tab.value.annotationFilter, currentPool],
    ([f, pool]) => {
      if (!f || pool.length === 0) return
      const seq = ++annotationSeq
      const target = Array.from(new Set(pool.map((p) => p.id)))
      void (async () => {
        const merged = new Map(annotationPresence.value)
        for (let i = 0; i < target.length; i += ANNOTATION_CHUNK) {
          try {
            const rec = await window.api.annotations.count(target.slice(i, i + ANNOTATION_CHUNK))
            if (seq !== annotationSeq) return // 期间翻档/换池：过期响应整体丢弃
            for (const [id, n] of Object.entries(rec)) merged.set(id, n > 0)
          } catch {
            return // 查询失败保持已知子集：matchAnnotation 对未知放行，不误杀
          }
        }
        if (seq !== annotationSeq) return
        annotationPresence.value = merged
      })()
    },
    { immediate: true }
  )

  // ── 展示分组（视图分支 + 关键词 + 快筛 + 组内排序）──

  const displaySections = computed<PhotoSection[]>(() => {
    const sortForView = (photos: Photo[]): Photo[] =>
      sortPhotos(photos, viewSortBy.value, tab.value.sortAsc)

    if (isTrashView.value) {
      // 回收站搜索（拍板 2026-09-27）：关键词在回收站池内过滤（客户端匹配，与搜索
      // 回退路径同口径的 scope 语义）。回收站无快筛 UI，不叠加 matchAll。
      const kw = tab.value.searchKeyword
      if (kw.trim() === '') return groupByDate(data.recycleBinPhotos.value)
      const folderMap = new Map(data.folders.value.map((f) => [f.id, f]))
      return groupByDate(
        data.recycleBinPhotos.value.filter((p) =>
          matchKeyword(p, kw, { scopes: searchScopes.value, ...folderScopeTextOf(p, folderMap) })
        )
      )
    }

    if (isDuplicateView.value) {
      return [] // 查重视图由 DuplicateGroupsView 渲染
    }

    if (isSimilarView.value) {
      return [
        {
          dateSection: `与「${similarSourceName.value}」相似的 ${similarMatches.value.length} 张图片`,
          photos: sortForView(similarMatches.value)
        }
      ]
    }

    if (isSearchMode.value) {
      // 阶段 3：全局搜索池（FTS/scope 下推；默认范围 + 无高级语法时启用）。
      // 池与关键词同步校验防错页（防抖窗口内旧池不显示）。
      // 高级语法已下推（advancedAst），与普通词同池
      if (data.usePagedSearch() && data.searchPoolQuery.value === tab.value.searchKeyword) {
        return groupByDate(data.searchPoolPhotos.value).map((s) => ({
          ...s,
          photos: sortForView(s.photos)
        }))
      }
      // 二十七轮：Eagle「搜索范围」——按 ˅ 面板勾选字段匹配（文件夹名/描述取所属文件夹）；
      // 高级语法（OR/括号/引号/排除词）走客户端匹配（作用于已加载窗口）
      const scopes = searchScopes.value
      // 一次建 Map，整个筛选过程 O(F)；逐图 folders.find 会放大成 O(N×F)
      const folderMap = new Map(data.folders.value.map((f) => [f.id, f]))
      return groupByDate(
        currentPool.value.filter(
          (p) =>
            matchKeyword(p, tab.value.searchKeyword, {
              scopes,
              ...folderScopeTextOf(p, folderMap)
            }) && matchAll(p)
        )
      ).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }))
    }

    // §2.C 随机模式：在当前候选池上打散（查重/相似/AI 视图不受影响；有关键词时上面
    // 的搜索分支已接管——此分支必须排在搜索之后，否则随机视图/ shuffle 开关下搜索
    // 静默失效（2026-09-27 探针复现的回归））
    // 顺序由 stableShuffleOrder 缓存，筛选/排序变化不重排，仅池成员变化才重洗
    // 三轮 G3：侧栏固定项「随机模式」= 专有视图（Eagle 同名入口），与 shuffle 开关叠加生效
    if (tab.value.shuffle || tab.value.view === 'random') {
      const pool = currentPool.value
      const order = stableShuffleOrder(pool)
      const orderIndex = new Map(order.map((id, i) => [id, i]))
      const filtered = pool.filter((p) => matchAll(p))
      filtered.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))
      return [{ dateSection: `随机 · ${filtered.length} 张`, photos: filtered }]
    }

    if (tab.value.view === 'favorites') {
      // 分页化阶段 2：收藏窗口取数（门控开 → 独立收藏池；关 → 主池就地过滤）
      if (data.usePagedFavorites()) {
        // 阶段 3：维度已下推，窗口内不再二次 matchAll
        return groupByDate(data.favoritesPhotos.value).map((s) => ({
          ...s,
          photos: sortForView(s.photos)
        }))
      }
      return groupByDate(currentPool.value.filter((p) => p.isFavorite && matchAll(p))).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }))
    }

    if (tab.value.view === 'untagged') {
      return groupByDate(currentPool.value.filter((p) => p.tags.length === 0 && matchAll(p))).map(
        (s) => ({
          ...s,
          photos: sortForView(s.photos)
        })
      )
    }

    if (activeAlbumId.value) {
      return groupByDate(data.albumPhotos.value.filter(matchAll)).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }))
    }

    if (activeFolderId.value) {
      // 分页态（直属与「显示子文件夹内容」拍平同池）：维度与 folderIds 均已下推 SQL，
      // 窗口内不再二次 matchAll（loadFolderPage 的两种取数形状见 usePhotoData）
      if (data.usePagedFolder()) {
        return groupByDate(data.folderPhotos.value).map((s) => ({
          ...s,
          photos: sortForView(s.photos)
        }))
      }
      // 非分页回滚路径：池已由 refreshFolderPhotos 按 scope 一次取好（直属或 根 ∪ 后代
      // 的 queryPhotosByRules 全量），窗口内本地 matchAll——不再碰 allPhotos 分页累积池
      return groupByDate(data.folderPhotos.value.filter(matchAll)).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }))
    }

    if (activeSmartAlbumId.value) {
      return groupByDate(data.smartAlbumPhotos.value.filter(matchAll)).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }))
    }

    // §3 L4 / §2.B 固定入口视图（未分类 / 最近添加 / 最近查看）
    if (
      tab.value.view === 'unsorted' ||
      tab.value.view === 'recent' ||
      tab.value.view === 'recents'
    ) {
      return groupByDate(currentPool.value.filter(matchAll)).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }))
    }

    // 阶段 3：分页态下维度筛选已下推 SQL，窗口内不再二次 matchAll
    if (data.mainPagedActive.value) {
      return groupByDate(data.allPhotos.value).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }))
    }
    return groupByDate(data.allPhotos.value.filter(matchAll)).map((s) => ({
      ...s,
      photos: sortForView(s.photos)
    }))
  })

  /** 展示区扁平列表（预览翻页 / 键盘导航 / 连选范围共用同一顺序） */
  const flatDisplayPhotos = computed<Photo[]>(() => displaySections.value.flatMap((s) => s.photos))

  const totalCount = computed(() => flatDisplayPhotos.value.length)

  /** 当前视图候选池里实际出现的扩展名（保持格式筛选项随视图收敛） */
  const availableFormats = computed<string[]>(() => {
    const set = new Set<string>()
    for (const p of currentPool.value) {
      const idx = p.fileName.lastIndexOf('.')
      if (idx >= 0) set.add(p.fileName.slice(idx + 1).toLowerCase())
    }
    return Array.from(set).sort()
  })

  return {
    tab,
    viewLayout,
    viewSortBy,
    viewDisplay,
    isTrashView,
    isMapView,
    isDuplicateView,
    isSimilarView,
    activeAlbumId,
    activeAlbum,
    activeFolderId,
    activeFolder,
    activeSmartAlbumId,
    activeSmartAlbum,
    isSearchMode,
    showFilters,
    matchAll,
    matchKeyword,
    /** M4 标注维本地真值（FilterBar 两档计数用；true/false/null=未知） */
    annotationHas,
    hasDimensionFilters,
    currentPool,
    displaySections,
    flatDisplayPhotos,
    totalCount,
    availableFormats
  }
}

type Filters = ReturnType<typeof build>

let singleton: Filters | null = null

/** 模块单例：photo 视图内所有消费方共享同一份视图模型 */
export function usePhotoFilters(): Filters {
  if (!singleton) singleton = build()
  return singleton
}

/** 二十六轮：扩展名归类（格式维度计数用） */
export {
  extOfFile,
  shapeOf,
  ratioMatches,
  matchImportTimePreset,
  importTimePresetBounds,
  RESOLUTION_MIN
}

export type { HueBucket }
