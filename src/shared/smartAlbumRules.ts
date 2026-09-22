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

export interface SmartAlbumRules {
  /** 条件匹配模式（D-012 对齐 Eagle「任一项/所有」）：默认 all */
  match?: 'any' | 'all'
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
}
