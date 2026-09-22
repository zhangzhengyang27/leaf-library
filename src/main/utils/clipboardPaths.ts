/**
 * F8：剪贴板文本 → 绝对路径列表（纯函数，无 electron 依赖，便于单测）。
 *
 * 逐行解析：支持裸绝对路径与 file:// URL（fileURLToPath 按平台还原），
 * exists 回调过滤（默认 existsSync 语义由调用方注入），去重，上限 max。
 */
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

export function extractPathsFromText(
  text: string,
  exists: (p: string) => boolean,
  max = 200
): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    if (out.length >= max) break
    let p = raw.trim()
    if (!p) continue
    if (/^file:\/\//i.test(p)) {
      try {
        // fileURLToPath 按当前平台还原（Windows 下 file:///C:/a.png → C:\a.png），
        // 旧实现 decodeURIComponent(pathname) 得到 /C:/... 永远 exists=false（审查 P2-33）
        p = fileURLToPath(p)
      } catch {
        continue
      }
    }
    // isAbsolute 按平台判定：接受 / 与 C:\ 两种盘符形态（审查 P2-33）
    if (isAbsolute(p) && exists(p) && !out.includes(p)) out.push(p)
  }
  return out
}
