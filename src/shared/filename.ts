/**
 * 跨进程共享 · 文件名基础名（不含扩展名）合法化。
 *
 * 替换 macOS / Windows 通配非法字符与控制字符为 '-'；供批量重命名
 * （F2，渲染端渲染 token 后兜底）与主进程 renameFiles（最终落盘前兜底）共用。
 */
export function sanitizeFileNameBase(name: string): string {
  // \p{Cc} = 控制字符（等价 \x00-\x1f\x7f；避免 no-control-regex 对字面控制的限制）
  const illegal = new RegExp('[\\\\/:*?"<>|\\p{Cc}]', 'gu')
  return name.replace(illegal, '-').trim()
}

/** 批量重命名模板支持的 token（渲染端与模型产出共用同一份词表） */
export const RENAME_TOKENS = ['{name}', '{n}', '{date}', '{time}', '{parent}', '{rand}'] as const

/**
 * 校验一条命名模板是否可用：只允许已知 token + 合法字面文本。
 * 模型产出的 pattern 必须先过这道闸——它可能吐出 {ext}、{invalid} 甚至带 '/' 的东西，
 * 而批量重命名是直接改磁盘文件的动作。
 */
export function isSafeRenamePattern(pattern: string): boolean {
  const p = pattern.trim()
  if (!p || p.length > 120) return false
  const literal = p.replace(/\{(name|n|date|time|parent|rand)\}/g, '')
  if (/[{}]/.test(literal)) return false
  return sanitizeFileNameBase(literal) === literal
}
