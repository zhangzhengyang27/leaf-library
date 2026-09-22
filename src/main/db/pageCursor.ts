/**
 * Leaf · keyset 分页游标（docs/PAGINATION_DESIGN.md §3）
 *
 * 游标 = base64url(JSON { ks: 排序键值, r: rowid })，对渲染层不透明。
 * 非法/损坏游标一律返回 null（调用方降级为首页，列表永不空白）。
 *
 * 安全模型（代码审查 2026-09-18 P0-2）：游标只携带「值」，不携带任何 SQL 表达式。
 * 历史版本的 `e`（键表达式自描述）已退役——续页 WHERE 的键表达式一律由主进程
 * 按本次请求的 sort 查 PAGE_SORT_KEYS 取得，渲染层传入的 e 字段被忽略。
 */
export interface PageCursor {
  /** 旧单键游标；阶段 3 多键游标可省略（键在 ks） */
  c?: string | number | null
  r: number
  /** 阶段 3：置顶分组（1=置顶组；缺省按 0 处理） */
  p?: 0 | 1
  /** 阶段 3：多键值（与主进程 sort 对应的键表达式一一对应；缺省回退 [c] 单键） */
  ks?: Array<string | number | null>
  /** 已废弃：历史游标兼容读取时忽略此字段，绝不作为 SQL 来源 */
  e?: unknown
}

export function encodePageCursor(cur: PageCursor): string {
  return Buffer.from(JSON.stringify(cur)).toString('base64url')
}

export function decodePageCursor(s: string): PageCursor | null {
  try {
    const raw = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as PageCursor
    if (raw === null || typeof raw !== 'object' || typeof raw.r !== 'number') return null
    if (
      raw.c !== undefined &&
      raw.c !== null &&
      typeof raw.c !== 'string' &&
      typeof raw.c !== 'number'
    )
      return null
    if (raw.p !== undefined && raw.p !== 0 && raw.p !== 1) return null
    if (raw.ks !== undefined && !Array.isArray(raw.ks)) return null
    if (raw.e !== undefined) delete raw.e
    return raw
  } catch {
    return null
  }
}
