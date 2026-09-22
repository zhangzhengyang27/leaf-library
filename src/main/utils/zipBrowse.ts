/**
 * F18：ZIP 内容浏览（对齐 Eagle 压缩包浏览）。
 *
 * - listZipEntries：yauzl 惰性遍历目录项（不解压，仅读中央目录）
 * - 路径安全：拒绝绝对路径 / ../ 穿越 / 空名（zipEntryPathSafe 纯函数可单测）
 * - 提取：仅支持 <10MB 的图片与文本项，返回 data URL（渲染层直接预览，
 *   不落盘、不走 file://，规避任意文件读取面）
 */
import yauzl from 'yauzl'

export interface ZipEntry {
  name: string
  size: number
  isDir: boolean
}

const MAX_EXTRACT_BYTES = 10 * 1024 * 1024
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml'
}
const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'json', 'csv', 'log', 'yml', 'yaml', 'xml', 'html', 'htm'])

/** zip 项名安全过滤（纯函数）：拒绝绝对路径/盘符/../穿越/空名/反斜杠混用 */
export function zipEntryPathSafe(name: string): boolean {
  if (!name) return false
  if (name.startsWith('/') || name.startsWith('\\')) return false
  if (/^[a-zA-Z]:/.test(name)) return false
  if (name.includes('\\')) return false
  const segs = name.split('/')
  if (segs.some((s) => s === '..')) return false
  return segs.filter(Boolean).length > 0
}

function extOf(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
}

function mimeOf(name: string): string | null {
  const ext = extOf(name)
  if (IMAGE_MIME[ext]) return IMAGE_MIME[ext]
  if (TEXT_EXTS.has(ext)) return 'text/plain'
  return null
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (err, zip) =>
      err ? reject(err) : resolve(zip)
    )
  })
}

/** 列出 zip 全部条目（目录项 size=0） */
export async function listZipEntries(filePath: string, limit = 2000): Promise<ZipEntry[]> {
  const zip = await openZip(filePath)
  return new Promise((resolve, reject) => {
    const out: ZipEntry[] = []
    zip.on('error', (err) => {
      zip.close()
      reject(err)
    })
    zip.on('entry', (entry: yauzl.Entry) => {
      if (out.length < limit) {
        out.push({
          name: entry.fileName,
          size: entry.uncompressedSize,
          isDir: entry.fileName.endsWith('/')
        })
      }
      zip.readEntry()
    })
    zip.on('end', () => {
      zip.close()
      resolve(out)
    })
    zip.readEntry()
  })
}

function readEntry(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error('no stream'))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_EXTRACT_BYTES) {
          stream.destroy()
          reject(new Error('entry too large'))
          return
        }
        chunks.push(c)
      })
      stream.on('error', reject)
      stream.on('end', () => resolve(Buffer.concat(chunks)))
    })
  })
}

/**
 * 提取单个条目为 data URL（≤10MB 图片/文本）。
 * 返回 null = 不支持的类型或超限（渲染层显示提示）。
 */
export async function extractZipEntryDataUrl(
  filePath: string,
  entryName: string
): Promise<{ mime: string; dataUrl: string } | null> {
  if (!zipEntryPathSafe(entryName)) return null
  const mime = mimeOf(entryName)
  if (!mime) return null
  const zip = await openZip(filePath)
  try {
    const entry = await new Promise<yauzl.Entry | null>((resolve, reject) => {
      zip.on('error', reject)
      zip.on('entry', (e: yauzl.Entry) => {
        if (e.fileName === entryName) {
          resolve(e)
          return
        }
        zip.readEntry()
      })
      zip.on('end', () => resolve(null))
      zip.readEntry()
    })
    if (!entry || entry.uncompressedSize > MAX_EXTRACT_BYTES) return null
    const buf = await readEntry(zip, entry)
    return { mime, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
  } finally {
    zip.close()
  }
}
