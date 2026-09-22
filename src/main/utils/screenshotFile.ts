/**
 * 截图文件命名 / dataURL 解码 / 重名序号——纯 Node 逻辑，不依赖 electron（可单测）。
 */
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export function formatTimestamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

export function screenshotFileName(now: Date = new Date()): string {
  return `Screenshot - ${formatTimestamp(now)}`
}

export function decodeDataUrl(
  dataUrl: string
): { mime: 'image/png' | 'image/jpeg'; ext: '.png' | '.jpg'; buffer: Buffer } | null {
  const m = /^data:(image\/(?:png|jpeg));base64,([\s\S]+)$/.exec(dataUrl)
  if (!m) return null
  const mime = m[1] as 'image/png' | 'image/jpeg'
  return { mime, ext: mime === 'image/png' ? '.png' : '.jpg', buffer: Buffer.from(m[2], 'base64') }
}

export function uniqueFilePath(dir: string, base: string, ext: string): string {
  let candidate = join(dir, `${base}${ext}`)
  let n = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${base} ${n}${ext}`)
    n += 1
  }
  return candidate
}
