/**
 * pdfjs-dist 运行时资源定位（P3-16：CJK cmap / 标准字体 / wasm 解码器）。
 *
 * pdfjs v6 的 getDocument 强制以「URL/路径 + 文件名」形式加载辅助资源：
 * - 主进程（Node 分支，NodeBinaryDataFactory）：`fs.readFile(baseUrl + filename)`，
 *   baseUrl 直接传文件系统路径（以 / 结尾）即可；
 * - 渲染端（DOMBinaryDataFactory）：`fetch(baseUrl + filename)`，本地路径会被
 *   Chromium 拦截 —— 由 protocols.ts 的 `pdfres://` 协议承接，本模块提供根目录。
 */
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'

let cachedRoot: string | null | undefined

/** pdfjs-dist 包根（含 cmaps/ standard_fonts/ wasm/ iccs/）；不可得返回 null */
export function getPdfjsDistRoot(): string | null {
  if (cachedRoot !== undefined) return cachedRoot
  const candidates: string[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- externalized 依赖的运行时定位（对齐 getFfmpegPath）
    candidates.push(dirname(require.resolve('pdfjs-dist/package.json')))
  } catch {
    /* 打包形态差异时走回退 */
  }
  try {
    // dev 回退（app 未就绪时抛错忽略）
    candidates.push(join(app.getAppPath(), 'node_modules/pdfjs-dist'))
  } catch {
    /* ignore */
  }
  // 以一份必然存在的资源文件确认定位有效
  for (const c of candidates) {
    if (existsSync(join(c, 'cmaps', 'UniGB-UCS2-H.bcmap'))) {
      cachedRoot = c
      return cachedRoot
    }
  }
  cachedRoot = null
  return null
}

/** pdfjs 支持按 kind 请求的资源子目录 */
export const PDFJS_RESOURCE_KINDS = new Set(['cmaps', 'standard_fonts', 'wasm', 'iccs'])
