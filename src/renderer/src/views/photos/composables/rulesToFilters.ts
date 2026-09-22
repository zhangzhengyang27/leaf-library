/**
 * Leaf · 规则 → 筛选状态（buildFiltersSpec 的反向）
 *
 * 「保存筛选预设」和「编辑智能文件夹时回填筛选」都要把一份 rules 摊回 chip 状态。
 * 反向只覆盖 buildFiltersSpec 会产出的字段集；表达不了的进 unsupported 交调用方播报，
 * **绝不静默丢**——二十九轮缺陷4（编辑智能夹把多文件夹条件砍剩一个）就是静默丢弃的形状。
 */
import type { SearchScopeId, SmartAlbumRules } from '@shared/smartAlbumRules'
import type { AssetKind } from '@shared/assetTypes'
import type { HueBucket } from '@utils/photoColor'
import type { LibraryTab, OrientationValue } from '@renderer/stores/libraryTabs'
import { RESOLUTION_MIN } from './usePhotoFilterSpec'

export interface RulesAsFilters {
  fields: Partial<LibraryTab>
  /** 搜索范围勾选集（全局单例，调用方用 saveSearchScopes 落） */
  scopes?: SearchScopeId[]
  /** 无法用筛选行表达的维度（中文标签，供 toast 直说） */
  unsupported: string[]
}

const stripDot = (f: string): string => f.replace(/^\./, '').toLowerCase()

const ORIENTATION_KEYS: OrientationValue[] = [
  'landscape',
  'portrait',
  'square',
  'panoramic',
  'panoramicPortrait'
]

export function rulesToFilters(
  rules: SmartAlbumRules,
  opts?: { tagNameById?: Record<string, string> }
): RulesAsFilters {
  const fields: Partial<LibraryTab> = {}
  const unsupported: string[] = []

  if (rules.match === 'any') unsupported.push('任一条件匹配')

  if (rules.kinds?.length === 1) fields.kindFilter = rules.kinds[0] as AssetKind
  else if (rules.kinds?.length) unsupported.push('多类型同选')

  if (rules.favorite) unsupported.push('仅看收藏')

  if (rules.colorHue) {
    fields.colorFilter = rules.colorHue as HueBucket
    fields.colorMatch = 'bucket'
  }
  if (rules.colorClose?.hex) {
    fields.colorClose = { ...rules.colorClose }
    fields.colorMatch = 'close'
  }

  if (rules.ratingsInclude?.length) fields.ratingInclude = [...rules.ratingsInclude]
  else if (rules.minRating) {
    // 旧的「≥N 星」写法：展开成精确星级集合，保持筛出的结果不变
    fields.ratingInclude = [
      rules.minRating,
      rules.minRating + 1,
      rules.minRating + 2,
      rules.minRating + 3,
      rules.minRating + 4,
      rules.minRating + 5
    ].filter((n) => n >= 1 && n <= 5)
  }
  if (rules.ratingsExclude?.length) fields.ratingExclude = [...rules.ratingsExclude]

  if (rules.minFileSize || rules.maxFileSize) {
    fields.sizeRange = [rules.minFileSize ?? 0, rules.maxFileSize ?? 0]
  }

  const exts = [...(rules.fileExtsInclude ?? []), ...(rules.formats ?? [])].map(stripDot)
  if (exts.length) fields.formatInclude = [...new Set(exts)]
  const extOut = [...(rules.fileExtsExclude ?? [])].map(stripDot)
  if (extOut.length) fields.formatExclude = [...new Set(extOut)]

  if (rules.minWidth || rules.maxWidth || rules.minHeight || rules.maxHeight) {
    unsupported.push('自定义宽高上下限')
  }
  if (rules.resolutionMin) {
    const hit = (Object.keys(RESOLUTION_MIN) as Array<'1k' | '2k' | '4k'>).find(
      (k) => RESOLUTION_MIN[k] === rules.resolutionMin
    )
    if (hit) fields.resolutionFilter = hit
    else unsupported.push('非预设的分辨率下限')
  }

  const shapeIn = (rules.shapesInclude ?? []).filter((s): s is OrientationValue =>
    ORIENTATION_KEYS.includes(s as OrientationValue)
  )
  if (shapeIn.length) fields.shapeInclude = shapeIn
  const shapeOut = (rules.shapesExclude ?? []).filter((s): s is OrientationValue =>
    ORIENTATION_KEYS.includes(s as OrientationValue)
  )
  if (shapeOut.length) fields.shapeExclude = shapeOut
  if (rules.ratioWidth && rules.ratioHeight) {
    fields.ratioFilter = [rules.ratioWidth, rules.ratioHeight]
  }

  // 标签：正向存的是名字，反向也只认名字；按 id 存的要能查字典才回得来
  const nameOf = (id: string): string | undefined => opts?.tagNameById?.[id]
  const tagNames: string[] = []
  let anyLogic = false
  let exactLogic = false
  for (const n of rules.tagNamesAny ?? []) tagNames.push(n)
  for (const n of rules.tagNamesAll ?? []) tagNames.push(n)
  for (const n of rules.tagNamesExact ?? []) tagNames.push(n)
  if (rules.tagNamesAny?.length) anyLogic = true
  if (rules.tagNamesExact?.length) exactLogic = true
  for (const id of rules.tags ?? []) {
    const n = nameOf(id)
    if (n) tagNames.push(n)
    else unsupported.push('按 id 存的标签')
  }
  if (tagNames.length) {
    fields.tagFilter = [...new Set(tagNames)]
    fields.tagMatchAny = anyLogic
    fields.tagMatchExact = exactLogic
  }
  const tagOut = [...(rules.tagNamesExclude ?? [])]
  if (tagOut.length) fields.tagExclude = [...new Set(tagOut)]
  if (rules.untaggedOnly) fields.untaggedOnly = true

  if (rules.folderIds?.length) {
    fields.folderFilterIds = [...rules.folderIds]
    if (rules.folderIds.length === 1) fields.folderFilter = rules.folderIds[0]
  }
  if (rules.folderExcludeIds?.length) fields.folderExcludeIds = [...rules.folderExcludeIds]

  if (rules.importedFrom || rules.importedTo) {
    // 预设档（今日/7 天…）是按当下时刻算的窗口，回填时无法等价还原，
    // 一律落到自定义区间——谓词值本身是精确的，不会因此多筛或少筛
    fields.customTime = [rules.importedFrom ?? 0, rules.importedTo ?? 0]
    fields.timeFilter = ''
  }
  if (rules.modifiedFrom || rules.modifiedTo) {
    fields.modifiedTimeRange = [rules.modifiedFrom ?? 0, rules.modifiedTo ?? 0]
  }
  if (rules.minDurationMs || rules.maxDurationMs) {
    fields.durationRange = [rules.minDurationMs ?? 0, rules.maxDurationMs ?? 0]
  }
  if (rules.takenFrom || rules.takenTo) unsupported.push('拍摄日期')

  if (rules.descriptionKeyword) {
    fields.noteKeyword = rules.descriptionKeyword
    fields.noteKeywordExact = false
  } else if (rules.descriptionExact) {
    fields.noteKeyword = rules.descriptionExact
    fields.noteKeywordExact = true
  }
  if (rules.sourceUrl) {
    fields.urlKeyword = rules.sourceUrl
    fields.urlKeywordExact = false
  } else if (rules.sourceUrlExact) {
    fields.urlKeyword = rules.sourceUrlExact
    fields.urlKeywordExact = true
  }
  if (rules.excludeKeyword) fields.excludeKeyword = rules.excludeKeyword

  const query = rules.searchKeyword ?? rules.keyword
  if (query) fields.searchKeyword = query
  else if (rules.advancedAst) unsupported.push('只有高级语法 AST、没有原始查询串')
  // 语义命中集是"这一次检索"的向量快照，回填到界面既不可编辑也会过期 → 只播报
  if (Array.isArray(rules.semanticIds)) unsupported.push('AI 语义命中集（快照，不随筛选保存）')
  // 语义条件是可持久化的，但它属于智能文件夹/已存筛选，不是活动 tab 的维度字段：
  // 应用一条带它的规则时必须播报，否则会静默退化成"这一档不存在"的普通关键词搜索
  if (rules.semanticQuery?.trim()) unsupported.push(`AI 语义条件「${rules.semanticQuery.trim()}」`)

  // 搜索范围是全局单例（跨视图记住），不属于 tab 字段 → 单独回传交调用方落
  const scopes = rules.searchScopes?.length ? [...rules.searchScopes] : undefined

  return { fields, scopes, unsupported }
}
