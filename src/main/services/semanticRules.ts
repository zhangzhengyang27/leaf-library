/**
 * Leaf · 语义条件解析（把 rules.semanticQuery 变成一次性的 id 快照）
 *
 * 放在 services 而不是 db：编译 SQL 是纯函数（`buildSmartAlbumWhere` 要能单测、
 * 要在没有模型的环境里跑），而"取模型算一次向量"是有 IO 的一步。
 * 所以规则里存文本、进 SQL 前在这里补齐 `semanticIds`。
 *
 * fail-closed 是刻意的：模型没下载 / 检索失败时解析出**空集**，
 * `buildSmartAlbumWhere` 会把空集编译成 `1=0` → 该相册显示空，
 * 而不是"条件被静默忽略、整库都算命中"。后者会让用户以为 AI 真的这么觉得。
 */
import { SEMANTIC_ID_CAP, type SmartAlbumRules } from '@shared/smartAlbumRules'
import { clipEmbeddings } from './ClipEmbeddingService'

/** 查询串长度上限：它只进 embedding，不拼 SQL，但也不能拿超长文本去喂 77 token 窗口 */
const MAX_QUERY_CHARS = 200

/**
 * 带语义条件时返回补好 `semanticIds` 的副本；没有语义条件就原样返回（不复制对象）。
 * 已经带快照的（渲染层自己跑过 vectors:search 那条路）不重复算。
 *
 * `search` 是刻意留的注入点：不注入的话这条决策表只能靠 754MB 模型才测得动，
 * 而真正会写错的是决策表本身（三态里任何一格退化都会把整库当成命中）。
 */
export async function applySemanticQuery(
  rules: SmartAlbumRules,
  search: (text: string, topK: number) => Promise<Array<{ id: string }>> = (text, topK) =>
    clipEmbeddings.searchText(text, topK)
): Promise<SmartAlbumRules> {
  const raw = typeof rules.semanticQuery === 'string' ? rules.semanticQuery.trim() : ''
  if (raw === '') return rules
  if (Array.isArray(rules.semanticIds)) return rules
  const hits = await search(raw.slice(0, MAX_QUERY_CHARS), SEMANTIC_ID_CAP)
  return { ...rules, semanticIds: hits.map((h) => h.id) }
}

/**
 * 落库前剥掉瞬时快照。契约里 `semanticIds` 写着"不持久化"，但那只是注释——
 * 渲染层传来什么主进程原样 JSON.stringify 的话，一份旧快照进了 rules_json，
 * 上面那条"已带快照就不重算"就会让这个相册永远拿旧 id 出结果，且不留痕迹。
 * 信任边界要设在主进程，不能指望编辑器那一侧的字段清单。
 */
export function stripSemanticSnapshot(rules: SmartAlbumRules): SmartAlbumRules {
  if (!Array.isArray(rules.semanticIds)) return rules
  const { semanticIds: _drop, ...rest } = rules
  return rest
}
