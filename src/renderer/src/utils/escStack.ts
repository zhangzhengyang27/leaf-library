/**
 * Esc 关闭层级栈（审查 P2-34）。
 *
 * 旧实现中 UModal 实例、命令面板、设置页各自在 window 上监听 Esc 且互不感知，
 * 多层浮层叠加时一次 Esc 会同时关闭所有层。
 * 规则：浮层打开时 pushEscScope() 入栈，Esc 处理器只有 isEscTop() 为真才响应，
 * 关闭/卸载时 popEscScope() 出栈——每按一次 Esc 只关掉栈顶那一层。
 */
const stack: symbol[] = []

/** 浮层打开时调用，返回作用域 token（需保存用于 pop/isTop） */
export function pushEscScope(): symbol {
  const s = Symbol('esc-scope')
  stack.push(s)
  return s
}

/** 浮层关闭/卸载时调用 */
export function popEscScope(s: symbol): void {
  const i = stack.lastIndexOf(s)
  if (i >= 0) stack.splice(i, 1)
}

/** 当前是否轮到该作用域响应 Esc */
export function isEscTop(s: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === s
}
