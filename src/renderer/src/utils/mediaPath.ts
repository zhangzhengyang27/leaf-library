/**
 * Leaf · 自定义协议媒体 URL 构造（审查 P2-32）。
 *
 * 旧实现 encodeURI(整条路径) 不编码 `#` 与 `?`，Chromium 把它们当
 * fragment/query 从 request.url 剥离 → 主进程按「URL 字符串 ↔ DB file_path
 * 精确相等」校验时匹配不到 → 文件名含 #/? 的素材预览/原图 404。
 *
 * 这里改为逐段 encodeURIComponent：段内的 # ? % 等全部转义，分隔符保持 /，
 * 主进程侧 decodeURIComponent + 平台分隔符归一后与 DB 精确比对。
 */
export function encodeMediaPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
}

/** 构造 image:// / video:// / rawfile:// URL */
export function mediaUrl(scheme: 'image' | 'video' | 'rawfile', filePath: string): string {
  return `${scheme}://${encodeMediaPath(filePath)}`
}
