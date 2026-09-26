/**
 * Leaf · 智能收藏夹规则 → SQL WHERE 生成器
 *
 * 借鉴 Eagle 智能文件夹的「条件即相册」模型：rules 是用户可读的条件集，
 * 序列化存 photo_smart_albums.rules_json，查询时编译为 photo_photos 上的 WHERE。
 *
 * 形状 v2（D-022）：顶层 rules 与 groups 并存——
 *   - 组间/组内连接词分别由顶层 match 与组 match 决定（any = OR，all = AND）；
 *   - 组级 not 把整组包成 NOT(...)；
 *   - 读侧永远兼容 v1：无 groups 视为单组，编译产物与升级前逐字节一致；
 *   - 防炸闸：递归深度 ≤ SMART_ALBUM_MAX_DEPTH、组节点 ≤ SMART_ALBUM_MAX_NODES，
 *     超限抛明确错误（rules_json 是自由 JSON，手改/脚本灌入不能变成启动期炸弹）。
 *
 * 规则→SQL 这一步本身是纯的，但**不是无 IO**：中文分词会惰性加载 jieba-wasm
 * 词典（首次约 150ms 同步编译，落在第一次搜索的调用栈上）。这一点写在这儿是为了
 * 别让人以为它可以在没有词典的环境里得出同样的词——回落分支的切法并不相同。
 * 标签条件按 tag_tags.id 匹配（重命名不影响已存相册）。
 */

export interface CompiledWhere {
  whereSql: string
  params: unknown[]
}

import { segmentQuery } from '../services/querySegment'
import {
  SEMANTIC_ID_CAP,
  SEARCH_SCOPE_IDS,
  SMART_ALBUM_MAX_DEPTH,
  SMART_ALBUM_MAX_NODES,
  checkRegexPattern,
  type SearchAstNode,
  type SmartAlbumRuleGroup,
  type SmartAlbumRules,
  type SearchScopeId
} from '../../shared/smartAlbumRules'

export type { SmartAlbumRules, SmartAlbumRuleGroup }

/** 未指定搜索范围时的默认列 */
const DEFAULT_SCOPES: SearchScopeId[] = ['name', 'note', 'tags']
/**
 * 短词（<3 字，喂不进 trigram）的 LIKE 覆盖面，与 photo_fts 的索引列对齐
 * （014 建 file_name/description/ocr_text，018 补 doc_text）+ 标签名单独 LIKE。
 */
const SHORT_WORD_SCOPES: SearchScopeId[] = ['name', 'note', 'ocr', 'docText']

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * D-023 between 形状的边界校验：[min, max] 数字闭区间。
 * 值来自渲染层（IPC 边界），脏形状（长度不为 2 / 非数字 / hi<lo）一律当没设——
 * 与 resolveSemanticIds 的「逐条验形状」同一纪律，不能让坏数组炸 SQL。
 */
function rangeOf(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null
  const lo = v[0]
  const hi = v[1]
  if (typeof lo !== 'number' || typeof hi !== 'number') return null
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return null
  return [lo, hi]
}

/** 素材 id 形状（uuid v4）；语义档的 id 集来自渲染层，逐条按它筛 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 编译上下文：绑定参数按 SQL 出现顺序聚合 + 防炸闸节点计数（根计 1，每个条件组计 1） */
interface CompileCtx {
  params: unknown[]
  nodes: number
}

/**
 * 语义 id 集（D-021）的单一出口，三态必须分清：
 * null = 没给（不参与匹配）；[] = AI 判定无命中；非空 = 按 id 收窄。
 * 「给了但是空集」与「没给」若合并，空结果会被静默换成整库命中。
 */
function resolveSemanticIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))
    .slice(0, SEMANTIC_ID_CAP)
}

/**
 * 单个规则对象（根或某组内）的**扁平谓词**编译：逐键产出条件，
 * 绑定参数按条件产出顺序推进 ctx.params（与最终 SQL 里的占位符顺序一致）。
 * 这里不处理 match / groups——那是 compileRulesNode 的职责。
 */
function compileFlatRules(rules: SmartAlbumRules, params: unknown[]): string[] {
  const conds: string[] = []

  if (rules.favorite) conds.push(`is_favorite = 1`)

  // 五期入库的多类型素材（六期新增条件：视频/音频/兜底文件等）
  if (rules.kinds && rules.kinds.length > 0) {
    const placeholders = rules.kinds.map(() => `?`).join(',')
    conds.push(`kind IN (${placeholders})`)
    params.push(...rules.kinds)
  }

  if (typeof rules.minRating === 'number' && rules.minRating > 0) {
    conds.push(`rating >= ?`)
    params.push(Math.min(5, Math.round(rules.minRating)))
  }

  if (rules.formats && rules.formats.length > 0) {
    const likes = rules.formats.map((f) => {
      const dot = f.startsWith('.') ? f.toLowerCase() : `.${f.toLowerCase()}`
      params.push(`%${escapeLike(dot)}`)
      return `file_name LIKE ? ESCAPE '\\'`
    })
    conds.push(`(${likes.join(' OR ')})`)
  }

  if (typeof rules.minWidth === 'number' && rules.minWidth > 0) {
    conds.push(`width >= ?`)
    params.push(rules.minWidth)
  }
  if (typeof rules.minHeight === 'number' && rules.minHeight > 0) {
    conds.push(`height >= ?`)
    params.push(rules.minHeight)
  }
  if (typeof rules.maxWidth === 'number' && rules.maxWidth > 0) {
    conds.push(`width <= ?`)
    params.push(rules.maxWidth)
  }
  if (typeof rules.maxHeight === 'number' && rules.maxHeight > 0) {
    conds.push(`height <= ?`)
    params.push(rules.maxHeight)
  }

  // 文件大小区间（字节）
  if (typeof rules.minFileSize === 'number' && rules.minFileSize > 0) {
    conds.push(`file_size >= ?`)
    params.push(rules.minFileSize)
  }
  if (typeof rules.maxFileSize === 'number' && rules.maxFileSize > 0) {
    conds.push(`file_size <= ?`)
    params.push(rules.maxFileSize)
  }

  // 时长区间（视频/音频，毫秒）
  if (typeof rules.minDurationMs === 'number' && rules.minDurationMs > 0) {
    conds.push(`duration_ms IS NOT NULL AND duration_ms >= ?`)
    params.push(rules.minDurationMs)
  }
  if (typeof rules.maxDurationMs === 'number' && rules.maxDurationMs > 0) {
    conds.push(`duration_ms IS NOT NULL AND duration_ms <= ?`)
    params.push(rules.maxDurationMs)
  }

  // 书签来源 URL 包含（⑤ exact = 完全相等）
  if (rules.sourceUrl && rules.sourceUrl.trim() !== '') {
    const uw = `%${escapeLike(rules.sourceUrl.trim())}%`
    conds.push(`source_url LIKE ? ESCAPE '\\'`)
    params.push(uw)
  }
  if (rules.sourceUrlExact && rules.sourceUrlExact.trim() !== '') {
    conds.push(`LOWER(source_url) = LOWER(?)`)
    params.push(rules.sourceUrlExact.trim())
  }

  // 描述关键词（专指 description 字段；⑤ exact = 完全相等）
  if (rules.descriptionKeyword && rules.descriptionKeyword.trim() !== '') {
    const dk = `%${escapeLike(rules.descriptionKeyword.trim())}%`
    conds.push(`(description IS NOT NULL AND description LIKE ? ESCAPE '\\')`)
    params.push(dk)
  }
  if (rules.descriptionExact && rules.descriptionExact.trim() !== '') {
    conds.push(`(description IS NOT NULL AND LOWER(description) = LOWER(?))`)
    params.push(rules.descriptionExact.trim())
  }

  if (typeof rules.takenFrom === 'number') {
    conds.push(`(taken_at IS NOT NULL AND taken_at >= ?)`)
    params.push(rules.takenFrom)
  }
  if (typeof rules.takenTo === 'number') {
    conds.push(`(taken_at IS NOT NULL AND taken_at <= ?)`)
    params.push(rules.takenTo)
  }
  if (typeof rules.importedFrom === 'number') {
    conds.push(`imported_at >= ?`)
    params.push(rules.importedFrom)
  }
  if (typeof rules.importedTo === 'number') {
    conds.push(`imported_at <= ?`)
    params.push(rules.importedTo)
  }

  // D-012 文件系统修改时间区间
  if (typeof rules.modifiedFrom === 'number') {
    conds.push(`(fs_modified_at IS NOT NULL AND fs_modified_at >= ?)`)
    params.push(rules.modifiedFrom)
  }
  if (typeof rules.modifiedTo === 'number') {
    conds.push(`(fs_modified_at IS NOT NULL AND fs_modified_at <= ?)`)
    params.push(rules.modifiedTo)
  }

  // D-012 所属文件夹（'none' = 未分类）
  if (rules.folderIds && rules.folderIds.length > 0) {
    if (rules.folderIds.includes('none')) {
      const rest = rules.folderIds.filter((f) => f !== 'none')
      if (rest.length > 0) {
        const ph = rest.map(() => `?`).join(',')
        conds.push(`(folder_id IS NULL OR folder_id IN (${ph}))`)
        params.push(...rest)
      } else {
        conds.push(`folder_id IS NULL`)
      }
    } else {
      const ph = rules.folderIds.map(() => `?`).join(',')
      conds.push(`folder_id IN (${ph})`)
      params.push(...rules.folderIds)
    }
  }

  if (rules.keyword && rules.keyword.trim() !== '') {
    const kw = `%${escapeLike(rules.keyword.trim())}%`
    conds.push(
      `(file_name LIKE ? ESCAPE '\\' OR (description IS NOT NULL AND description LIKE ? ESCAPE '\\'))`
    )
    params.push(kw, kw)
  }

  // ── D-023 算子补齐（对齐 Eagle 字符串/数值/日期算子缺口，盘点见 DECISIONS.md）──

  // 数值介于（闭区间）：min/max 对在 AND 组已覆盖 between，这组键为 OR 组/组编辑器
  // 单行表达而设（any 组里拆 min+max 两行会被 OR 拆散语义）。NULL 维度照旧不命中。
  const widthRange = rangeOf(rules.widthBetween)
  if (widthRange) {
    conds.push(`(width IS NOT NULL AND width >= ? AND width <= ?)`)
    params.push(widthRange[0], widthRange[1])
  }
  const heightRange = rangeOf(rules.heightBetween)
  if (heightRange) {
    conds.push(`(height IS NOT NULL AND height >= ? AND height <= ?)`)
    params.push(heightRange[0], heightRange[1])
  }
  const sizeRange = rangeOf(rules.fileSizeBetween)
  if (sizeRange) {
    conds.push(`file_size >= ? AND file_size <= ?`)
    params.push(sizeRange[0], sizeRange[1])
  }
  const durationRange = rangeOf(rules.durationMsBetween)
  if (durationRange) {
    conds.push(`(duration_ms IS NOT NULL AND duration_ms >= ? AND duration_ms <= ?)`)
    params.push(durationRange[0], durationRange[1])
  }

  // 日期「过去 N 天」相对窗：求值时取当前时间 → 智能夹是滚动窗口（绝对区间会冻结）。
  // 毫秒换算在这层做，渲染层只传天数。
  if (typeof rules.importedWithinDays === 'number' && rules.importedWithinDays > 0) {
    conds.push(`imported_at >= ?`)
    params.push(Date.now() - Math.round(rules.importedWithinDays) * 86_400_000)
  }
  if (typeof rules.takenWithinDays === 'number' && rules.takenWithinDays > 0) {
    conds.push(`(taken_at IS NOT NULL AND taken_at >= ?)`)
    params.push(Date.now() - Math.round(rules.takenWithinDays) * 86_400_000)
  }
  if (typeof rules.modifiedWithinDays === 'number' && rules.modifiedWithinDays > 0) {
    conds.push(`(fs_modified_at IS NOT NULL AND fs_modified_at >= ?)`)
    params.push(Date.now() - Math.round(rules.modifiedWithinDays) * 86_400_000)
  }

  // 文件名开头/结尾（LIKE 前后缀）：转义纪律同 keyword，% _ \ 是字面量
  if (rules.nameBeginsWith && rules.nameBeginsWith.trim() !== '') {
    conds.push(`file_name LIKE ? ESCAPE '\\'`)
    params.push(`${escapeLike(rules.nameBeginsWith.trim())}%`)
  }
  if (rules.nameEndsWith && rules.nameEndsWith.trim() !== '') {
    conds.push(`file_name LIKE ? ESCAPE '\\'`)
    params.push(`%${escapeLike(rules.nameEndsWith.trim())}`)
  }

  // 文件名正则（UDF 下推，注册处 registerFunctions）：编译期先过 checkRegexPattern，
  // 非法正则抛明确错误——绝不能等到 SQL 执行中途由 UDF 抛出（那是查询期随机炸）。
  // 模式走绑定参数，用户正则里的 ( * \ 引号都是数据，没有 SQL 注入面。
  if (rules.nameRegex && rules.nameRegex.trim() !== '') {
    const pattern = rules.nameRegex.trim()
    const problem = checkRegexPattern(pattern)
    if (problem) {
      throw new Error(`[buildSmartAlbumWhere] 文件名正则未通过校验：${problem}`)
    }
    conds.push(`regexp(?, file_name)`)
    params.push(pattern)
  }

  // 注释有无内容（Eagle 字符串算子「有内容/没有内容」；标签/标注维已有各自键）
  if (rules.descriptionEmpty === true) {
    conds.push(`(description IS NULL OR description = '')`)
  } else if (rules.descriptionHasContent === true) {
    conds.push(`(description IS NOT NULL AND description != '')`)
  }

  // ── 阶段 3 下推补齐 ──

  // 精确评分多选（含 0=尚未评分）与排除集（matchRating 语义：排除集优先）
  if (rules.ratingsInclude && rules.ratingsInclude.length > 0) {
    const ph = rules.ratingsInclude.map(() => `?`).join(',')
    conds.push(`rating IN (${ph})`)
    params.push(...rules.ratingsInclude)
  } else if (rules.ratingsExclude && rules.ratingsExclude.length > 0) {
    const ph = rules.ratingsExclude.map(() => `?`).join(',')
    conds.push(`rating NOT IN (${ph})`)
    params.push(...rules.ratingsExclude)
  }

  // 主色色相桶（m016 color_hue 列；旧实现 JS 逐行计算后过滤）
  if (rules.colorHue && rules.colorHue.trim() !== '') {
    conds.push(`color_hue = ?`)
    params.push(rules.colorHue.trim())
  }

  // 颜色相似度（吸管 + 准确度滑杆）：ΔE2000 在 color_close() 里算，见 registerFunctions。
  // hex/accuracy 来自渲染层 → 这里按边界输入校验：不是 #rrggbb 就当没设，
  // 不能把它原样带进 UDF（accuracyToMaxDelta 已有钳位，但格式错的色值会静默全表不命中）
  const closeHex = rules.colorClose?.hex?.trim() ?? ''
  if (/^#?[0-9a-f]{6}$/i.test(closeHex)) {
    const acc = Number(rules.colorClose?.accuracy ?? 20)
    conds.push(`color_close(color_dominant, palette, ?, ?) = 1`)
    params.push(closeHex.startsWith('#') ? closeHex : `#${closeHex}`, acc)
  }

  // 形状（宽高比归类；无宽高 = NULL，与 shapeOf 一致）
  //   shapeExpr: ratio>=3 panoramic / <=1/3 panoramicPortrait / >1.1 landscape / <0.9 portrait / else square
  const SHAPE_EXPR = `CASE
        WHEN width IS NULL OR height IS NULL OR height = 0 THEN NULL
        WHEN width * 1.0 / height >= 3 THEN 'panoramic'
        WHEN width * 1.0 / height <= 0.3333333333 THEN 'panoramicPortrait'
        WHEN width * 1.0 / height > 1.1 THEN 'landscape'
        WHEN width * 1.0 / height < 0.9 THEN 'portrait'
        ELSE 'square' END`
  if (rules.shapesInclude && rules.shapesInclude.length > 0) {
    const ph = rules.shapesInclude.map(() => `?`).join(',')
    // JS：v !== null && inc.includes(v)（无宽高不命中包含集）
    conds.push(`(${SHAPE_EXPR} IS NOT NULL AND ${SHAPE_EXPR} IN (${ph}))`)
    params.push(...rules.shapesInclude)
  }
  if (rules.shapesExclude && rules.shapesExclude.length > 0) {
    const ph = rules.shapesExclude.map(() => `?`).join(',')
    // JS：v === null 通过排除；命中排除集才过滤
    conds.push(`(${SHAPE_EXPR} IS NULL OR ${SHAPE_EXPR} NOT IN (${ph}))`)
    params.push(...rules.shapesExclude)
  }

  // 比例容差（±2% 相对容差；无宽高不命中，与 ratioMatches 一致）
  if (rules.ratioWidth && rules.ratioHeight && rules.ratioHeight !== 0) {
    const t = rules.ratioWidth / rules.ratioHeight
    conds.push(`(width IS NOT NULL AND height > 0 AND ABS(width * 1.0 / height - ?) / ? <= 0.02)`)
    params.push(t, t)
  }

  // 排除关键词（文件名/描述/标签 三列 NOT LIKE，与 matchExclude 一致）
  if (rules.excludeKeyword && rules.excludeKeyword.trim() !== '') {
    const ek = `%${escapeLike(rules.excludeKeyword.trim().toLowerCase())}%`
    conds.push(
      `NOT (
         LOWER(file_name) LIKE ? ESCAPE '\\'
         OR (description IS NOT NULL AND LOWER(description) LIKE ? ESCAPE '\\')
         OR EXISTS (
           SELECT 1 FROM photo_tags pt
           JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL
           WHERE pt.photo_id = photo_photos.id AND LOWER(tt.name) LIKE ? ESCAPE '\\'
         )
       )`
    )
    params.push(ek, ek, ek)
  }

  // 文件扩展名精确集（m016 file_ext 列；matchFormat include/exclude）
  if (rules.fileExtsInclude && rules.fileExtsInclude.length > 0) {
    const ph = rules.fileExtsInclude.map(() => `?`).join(',')
    conds.push(`file_ext IN (${ph})`)
    params.push(...rules.fileExtsInclude)
  }
  if (rules.fileExtsExclude && rules.fileExtsExclude.length > 0) {
    const ph = rules.fileExtsExclude.map(() => `?`).join(',')
    conds.push(`file_ext NOT IN (${ph})`)
    params.push(...rules.fileExtsExclude)
  }

  // 分辨率下限（Eagle 快筛 1k/2k/4k：MAX(width,height) >= min）
  if (typeof rules.resolutionMin === 'number' && rules.resolutionMin > 0) {
    conds.push(`(MAX(COALESCE(width, 0), COALESCE(height, 0)) >= ?)`)
    params.push(rules.resolutionMin)
  }

  // 标签按名（lower 比较，与 matchTags 一致）：
  const tagJoin = `FROM photo_tags pt
           JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL
           WHERE pt.photo_id = photo_photos.id`
  if (rules.tagNamesAny && rules.tagNamesAny.length > 0) {
    const ph = rules.tagNamesAny.map(() => `LOWER(?)`).join(',')
    conds.push(`EXISTS (SELECT 1 ${tagJoin} AND LOWER(tt.name) IN (${ph}))`)
    params.push(...rules.tagNamesAny)
  }
  if (rules.tagNamesAll && rules.tagNamesAll.length > 0) {
    for (const tagName of rules.tagNamesAll) {
      conds.push(`EXISTS (SELECT 1 ${tagJoin} AND LOWER(tt.name) = LOWER(?))`)
      params.push(tagName)
    }
  }
  if (rules.tagNamesExact && rules.tagNamesExact.length > 0) {
    // 集合完全一致：选中集逐一存在 + 无选中集之外的标签
    const ph = rules.tagNamesExact.map(() => `LOWER(?)`).join(',')
    for (const tagName of rules.tagNamesExact) {
      conds.push(`EXISTS (SELECT 1 ${tagJoin} AND LOWER(tt.name) = LOWER(?))`)
      params.push(tagName)
    }
    // NOT IN 的 N 个占位符必须补齐绑定参数，否则 better-sqlite3 抛 RangeError（审查 P1-1）
    conds.push(`NOT EXISTS (SELECT 1 ${tagJoin} AND LOWER(tt.name) NOT IN (${ph}))`)
    params.push(...rules.tagNamesExact)
  }
  if (rules.tagNamesExclude && rules.tagNamesExclude.length > 0) {
    const ph = rules.tagNamesExclude.map(() => `LOWER(?)`).join(',')
    conds.push(`NOT EXISTS (SELECT 1 ${tagJoin} AND LOWER(tt.name) IN (${ph}))`)
    params.push(...rules.tagNamesExclude)
  }
  if (rules.untaggedOnly) {
    // 只算活动标签：字典已软删而绑定残留（本次修复前的存量数据）时该素材应回到「未加标签」
    conds.push(
      `NOT EXISTS (SELECT 1 FROM photo_tags pt JOIN tag_tags tt ON tt.id = pt.tag_id
        WHERE pt.photo_id = photo_photos.id AND tt.deleted_at IS NULL)`
    )
  }

  // 标注维（M4，Eagle 筛选器「标注」有/无标注）：photo_annotations 没有软删列，
  // 软删素材的标注行保留到硬删才清（PhotoRepository.clearRecycleBin 统一清表），
  // 回收站视图语义与标签维同口径——deleted_at 谓词由 getPage 的视图 WHERE 合并，这里
  // 只判「有没有标注」本身，三档形状（rect/atMs/纯文字）任意一条都算有
  if (rules.annotationFilter === 'any') {
    conds.push(`EXISTS (SELECT 1 FROM photo_annotations pa WHERE pa.photo_id = photo_photos.id)`)
  } else if (rules.annotationFilter === 'none') {
    conds.push(
      `NOT EXISTS (SELECT 1 FROM photo_annotations pa WHERE pa.photo_id = photo_photos.id)`
    )
  }

  // 全局搜索词 / 高级语法 AST（二者可独立存在，不可互相 gating）：
  //   a) 高级语法 AST → 递归 SQL（haystack = scope 列拼接；与客户端 evalNode 同构）
  //   b) 词拆分 AND：带搜索范围 → 九列 scope OR-group；无范围 → FTS5 + 标签名
  const hasKeyword = !!rules.searchKeyword && rules.searchKeyword.trim() !== ''
  if (rules.advancedAst || hasKeyword) {
    // 中文分词（jieba-wasm，词典在主进程这一份）：不切词的话「红色海报」是整词，
    // 搜不到「红色系海报.png」。渲染层的回退匹配走 photos:segmentWords 取同一套词。
    const words = hasKeyword ? segmentQuery(rules.searchKeyword!) : []

    // scope 列表达式：按 SearchScopeId 穷举（漏一列即 typecheck 报错），
    // 与 scopeHaystack 字段一致
    const scopeColExpr: Record<SearchScopeId, string> = {
      name: 'LOWER(file_name)',
      ext: 'LOWER(file_ext)',
      tags: "COALESCE((SELECT group_concat(LOWER(tt.name), char(10)) FROM photo_tags pt JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL WHERE pt.photo_id = photo_photos.id), '')",
      note: "LOWER(COALESCE(description, ''))",
      ocr: "LOWER(COALESCE(ocr_text, ''))",
      docText: "LOWER(COALESCE(doc_text, ''))",
      link: "LOWER(COALESCE(source_url, ''))",
      folderName:
        "COALESCE((SELECT LOWER(pf.name) FROM photo_folders pf WHERE pf.id = photo_photos.folder_id), '')",
      folderDesc:
        "COALESCE((SELECT LOWER(pf.description) FROM photo_folders pf WHERE pf.id = photo_photos.folder_id), '')"
    }
    // 勾选集来自渲染层（IPC 边界）：只认词表内的 id。未知项丢弃，
    // 不再退化成搜文件名——docText 漏配时就是这样静默搜错的
    const pickedScopes = (rules.searchScopes ?? []).filter((s): s is SearchScopeId =>
      (SEARCH_SCOPE_IDS as readonly string[]).includes(s)
    )
    const hasScopes = pickedScopes.length > 0
    const scopes = hasScopes ? pickedScopes : DEFAULT_SCOPES
    // a) 高级语法：AST 递归转 SQL（term → INSTR haystack；and/or 递归；exclude → NOT）
    if (rules.advancedAst) {
      const haystackExpr = scopes.map((s) => scopeColExpr[s]).join(' || char(10) || ')
      const astToCond = (node: SearchAstNode): string => {
        if (node.type === 'and' || node.type === 'or') {
          const joiner = node.type === 'and' ? ' AND ' : ' OR '
          const parts = (node.children ?? []).map((c) => astToCond(c))
          return parts.length > 1 ? `(${parts.join(joiner)})` : (parts[0] ?? '1=1')
        }
        const value = (node.value ?? '').toLowerCase()
        if (value === '') return '1=1'
        // INSTR 是字面子串定位、不认 LIKE 通配：绑定原值（scope 列已 LOWER，故大小写不敏感）
        params.push(value)
        const cond = `INSTR(${haystackExpr}, ?) > 0`
        return node.exclude ? `NOT ${cond}` : cond
      }
      conds.push(astToCond(rules.advancedAst))
    } else {
      // b) 词拆分 AND：每词一个 OR-group（scope 列 / FTS+标签）
      for (const word of words) {
        const likeWord = `%${escapeLike(word.toLowerCase())}%`
        if (hasScopes) {
          const group = pickedScopes
            .map((s) => `${scopeColExpr[s]} LIKE ? ESCAPE '\\'`)
            .join(' OR ')
          conds.push(`(${group})`)
          params.push(...pickedScopes.map(() => likeWord))
        } else if (word.length >= 3) {
          // FTS 是 trigram 分词，2 字词喂进去必然空——分完词反而搜不到就是回归
          conds.push(
            `(rowid IN (SELECT rowid FROM photo_fts WHERE photo_fts MATCH ?)
              OR EXISTS (SELECT 1 FROM photo_tags pt JOIN tag_tags tt ON tt.id = pt.tag_id AND tt.deleted_at IS NULL WHERE pt.photo_id = photo_photos.id AND tt.name LIKE ? ESCAPE '\\'))`
          )
          params.push(`"${word.replace(/"/g, '""')}"`, likeWord)
        } else {
          // 短词走不了 trigram，只能 LIKE。覆盖面必须与 FTS 那一支等价：
          // file_name/description/ocr_text/doc_text + 标签名。
          // 只按 DEFAULT_SCOPES 切会静默丢掉文档正文——「季度营收」命中 docx 正文
          // 这条就是先这么写才被 e2e 打回来的。
          const group = [...SHORT_WORD_SCOPES, 'tags']
            .map((sc) => `${scopeColExpr[sc as SearchScopeId]} LIKE ? ESCAPE '\\'`)
            .join(' OR ')
          conds.push(`(${group})`)
          params.push(...SHORT_WORD_SCOPES.concat('tags').map(() => likeWord))
        }
      }
    }
  }

  // 语义档命中的 id 集（G1 文搜图，D-021 下推）：只当"缩小范围"的谓词用，排序仍走既有 sort 列。
  // 勾选集来自渲染层（IPC 边界），所以逐条验形状并封顶——传一大串 id 不能把 SQL 撑爆。
  // 根级「空集 = AI 判定无命中」由 buildSmartAlbumWhere 入口整体短路成 1=0（在组编译之前，
  // 它是整条查询的判定而不是某个组的叶子条件）；这里兜的是组内语义条件的叶子形态：
  // 空集编译成 1=0 叶子，交给所在层的 AND/OR/NOT 组合（NOT 组甚至能把它救回来）。
  const semIds = resolveSemanticIds(rules.semanticIds)
  if (semIds !== null) {
    if (semIds.length === 0) {
      conds.push(`1=0`)
    } else {
      const ph = semIds.map(() => `?`).join(',')
      conds.push(`photo_photos.id IN (${ph})`)
      params.push(...semIds)
    }
  }

  // 文件夹排除（'none' = 未分类；matchFolderFilter exclude 语义）
  if (rules.folderExcludeIds && rules.folderExcludeIds.length > 0) {
    if (rules.folderExcludeIds.includes('none')) {
      const rest = rules.folderExcludeIds.filter((f) => f !== 'none')
      if (rest.length > 0) {
        const ph = rest.map(() => `?`).join(',')
        conds.push(`NOT (folder_id IS NULL OR folder_id IN (${ph}))`)
        params.push(...rest)
      } else {
        conds.push(`folder_id IS NOT NULL`)
      }
    } else {
      const ph = rules.folderExcludeIds.map(() => `?`).join(',')
      conds.push(`(folder_id IS NULL OR folder_id NOT IN (${ph}))`)
      params.push(...rules.folderExcludeIds)
    }
  }

  // 标签：ALL 语义——每个标签一个 EXISTS 子查询（photo_tags/tag_tags 均为 photo 模块内表）
  if (rules.tags && rules.tags.length > 0) {
    for (const tagId of rules.tags) {
      conds.push(
        `EXISTS (
           SELECT 1 FROM photo_tags pt
           WHERE pt.photo_id = photo_photos.id AND pt.tag_id = ?
         )`
      )
      params.push(tagId)
    }
  }

  return conds
}

/**
 * 递归编译一个规则节点（根节点或某个条件组的 rules）。
 * - `match` 是**本层**连接词（any = OR / all = AND，默认 AND）；
 * - 子组递归编译后作为一条完整条件并入本层：子组与父层连接词不同时括起来
 *   （AND/OR 优先级不能靠读的人默背），组级 not 包一层 NOT(...)；
 * - 空组（无任何条件、含嵌套组也不产出）不产生约束；「空组取反」没有
 *   可取反的对象，同样不产生约束（两边都是全集。这条边角在 smartAlbumGroups.test.ts 钉死）；
 * - 深度/节点超限抛明确错误，绝不静默截断。
 *
 * 返回 null 表示本节点没有产出任何谓词（空 rules + 空组）。
 * 本层条件数组由调用方按 match 连接——根层裸连接（v1 编译产物逐字节兼容），
 * 组层在并入父层时按需加括号。
 */
interface NodeResult {
  conds: string[]
  match: 'any' | 'all' | undefined
}

function compileRulesNode(
  rules: SmartAlbumRules,
  match: 'any' | 'all' | undefined,
  depth: number,
  ctx: CompileCtx
): NodeResult | null {
  ctx.nodes += 1
  if (ctx.nodes > SMART_ALBUM_MAX_NODES) {
    throw new Error(
      `[buildSmartAlbumWhere] 条件组节点数超过上限 ${SMART_ALBUM_MAX_NODES}（当前 ${ctx.nodes}）：规则过复杂，请简化条件组`
    )
  }
  if (depth > SMART_ALBUM_MAX_DEPTH) {
    throw new Error(
      `[buildSmartAlbumWhere] 条件组嵌套深度超过上限 ${SMART_ALBUM_MAX_DEPTH} 层（当前第 ${depth} 层）：请拍平条件组`
    )
  }

  // 本层扁平谓词（未知键天然被忽略——向前兼容）
  const conds = compileFlatRules(rules, ctx.params)

  // 子条件组：D-022 的组形状是 { match, not?, rules }，更深的嵌套经 rules.groups 递归
  const rawGroups = (rules as { groups?: unknown } | undefined)?.groups
  if (rawGroups !== undefined && rawGroups !== null && !Array.isArray(rawGroups)) {
    throw new Error('[buildSmartAlbumWhere] groups 必须是数组（rules_json 结构损坏）')
  }
  for (const group of (rawGroups ?? []) as SmartAlbumRuleGroup[]) {
    if (typeof group !== 'object' || group === null || Array.isArray(group)) {
      throw new Error('[buildSmartAlbumWhere] 条件组必须是对象（rules_json 结构损坏）')
    }
    if ('groups' in group) {
      // 嵌套组的唯一通道是组内 rules.groups（递归类型即由此展开）。组对象自身再挂
      // groups 属于结构损坏——宁可报错也不能静默丢弃（丢弃 = 语义悄悄变了）
      throw new Error(
        '[buildSmartAlbumWhere] 条件组不支持自身的 groups 字段：嵌套组请放进组内 rules.groups'
      )
    }
    const subNode = compileRulesNode(
      group.rules ?? ({} as SmartAlbumRules),
      group.match,
      depth + 1,
      ctx
    )
    if (!subNode || subNode.conds.length === 0) continue // 空组不产生约束（not 同样无可取反）
    const subJoiner = subNode.match === 'any' ? ' OR ' : ' AND '
    let sub = subNode.conds.join(subJoiner)
    if (group.not === true) {
      sub = `NOT (${sub})`
    } else if (subNode.conds.length > 1 && subJoiner !== (match === 'any' ? ' OR ' : ' AND ')) {
      // 多条件组的连接词与父层不同：必须括号，否则 is_favorite = 1 AND a OR b 会被
      // 优先级拆成 (is_favorite = 1 AND a) OR b——真值表测试抓出来过
      sub = `(${sub})`
    }
    conds.push(sub)
  }

  return { conds, match }
}

/**
 * 智能夹规则 → WHERE。v1 形状（无 groups）编译产物与升级前逐字节一致；
 * v2 在此之上叠加条件组递归（组间/组内 AND|OR + 组级取反）。
 */
export function buildSmartAlbumWhere(rules: SmartAlbumRules): CompiledWhere {
  // D-021 根级语义空集闸：semanticIds=[] = AI 判定无命中 → 整册为空。必须在组编译之前
  // 短路——它是整条查询的判定，match:'any' 也不得把「无命中」OR 回结果（v1 行为原样保留）
  const rootSem = resolveSemanticIds(rules.semanticIds)
  if (rootSem !== null && rootSem.length === 0) {
    return { whereSql: `1=0`, params: [] }
  }

  const ctx: CompileCtx = { params: [], nodes: 0 }
  const root = compileRulesNode(rules, rules.match, 1, ctx)
  const whereSql =
    root && root.conds.length > 0 ? root.conds.join(root.match === 'any' ? ' OR ' : ' AND ') : '1=1'
  return { whereSql, params: ctx.params }
}

/** 运行时解析 rules_json（损坏时返回空规则而不是抛错） */
export function parseSmartAlbumRules(json: string): SmartAlbumRules {
  try {
    const raw = JSON.parse(json) as SmartAlbumRules
    return typeof raw === 'object' && raw !== null ? raw : {}
  } catch {
    return {}
  }
}
