import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { photoRepository, type Photo } from '../db/repos/PhotoRepository'
import { getAssetProcessingRef } from './assetProcessingRef'
import { activeSubdir } from '../modules/libraryRegistry'
import { assertPublicUrl } from '../utils/netSafety'

/**
 * BookmarkService — 六期书签收集（Karakeep 模式本地化）。
 *
 * addBookmark(url)：
 *   1. fetch 抓 <title>/og:title/og:description（5s 超时，失败不阻塞）
 *   2. offscreen BrowserWindow 打开页面 → capturePage 可见区截图（截图存档）
 *   3. 截图 PNG 落 userData/bookmarks/ 作为素材本体，kind='bookmark' + source_url 入库
 *      （截图走既有图片管线：缩略图/pHash/主色全部复用）
 * 截图失败（加载超时/拒绝连接）→ 占位图兜底，书签仍可用（预览里可点开原链接）。
 */

const TITLE_TIMEOUT = 5_000
const SHOT_TIMEOUT = 12_000

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function pickMeta(html: string, re: RegExp): string | undefined {
  const m = html.match(re)
  return m?.[1]?.trim() ? decodeEntities(m[1].trim()) : undefined
}

/** 抓页面标题/描述；任何失败返回空对象（不阻塞收藏） */
export async function fetchPageMeta(
  url: string
): Promise<{ title?: string; description?: string }> {
  try {
    // 重定向逐跳校验 + 流式限长（审查 P2-5 / P3-13）：redirect:'follow' 会在
    // 无校验的情况下跟随到内网目标；text() 全量下载可被超大响应打爆内存
    let current = url
    for (let hop = 0; hop <= 5; hop++) {
      await assertPublicUrl(current)
      const resp = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TITLE_TIMEOUT),
        headers: { 'User-Agent': 'Mozilla/5.0 (desktop) Leaf/1.0 bookmark-archiver' }
      })
      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const loc = resp.headers.get('location')
        if (!loc) return {}
        current = new URL(loc, current).toString()
        void resp.body?.cancel()
        continue
      }
      if (!resp.ok) return {}
      const html = await readBodyLimited(resp, 200_000)
      const title =
        pickMeta(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
        pickMeta(html, /<title[^>]*>([^<]+)<\/title>/i)
      const description =
        pickMeta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ??
        pickMeta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      return { title, description }
    }
    return {}
  } catch {
    return {}
  }
}

/** 流式读取响应体，超过 limit 即取消（对齐 ClipServer.downloadImage 的限长写法） */
async function readBodyLimited(resp: Response, limit: number): Promise<string> {
  const reader = resp.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let out = ''
  while (out.length < limit) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  void reader.cancel()
  return out.slice(0, limit)
}

/** offscreen 窗口截图；失败返回 null */
export async function capturePageScreenshot(url: string): Promise<Buffer | null> {
  // 代码审查 P0-4：拒绝内网/回环目标，防 SSRF（offscreen 渲染可比 fetch 更危险）
  await assertPublicUrl(url)
  if (!app.isReady()) return null
  let win: BrowserWindow | null = null
  try {
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { offscreen: true }
    })
    // 页面级跳转同样受限（审查 P2-5）：只允许同主机导航，跨主机跳转一律拦截，
    // 防止公网 URL 经页面跳转把 offscreen 会话引向内网目标
    const initialHost = new URL(url).hostname
    win.webContents.on('will-navigate', (e, target) => {
      try {
        if (new URL(target).hostname !== initialHost) e.preventDefault()
      } catch {
        e.preventDefault()
      }
    })
    await Promise.race([
      win.loadURL(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('load timeout')), SHOT_TIMEOUT))
    ])
    await new Promise((r) => setTimeout(r, 1_200)) // 等待首帧渲染完成
    const image = await win.webContents.capturePage()
    if (image.isEmpty()) return null
    return image.toPNG()
  } catch {
    return null
  } finally {
    win?.destroy()
  }
}

/** 占位图（截图失败时素材本体仍需是合法图片） */
async function placeholderPng(): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 235, g: 238, b: 244 } }
  })
    .png()
    .toBuffer()
}

function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\n\r\t]/g, '_').trim()
}

/** 收藏书签；返回入库后的 Photo（缩略图异步生成） */
export async function addBookmark(url: string, title?: string): Promise<Photo> {
  let normalized = url.trim()
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('无效 URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅支持 http/https 链接')
  }
  // 代码审查 P0-4：解析后 IP 在内网/回环/链路本段则拒绝（防 SSRF）
  await assertPublicUrl(normalized)

  const meta = await fetchPageMeta(normalized)
  const finalTitle =
    sanitizeName(title || meta.title || parsed.hostname).slice(0, 80) || parsed.hostname

  const dir = activeSubdir('bookmarks')
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `${Date.now()}_${finalTitle}.png`)
  const shot = await capturePageScreenshot(normalized)
  const buffer = shot ?? (await placeholderPng())
  writeFileSync(filePath, buffer)

  const photo = photoRepository.addPhoto(filePath, {
    fileSize: statSync(filePath).size,
    source: 'bookmark',
    kind: 'bookmark',
    sourceUrl: normalized,
    // updatePhoto 不持久化 description，必须在入库时带上
    description: meta.description
  })
  getAssetProcessingRef()?.enqueue(photo.id)
  return photo
}
