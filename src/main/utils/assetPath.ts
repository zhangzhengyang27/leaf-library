import { isAbsolute, join } from 'node:path'

/**
 * electron-vite `?asset` 产物路径有两种形态：build/dev 的多数版本发「相对 out 目录」
 * 的串，部分版本发绝对路径。直接 `join(__dirname, p)` 会把绝对串二次拼接成
 * `/out/main/Users/...` 这类死路（2026-09-28 托盘空图根因），此处统一收敛：
 * 绝对直接用，相对按调用方 __dirname 拼接。
 */
export function assetPath(p: string, dirname: string): string {
  return isAbsolute(p) ? p : join(dirname, p)
}
