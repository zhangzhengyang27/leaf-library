/**
 * Leaf · 筛选预设（Eagle「保存的筛选器」saved-filters.json 的对应物）
 *
 * 与「保存筛选为智能文件夹」的分工：预设是**可复用的筛选状态**，不产生集合、
 * 不进侧栏、不参与匹配计数；智能文件夹是一个持续命中的相册。Eagle 两者都有。
 *
 * 存的是 buildFiltersSpec() 的产物（同一份规则合同），因此预设可以原样下发给
 * 主进程分页路径；应用时再经 rulesToFilters 摊回 chip（表达不了的项由调用方播报，
 * 不静默丢）。
 *
 * 落 localStorage 与筛选状态本身同源（library.tab.v2 也在这里）：
 * 换库时文件夹 id 可能悬空，rulesToFilters 会把它当未知条件报出来而不是硬套。
 */
import type { SmartAlbumRules } from '@shared/smartAlbumRules'

export interface SavedFilter {
  id: string
  name: string
  rules: SmartAlbumRules
  createdAt: number
}

const KEY = 'leaf.saved-filters'
const MAX_FILTERS = 50

function newId(): string {
  return `sf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isFilter(x: unknown): x is SavedFilter {
  if (!x || typeof x !== 'object') return false
  const f = x as Record<string, unknown>
  return (
    typeof f.id === 'string' &&
    typeof f.name === 'string' &&
    !!f.rules &&
    typeof f.rules === 'object' &&
    !Array.isArray(f.rules)
  )
}

export function loadSavedFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 只收形状完整的条目：坏数据不该让整个筛选行渲染失败
    return parsed.filter(isFilter).slice(0, MAX_FILTERS)
  } catch {
    return []
  }
}

function persist(list: SavedFilter[]): SavedFilter[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_FILTERS)))
  } catch {
    /* 配额满时静默：预设丢了可重建，不该打断筛选 */
  }
  return list
}

/**
 * 新增或按名覆盖。返回 { list, error }——重名当作"更新这条预设"（Eagle 同语义），
 * 空名/空条件才是错误，不能静默存进去再在应用时报错。
 */
export function addSavedFilter(
  name: string,
  rules: SmartAlbumRules
): { list: SavedFilter[]; error?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { list: loadSavedFilters(), error: '预设名不能为空' }
  if (Object.keys(rules).length === 0) {
    return { list: loadSavedFilters(), error: '当前没有可保存的筛选条件' }
  }
  const list = loadSavedFilters()
  const existing = list.find((f) => f.name === trimmed)
  if (existing) {
    existing.rules = rules
    existing.createdAt = Date.now()
    return { list: persist(list) }
  }
  if (list.length >= MAX_FILTERS) {
    return { list, error: `预设数量已达上限 ${MAX_FILTERS} 条，请先删除一部分` }
  }
  return { list: persist([...list, { id: newId(), name: trimmed, rules, createdAt: Date.now() }]) }
}

export function removeSavedFilter(id: string): SavedFilter[] {
  return persist(loadSavedFilters().filter((f) => f.id !== id))
}

/** 预设列表上的条件摘要（Eagle 保存的筛选器只显示名字，这里多给一行看得懂什么条件） */
export function summarizeFilter(rules: SmartAlbumRules): string {
  const parts: string[] = []
  const n = (v: unknown): number => (Array.isArray(v) ? v.length : 0)
  if (n(rules.tags) || n(rules.tagNamesAny) || n(rules.tagNamesAll) || n(rules.tagNamesExact)) {
    parts.push(
      `标签 ${n(rules.tags) + n(rules.tagNamesAny) + n(rules.tagNamesAll) + n(rules.tagNamesExact)}`
    )
  }
  if (n(rules.tagNamesExclude)) parts.push(`排除标签 ${rules.tagNamesExclude?.length}`)
  if (rules.untaggedOnly) parts.push('仅未标签')
  if (n(rules.folderIds)) parts.push(`文件夹 ${rules.folderIds?.length}`)
  if (n(rules.folderExcludeIds)) parts.push(`排除文件夹 ${rules.folderExcludeIds?.length}`)
  if (n(rules.kinds)) parts.push(`类型 ${rules.kinds?.join('/')}`)
  if (n(rules.fileExtsInclude) || n(rules.formats)) {
    parts.push(`格式 ${n(rules.fileExtsInclude) + n(rules.formats)}`)
  }
  if (n(rules.fileExtsExclude)) parts.push(`排除格式 ${rules.fileExtsExclude?.length}`)
  if (rules.colorHue) parts.push(`色系 ${rules.colorHue}`)
  if (rules.colorClose?.hex) {
    parts.push(`近似色 ${rules.colorClose.hex}（准确度 ${rules.colorClose.accuracy}）`)
  }
  if (n(rules.ratingsInclude)) parts.push(`评分 ${rules.ratingsInclude?.join('/')}`)
  if (rules.minRating) parts.push(`评分 ≥${rules.minRating}`)
  if (n(rules.ratingsExclude)) parts.push(`排除评分 ${rules.ratingsExclude?.length}`)
  if (n(rules.shapesInclude)) parts.push(`形状 ${rules.shapesInclude?.length}`)
  if (rules.ratioWidth && rules.ratioHeight)
    parts.push(`比例 ${rules.ratioWidth}:${rules.ratioHeight}`)
  if (rules.resolutionMin) parts.push(`短边 ≥${rules.resolutionMin}`)
  if (rules.minFileSize || rules.maxFileSize) parts.push('大小')
  if (rules.minDurationMs || rules.maxDurationMs) parts.push('时长')
  if (rules.descriptionKeyword || rules.descriptionExact) parts.push('注释')
  if (rules.sourceUrl || rules.sourceUrlExact) parts.push('链接')
  if (rules.importedFrom || rules.importedTo) parts.push('添加日期')
  if (rules.modifiedFrom || rules.modifiedTo) parts.push('修改日期')
  if (rules.takenFrom || rules.takenTo) parts.push('拍摄日期')
  if (rules.favorite) parts.push('仅收藏')
  if (rules.excludeKeyword) parts.push(`排除词「${rules.excludeKeyword}」`)
  if (rules.searchKeyword) parts.push(`关键词「${rules.searchKeyword}」`)
  if (rules.match === 'any') parts.push('任一条件')
  return parts.join(' · ') || '（无可见条件）'
}
