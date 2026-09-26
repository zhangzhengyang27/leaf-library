/**
 * Leaf · 筛选维度语义 spec 构建（分页化阶段 3）
 *
 * 把活动 tab 的筛选状态映射为 SmartAlbumRules 形状（主进程拼 WHERE，
 * 渲染层不可传 SQL 片段）。与 usePhotoFilters.matchAll 的谓词逐项对齐；
 * 语义漂移会导致分页/全量路径结果不一致，改任一侧必须同步另一侧。
 *
 * 独立叶子模块：usePhotoSearch（buildFiltersSpec 消费方）与 usePhotoFilters
 * 存在既有反向依赖（installSearchPools），不能互相 import。
 */
import type { SearchAstNode, SmartAlbumRules } from '@shared/smartAlbumRules'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { hasAdvancedSyntax, parseSearchQuery } from './useAdvancedSearch'
import { useSearchScopes } from '../constants/searchScopes'
import { useSemanticSearch } from '../constants/semanticSearch'

/** 尺寸快筛档 → 短边像素下限（正向 spec、本地匹配、反向 rulesToFilters 共用一份） */
export const RESOLUTION_MIN: Record<'1k' | '2k' | '4k', number> = {
  '1k': 1280,
  '2k': 1920,
  '4k': 3840
}

const DAY_MS = 86_400_000

let cachedDayKey = -1
let cachedTodayStart = 0
function todayStart(): number {
  const dayKey = Math.floor(Date.now() / DAY_MS)
  if (dayKey !== cachedDayKey) {
    cachedDayKey = dayKey
    cachedTodayStart = new Date().setHours(0, 0, 0, 0)
  }
  return cachedTodayStart
}

/** 时间预设 → [start, end) 边界（end=0 无上界）；与 usePhotoFilters 同实现 */
function importTimePresetBounds(t: string): [number, number] {
  const ts = todayStart()
  if (t === 'today') return [ts, 0]
  if (t === 'yesterday') return [ts - DAY_MS, ts]
  const days = t === '7d' ? 7 : t === '90d' ? 90 : t === '365d' ? 365 : 30
  return [Date.now() - days * DAY_MS, 0]
}

/** 活动 tab 筛选状态 → 语义 spec（搜索词/范围由搜索链路在 spec 上补齐后一并下推） */
export function buildFiltersSpec(): SmartAlbumRules {
  const tab = useLibraryTabs().active
  const spec: SmartAlbumRules = {}

  if (tab.kindFilter) spec.kinds = [tab.kindFilter]
  if (tab.colorFilter) spec.colorHue = tab.colorFilter
  // 近似色档（G3）：与 matchColor 同源，两档互斥所以不会同时下发
  if (tab.colorClose) spec.colorClose = { ...tab.colorClose }
  if (tab.ratingInclude.length > 0) spec.ratingsInclude = [...tab.ratingInclude]
  if (tab.ratingExclude.length > 0) spec.ratingsExclude = [...tab.ratingExclude]

  const [sMin, sMax] = tab.sizeRange ?? [0, 0]
  if (sMin > 0) spec.minFileSize = sMin
  if (sMax > 0) spec.maxFileSize = sMax

  if (tab.shapeInclude.length > 0) spec.shapesInclude = [...tab.shapeInclude]
  if (tab.shapeExclude.length > 0) spec.shapesExclude = [...tab.shapeExclude]
  if (tab.ratioFilter) {
    spec.ratioWidth = tab.ratioFilter[0]
    spec.ratioHeight = tab.ratioFilter[1]
  }

  // 「未标签」视图与「仅看未标签」chip 共用同一个 SQL 谓词：视图侧此前只在已加载的
  // 分页窗口里本地筛（窗口 500 行），窗口外的未标签素材永远看不到
  if (tab.untaggedOnly || tab.view === 'untagged') spec.untaggedOnly = true
  // M4 标注维：''（不限）不下发，'any'/'none' 原样进 spec（EXISTS/NOT EXISTS 由主进程拼）
  if (tab.annotationFilter) spec.annotationFilter = tab.annotationFilter
  if (tab.tagExclude.length > 0) spec.tagNamesExclude = [...tab.tagExclude]
  if (tab.tagFilter.length > 0) {
    if (tab.tagMatchExact) spec.tagNamesExact = [...tab.tagFilter]
    else if (tab.tagMatchAny) spec.tagNamesAny = [...tab.tagFilter]
    else spec.tagNamesAll = [...tab.tagFilter]
  }

  if (tab.excludeKeyword.trim() !== '') spec.excludeKeyword = tab.excludeKeyword.trim()

  const [cFrom, cTo] = tab.customTime ?? [0, 0]
  if (cFrom > 0) spec.importedFrom = cFrom
  if (cTo > 0) spec.importedTo = cTo

  const [dMin, dMax] = tab.durationRange ?? [0, 0]
  if (dMin > 0) spec.minDurationMs = dMin
  if (dMax > 0) spec.maxDurationMs = dMax

  if (tab.noteKeyword.trim() !== '') {
    if (tab.noteKeywordExact) spec.descriptionExact = tab.noteKeyword.trim()
    else spec.descriptionKeyword = tab.noteKeyword.trim()
  }

  // 文件夹：多选优先，其次单选（''=不限，'none'=未分类）
  if (tab.folderFilterIds.length > 0) spec.folderIds = [...tab.folderFilterIds]
  else if (tab.folderFilter === 'none') spec.folderIds = ['none']
  else if (tab.folderFilter) spec.folderIds = [tab.folderFilter]
  if (tab.folderExcludeIds.length > 0) spec.folderExcludeIds = [...tab.folderExcludeIds]

  const [mFrom, mTo] = tab.modifiedTimeRange ?? [0, 0]
  if (mFrom > 0) spec.modifiedFrom = mFrom
  if (mTo > 0) spec.modifiedTo = mTo

  if (tab.urlKeyword.trim() !== '') {
    if (tab.urlKeywordExact) spec.sourceUrlExact = tab.urlKeyword.trim()
    else spec.sourceUrl = tab.urlKeyword.trim()
  }

  if (tab.resolutionFilter) spec.resolutionMin = RESOLUTION_MIN[tab.resolutionFilter]
  if (tab.timeFilter) {
    const [presetFrom, presetTo] = importTimePresetBounds(tab.timeFilter)
    spec.importedFrom = presetFrom
    if (presetTo > 0) spec.importedTo = presetTo
  }
  if (tab.formatInclude.length > 0) {
    spec.fileExtsInclude = tab.formatInclude.map((ext) => ext.toLowerCase())
  }
  if (tab.formatExclude.length > 0) {
    spec.fileExtsExclude = tab.formatExclude.map((ext) => ext.toLowerCase())
  }

  return spec
}

/**
 * 维度 spec + 搜索词/搜索范围/高级语法 AST → 搜索下推 spec（单一实现）。
 *
 * 主进程 search 分支只认 filters.searchKeyword（req.query 已废弃），且 advancedAst
 * 在 keyword 缺失时被 gating 忽略——所以三者必须一起补齐。此前该装配只在
 * usePhotoSearch 的防抖回调里有一份，「先输关键词、再改筛选维度」的路径因此
 * 不重发搜索；两处各写一遍也正是 hasAdvancedSyntax 曾经漂移的老路。
 */
export function buildSearchSpec(query: string): SmartAlbumRules {
  const spec = buildFiltersSpec()
  const semantic = useSemanticSearch()
  // 语义档只对"它刚跑过的那条查询"生效：切了关键词却没重跑时不能拿旧命中集继续收窄。
  // image 模式（以图搜库内）不吃 enabled 开关，但同样受这条"同一条查询"的门控约束。
  const st = semantic.state.value
  const semanticApplied =
    (st.mode === 'image' || semantic.enabled.value) &&
    st.ranQuery !== '' &&
    st.ranQuery === query.trim()
  if (semanticApplied) {
    // 关键词在语义档下只做界面回显，不再参与文本匹配：两个条件相与会把结果清空，
    // 用户看到的是"AI 也搜不到"，而实际是我们自己把两档 AND 死了
    spec.semanticIds = [...semantic.state.value.hits]
  } else {
    spec.searchKeyword = query
    spec.searchScopes = [...useSearchScopes().value]
    if (hasAdvancedSyntax(query)) {
      const ast = parseSearchQuery(query)
      if (ast) spec.advancedAst = ast as unknown as SearchAstNode
    }
  }
  return spec
}
