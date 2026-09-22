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
