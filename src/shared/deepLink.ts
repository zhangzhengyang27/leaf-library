/**
 * `leaf://` 深链的构造与解析（主进程与渲染层共用一份，防止两边格式跑偏）
 *
 * 形状对齐 Eagle：`eagle://item/<id>` / `eagle://folder/<id>`。
 * 这里只放两种，且**只接受 UUID**：链接是从别的 app 递进来的（浏览器、终端、
 * 笔记软件），属于外部输入——它只能当一个 id 查库，任何情况下都不能当路径、
 * 不能被拼进 SQL 之外的地方，也不能因为多认识一种 host 就多开一条入口。
 */

export const DEEP_LINK_SCHEME = 'leaf'

export type DeepLinkTarget =
  | { kind: 'item'; id: string }
  | { kind: 'folder'; id: string }

/** id 形状：库里用的是 uuid v4（8-4-4-4-12 十六进制） */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildDeepLink(target: DeepLinkTarget): string {
  return `${DEEP_LINK_SCHEME}://${target.kind}/${target.id}`
}

/** 检查器「复制深链」用的便捷形态 */
export function buildItemLink(id: string): string {
  return buildDeepLink({ kind: 'item', id })
}

/**
 * 解析一条深链；不是我们认识的形状就返回 null。
 *
 * 刻意不用 `new URL()`：`leaf://item/../etc` 之类会被 WHATWG 归一化成看起来合法
 * 的 pathname（把 `..` 吃掉），反而更难判断到底解析成了什么。这里直接按字符串切，
 * 切完再校验 id 形状——外部输入宁可拒得死板。
 */
export function parseDeepLink(raw: unknown): DeepLinkTarget | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  const prefix = `${DEEP_LINK_SCHEME}://`
  if (!trimmed.toLowerCase().startsWith(prefix)) return null
  // 先去掉查询串与片段（某些发起方会自动补 ?），再看剩下的路径
  const path = decodeURIComponentSafe(trimmed.slice(prefix.length).split(/[?#]/)[0])
  // 只接受 "<kind>/<id>" 或后面多一个斜杠（浏览器会把 leaf://item/xxx 归一化成 xxx/）；
  // 再多一段就拒——那多半是 `leaf://item/<id>/../../env` 这类想搭便车的路径
  const m = /^(item|folder)\/([^/?#]+)\/?$/i.exec(path)
  if (!m) return null
  const kind = m[1].toLowerCase() as 'item' | 'folder'
  const id = m[2]
  return ID_RE.test(id) ? { kind, id } : null
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
