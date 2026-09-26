/**
 * Leaf · 素材筛选规则（shared：渲染层构建语义 spec，主进程拼 WHERE——
 * 信任模型与 getPage 一致：渲染层不可传 SQL 片段）
 *
 * 分页化阶段 3：本接口同时服务于智能文件夹规则与主视图筛选下推，
 * 全部字段可选，空对象 = 不限。
 */
/** 高级搜索 AST 序列化形态（渲染层 parseSearchQuery 的 JSON 视图） */
export interface SearchAstNode {
  type: 'term' | 'phrase' | 'and' | 'or'
  value?: string
  exclude?: boolean
  children?: SearchAstNode[]
}

/**
 * 搜索范围词表（渲染层「搜索范围」面板与主进程 WHERE 列表达式的共同契约）。
 * 单源放这里的原因：面板勾选集与列映射曾经各写一份，加 docText 时只加了面板那一份，
 * 主进程查不到列就静默退回 file_name——勾「文档正文」实际在搜文件名。
 */
export const SEARCH_SCOPE_IDS = [
  'name',
  'folderName',
  'folderDesc',
  'ext',
  'tags',
  'link',
  'note',
  'ocr',
  'docText'
] as const

export type SearchScopeId = (typeof SEARCH_SCOPE_IDS)[number]

/**
 * 一次语义检索最多带进 SQL 的 id 数（参数表大小上限，不是检索质量上限）。
 * 单源放这儿：主进程的谓词封顶与解析器的取数共用它，两边各写一遍必然漂移。
 */
export const SEMANTIC_ID_CAP = 500

// ── D-022 条件组（形状 v2）──

/** 防炸闸：条件组递归深度上限（根算第 1 层；编辑器只产出单层组，深层只可能来自手改 JSON） */
export const SMART_ALBUM_MAX_DEPTH = 8
/** 防炸闸：条件组节点总数上限（根计 1，每个条件组计 1；谓词条件数与 v1 同口径不另设上限） */
export const SMART_ALBUM_MAX_NODES = 300

/**
 * 一个显式条件组。组内连接词 `match` 管这组条件之间怎么连；组级 `not` = 「不满足此组」。
 * `rules` 与顶层 SmartAlbumRules 同形状——因此组内理论上还能再带 groups（递归形状，
 * 引擎按递归编译、深度/节点超限会被拒），编辑器只产出单层组。
 */
export interface SmartAlbumRuleGroup {
  /** 组内连接词（默认 all = 组内全部满足） */
  match?: 'any' | 'all'
  /** 组级取反：整组条件不满足才算命中 */
  not?: boolean
  /** 组内条件（与顶层同形状；更深的嵌套从 rules.groups 继续递归） */
  rules?: SmartAlbumRules
}

export interface SmartAlbumRules {
  /** 条件匹配模式（D-012 对齐 Eagle「任一项/所有」）：默认 all。
   * 有 groups 时它同时是「顶层规则之间」与「顶层规则与各组之间」的连接词 */
  match?: 'any' | 'all'
  /**
   * D-022 显式条件组（形状 v2）：与顶层规则并存。读侧永远兼容 v1——
   * 无 groups（或空数组）视为单组，只有编辑器保存嵌套后才产出该字段。
   */
  groups?: SmartAlbumRuleGroup[]
  /** 全部包含的标签（tag_tags.id） */
  tags?: string[]
  /** 素材类型（六期：image/video/audio/font/file，空或不设=不限） */
  kinds?: string[]
  /** 仅收藏 */
  favorite?: boolean
  /** 最低评分（0-5，0 等于不限） */
  minRating?: number
  /** 文件格式（小写扩展名，如 ['.png', '.jpg']） */
  formats?: string[]
  /** 最小宽/高 */
  minWidth?: number
  minHeight?: number
  /** D-012 最大宽/高 */
  maxWidth?: number
  maxHeight?: number
  /** 主色色相桶（HUE_BUCKETS.key）；阶段 3 起下推 m016 color_hue 列 */
  colorHue?: string
  /**
   * 颜色相似度档（Eagle 吸管 + 准确度滑杆）：主色或色板任一色与 hex 的
   * CIEDE2000 ≤ accuracyToMaxDelta(accuracy)。走 color_close() UDF。
   * accuracy 方向同 Eagle（越大越严），量程 5–40。
   */
  colorClose?: { hex: string; accuracy: number }
  /** 文件大小区间（字节） */
  minFileSize?: number
  maxFileSize?: number
  /** 时长区间（毫秒，视频/音频） */
  minDurationMs?: number
  maxDurationMs?: number
  /** 书签来源 URL 包含（书签素材） */
  sourceUrl?: string
  /** ⑤：URL 完全相等（Eagle「完全相等」；与 sourceUrl 互斥使用） */
  sourceUrlExact?: string
  /** 描述关键词（区别于 keyword 的文件名/描述，这里专指 description） */
  descriptionKeyword?: string
  /** ⑤：描述完全相等 */
  descriptionExact?: string
  /** 拍摄时间区间（unix ms，含边界） */
  takenFrom?: number
  takenTo?: number
  /** 导入时间区间（unix ms，含边界） */
  importedFrom?: number
  importedTo?: number
  /** D-012 文件系统修改时间区间（unix ms，含边界） */
  modifiedFrom?: number
  modifiedTo?: number
  /** D-012 所属文件夹（photo_folders.id；'none' = 未分类到文件夹） */
  folderIds?: string[]
  /** 文件名/描述关键词 */
  keyword?: string
  // ── 分页化阶段 3：右键/快筛维度下推补齐（与渲染层 matchAll 语义逐项对齐） ──

  /** 精确评分多选（0=尚未评分；空集不限）——matchRating include */
  ratingsInclude?: number[]
  /** 评分排除集——matchRating exclude */
  ratingsExclude?: number[]

  /** 形状多选包含（orientation：landscape/portrait/square/panoramic/panoramicPortrait） */
  shapesInclude?: string[]
  /** 形状排除 */
  shapesExclude?: string[]
  /** 比例容差匹配（±2% 相对容差，Eagle 形状弹层 3:4 等比例行） */
  ratioWidth?: number
  ratioHeight?: number

  /** 排除关键词（文件名/描述/标签 三列 NOT LIKE） */
  excludeKeyword?: string

  /** 文件扩展名精确集（m016 file_ext 列，小写无点）——matchFormat include */
  fileExtsInclude?: string[]
  /** 扩展名排除——matchFormat exclude */
  fileExtsExclude?: string[]

  /** 分辨率下限（短边语义同 Eagle 快筛：MAX(width,height) >= min） */
  resolutionMin?: number

  /** 标签按名（阶段 3：标签面板按名选择，未经 tag_tags.id 换算）——ANY 语义 */
  tagNamesAny?: string[]
  /** 标签按名——ALL 语义（逐标签 EXISTS） */
  tagNamesAll?: string[]
  /** 标签按名——EXACT（标签集合与选中集完全一致） */
  tagNamesExact?: string[]
  /** 标签按名排除 */
  tagNamesExclude?: string[]
  /** 仅看未标签 */
  untaggedOnly?: boolean

  /**
   * 标注维（Eagle 筛选器「标注」，023 photo_annotations）：
   * 'any' = 有标注（任一条：区域批注/时间点笔记/素材级批注都算），
   * 'none' = 无标注；不设 = 不限。SQL 侧 EXISTS/NOT EXISTS（smartAlbumRules）。
   */
  annotationFilter?: 'any' | 'none'

  /** 全局搜索词（FTS5 file_name/description/ocr_text + 标签名 LIKE；全局语义） */
  searchKeyword?: string
  /** 搜索范围（Eagle ˅ 面板九列；给出则按列 OR-group，未给走 FTS 子集） */
  searchScopes?: SearchScopeId[]
  /**
   * 语义条件的**可持久化**形态（智能文件夹用）：存的是描述文本，不是 id。
   * 主进程每次求值前把它解析成 `semanticIds` 快照（见 services/semanticRules）——
   * 存 id 列表等于把某一次检索的结果钉死，模型重建后相册就永远空着。
   */
  semanticQuery?: string
  /**
   * 语义档命中的素材 id（G1 文搜图）。**瞬时字段**：由主进程 vectors:search 算出后
   * 随本次搜索下推，智能文件夹不持久化它——存进规则里就是一份会过期的向量快照。
   * 三态：undefined=不参与匹配；[]=AI 判定无命中（出空结果）；非空=按 id 收窄。
   */
  semanticIds?: string[]
  /** 高级搜索语法 AST（OR/括号/引号/排除词；渲染层 parseSearchQuery 产物，
   *  主进程 astToSql 递归转 WHERE——语法解析单源在渲染层，SQL 转换在主进程） */
  advancedAst?: SearchAstNode
  /** 文件夹排除（'none' = 未分类；matchFolderFilter exclude 语义） */
  folderExcludeIds?: string[]

  // ── D-023 算子补齐（对齐 Eagle 字符串/数值/日期算子缺口；基准见 docs/DECISIONS.md）──

  /** 文件名开头为（LIKE 前缀，通配符转义；ASCII 大小写不敏感与既有 LIKE 键同口径） */
  nameBeginsWith?: string
  /** 文件名结尾为（LIKE 后缀，同上） */
  nameEndsWith?: string
  /**
   * 文件名正则（JS RegExp 语法，部分匹配语义，大小写敏感）。
   * UDF `regexp(pattern, value)` 下推（D-023 裁决：分页/下推保留）；模式经绑定参数
   * 传递，无 SQL 注入面。编译期 new RegExp 校验：非法正则抛明确错误，绝不带病进 SQL。
   */
  nameRegex?: string
  /** 注释没有内容（description IS NULL 或空串；标签/标注维已有各自键，这里补注释维） */
  descriptionEmpty?: boolean
  /** 注释有内容（与 descriptionEmpty 互斥使用，同时给按「无内容」优先编译） */
  descriptionHasContent?: boolean
  /**
   * 数值介于（闭区间 [min, max]，二元数组）：min/max 对在 AND 组已覆盖 between，
   * 这组键是为 OR 组/组编辑器**单行表达**而设——any 组里拆成 min+max 两行会变成 OR，
   * 语义就错了。脏形状（长度不为 2 / 非数字 / hi<lo）一律当没设。
   */
  widthBetween?: number[]
  heightBetween?: number[]
  fileSizeBetween?: number[]
  durationMsBetween?: number[]
  /**
   * 日期在过去 N 天内（相对窗口，求值时取当前时间）：智能夹语义是**滚动窗口**，
   * 与绝对区间的本质差异——存「7 天内添加」的相册永远显示最近一周。N≤0/非数字忽略。
   */
  importedWithinDays?: number
  takenWithinDays?: number
  modifiedWithinDays?: number
}

// ── D-023 正则算子 ──

/** 防炸闸：正则模式长度上限（超长模式本身就是输入异常，编译/保存前拒掉） */
export const SMART_ALBUM_MAX_REGEX_LEN = 256

/**
 * 正则模式编译校验（D-023）：合法返回 null，否则返回可念给人的错误文案。
 * 编辑器行内即时校验与主进程编译期拒绝共用这一个口径——非法正则必须在
 * SQL 执行**之前**被拦下，UDF 里的兜底只做纵深防御不负责报错。
 */
export function checkRegexPattern(pattern: string): string | null {
  if (pattern.length > SMART_ALBUM_MAX_REGEX_LEN) {
    return `正则过长（上限 ${SMART_ALBUM_MAX_REGEX_LEN} 字符）`
  }
  try {
    new RegExp(pattern)
    return null
  } catch (e) {
    return `非法正则：${(e as Error).message}`
  }
}

/** v2 结构校验结果（照 annotations.normalizeAnnotationInput 的 {ok, error} 风格） */
export type SmartAlbumRulesCheck = { ok: true } | { ok: false; error: string }

/**
 * D-022 v2 形状校验（编辑器保存前用）：只把关「组的结构 + 防炸闸」，
 * 不逐键校验 43+ 谓词的值型——未知键向前兼容（与读侧「不容错失败」同一哲学）。
 * 拒绝口径与主进程 buildSmartAlbumWhere 一致：深度 > SMART_ALBUM_MAX_DEPTH、
 * 组节点 > SMART_ALBUM_MAX_NODES、groups 不是数组、组不是对象。
 */
export function validateSmartAlbumRules(raw: unknown): SmartAlbumRulesCheck {
  const ctx = { nodes: 0 }
  const error = walkSmartAlbumGroups(raw, 1, ctx)
  return error ? { ok: false, error } : { ok: true }
}

function smartAlbumBudgetError(nodes: number): string {
  return `条件组数量超过上限 ${SMART_ALBUM_MAX_NODES}（当前 ${nodes}），请拆分或简化规则`
}

function walkSmartAlbumGroups(
  rules: unknown,
  depth: number,
  ctx: { nodes: number }
): string | null {
  // 空组（无 rules）也占一个节点：与引擎的计数口径一致（引擎对缺 rules 编译为空条件集）
  if (rules === undefined || rules === null) {
    ctx.nodes += 1
    return ctx.nodes > SMART_ALBUM_MAX_NODES ? smartAlbumBudgetError(ctx.nodes) : null
  }
  // 非对象的脏值不在本校验范围（引擎把它当空条件集宽容处理，不额外报错）
  if (typeof rules !== 'object') return null
  ctx.nodes += 1
  if (ctx.nodes > SMART_ALBUM_MAX_NODES) return smartAlbumBudgetError(ctx.nodes)
  if (depth > SMART_ALBUM_MAX_DEPTH)
    return `条件组嵌套超过 ${SMART_ALBUM_MAX_DEPTH} 层上限，请拍平条件组`

  const groups = (rules as { groups?: unknown }).groups
  if (groups === undefined || groups === null) return null
  if (!Array.isArray(groups)) return '条件组（groups）必须是数组'
  for (const group of groups) {
    if (typeof group !== 'object' || group === null || Array.isArray(group))
      return '条件组格式不合法（必须是对象）'
    const match = (group as { match?: unknown }).match
    if (match !== undefined && match !== 'any' && match !== 'all')
      return '条件组的匹配模式只能是「任一满足 / 全部满足」'
    const not = (group as { not?: unknown }).not
    if (not !== undefined && typeof not !== 'boolean') return '条件组取反标记（not）必须是布尔值'
    if ('groups' in group) return '条件组不支持自身的 groups 字段：嵌套组请放进组内 rules.groups'
    const sub = walkSmartAlbumGroups((group as { rules?: unknown }).rules, depth + 1, ctx)
    if (sub) return sub
  }
  return null
}
