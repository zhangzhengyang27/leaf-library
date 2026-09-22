/**
 * Leaf · ClipServer（三期 P1：浏览器剪藏）
 *
 * 架构照抄 Eagle 验证过的模式：桌面应用内嵌 localhost HTTP API，
 * 浏览器扩展 POST 图片 URL/base64 给应用，由应用下载入库（规避扩展跨域）。
 *
 * 与 Eagle 的差异（不抄它的安全槽）：
 * - 仅绑定 127.0.0.1；随机端口，端口 + token 落盘 userData/clip-server.json
 * - 所有请求校验 x-leaf-token 头 + Origin/Host 头（防 DNS rebinding / 恶意网页探测）
 *
 * API：
 *   GET  /api/v1/ping            → { ok, app: 'leaf' }（插件探活）
 *   POST /api/v1/photos/fromUrl  { url, title? }      下载并入库
 *   POST /api/v1/photos/fromBase64 { data, ext?, title? }
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { app, safeStorage } from 'electron'
import { getAssetProcessingRef } from './assetProcessingRef'
import { photoRepository } from '../db/repos/PhotoRepository'
import { photoFolderRepository } from '../db/repos/PhotoFolderRepository'
import { albumRepository } from '../db/repos/AlbumRepository'
import { addBookmark as addBookmarkService } from './BookmarkService'
import { handleMcpJsonRpc, type McpContext } from './McpHandler'
import { activeSubdir } from '../modules/libraryRegistry'
import { assertPublicUrl } from '../utils/netSafety'
import { IMAGE_EXTENSIONS as SHARED_IMAGE_EXT, RASTER_EXTENSIONS } from '@shared/assetTypes'

/**
 * 采集端点可收的位图：由单一真源派生（新增图片/贴图格式自动生效），
 * 只排除「不适合从网页抓一路丢进来」的容器。psd/ai/pdf 仍走主界面导入。
 */
const CLIP_EXCLUDED = new Set(['pdf', 'psd', 'ai'])
const IMAGE_EXTENSIONS = [...SHARED_IMAGE_EXT, ...RASTER_EXTENSIONS].filter(
  (e) => !CLIP_EXCLUDED.has(e)
)
const MAX_BODY_BYTES = 64 * 1024 * 1024
/** 代码审查 P0-3：远端下载体上限（32MB，防内存打爆） */
const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024
/** 代码审查 P0-3：手动跟随重定向的最大跳数 */
const MAX_REDIRECT_HOPS = 5

interface ClipServerConfig {
  port: number
  token: string
}

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg'
}

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase() ?? ''
    if (IMAGE_EXTENSIONS.includes(ext) && pathname.includes('.')) return ext
  } catch {
    /* ignore */
  }
  return 'jpg'
}

function sanitizeFileName(input: string, fallbackExt: string): string {
  const base = (input || 'clip')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  const safe = base || `clip_${Date.now()}`
  return `${safe}.${fallbackExt}`
}

export class ClipServer {
  private server: ReturnType<typeof createServer> | null = null
  private config: ClipServerConfig | null = null

  /** 端口 + token（插件配置用）。服务未启动时为 null。 */
  getConfig(): ClipServerConfig | null {
    return this.config
  }

  start(): Promise<{ port: number; token: string }> {
    if (this.server) {
      return Promise.resolve(this.config!)
    }

    // token 持久化：插件只需配置一次
    // 代码审查 P0-8：token 用 safeStorage 加密落盘（兼容旧明文并原地迁移）
    const cfgPath = join(app.getPath('userData'), 'clip-server.json')
    let cfg: ClipServerConfig
    try {
      const parsed = JSON.parse(readFileSync(cfgPath, 'utf-8')) as { port?: number; token?: string }
      if (!parsed.port || !parsed.token) throw new Error('invalid')
      if (safeStorage.isEncryptionAvailable()) {
        try {
          cfg = {
            port: parsed.port,
            token: safeStorage.decryptString(Buffer.from(parsed.token, 'base64'))
          }
        } catch {
          // 旧明文格式（迁移到加密）
          cfg = { port: parsed.port, token: parsed.token }
        }
      } else {
        cfg = { port: parsed.port, token: parsed.token }
      }
    } catch {
      cfg = { port: 0, token: randomBytes(24).toString('hex') }
    }

    // 固定端口被占用时回退随机端口（审查修复：原直接 reject，剪藏服务整个会话不可用）
    return new Promise((resolve, reject) => {
      const attempt = (port: number, isRetry: boolean): void => {
        const server = createServer((req, res) => this.handle(req, res))
        server.on('error', (err) => {
          const code = (err as NodeJS.ErrnoException).code
          if (!isRetry && port !== 0 && code === 'EADDRINUSE') {
            console.warn(`[ClipServer] port ${port} in use, falling back to random port`)
            server.close()
            attempt(0, true)
          } else {
            this.server = null
            reject(err)
          }
        })
        server.listen(port, '127.0.0.1', () => {
          const address = server.address()
          const boundPort = typeof address === 'object' && address ? address.port : 0
          this.config = { port: boundPort, token: cfg.token }
          try {
            const persisted = safeStorage.isEncryptionAvailable()
              ? { port: boundPort, token: safeStorage.encryptString(cfg.token).toString('base64') }
              : { port: boundPort, token: cfg.token }
            writeFileSync(cfgPath, JSON.stringify(persisted))
          } catch (persistErr) {
            console.error('[ClipServer] persist config failed:', persistErr)
          }
          console.log(`[ClipServer] listening on 127.0.0.1:${boundPort}`)
          resolve(this.config)
        })
        this.server = server
      }
      attempt(cfg.port || 0, false)
    })
  }

  stop(): void {
    this.server?.close()
    this.server = null
    this.config = null
  }

  /**
   * 重新生成 token（设置页「重新生成」用，审查修复）：
   * 必须同步更新运行中服务的内存 token 并按 P0-8 语义重写落盘文件
   * （safeStorage 可用则加密落盘）。旧 IPC 实现只写明文文件、不通知服务，
   * 导致新 token 无效且落盘格式退回明文。
   */
  regenerateToken(): { port: number | null; token: string | null } {
    if (!this.config) return { port: null, token: null }
    this.config.token = randomBytes(24).toString('hex')
    const cfgPath = join(app.getPath('userData'), 'clip-server.json')
    try {
      const persisted = safeStorage.isEncryptionAvailable()
        ? { port: this.config.port, token: safeStorage.encryptString(this.config.token).toString('base64') }
        : { port: this.config.port, token: this.config.token }
      writeFileSync(cfgPath, JSON.stringify(persisted))
    } catch (persistErr) {
      console.error('[ClipServer] persist regenerated config failed:', persistErr)
    }
    return { port: this.config.port, token: this.config.token }
  }

  private authorized(req: IncomingMessage): boolean {
    if (!this.config) return false
    // 代码审查 P0-8：常量时间比较，防时序侧信道探测 token
    const given = req.headers['x-leaf-token']
    const expected = this.config.token
    if (typeof given !== 'string') return false
    const a = Buffer.from(given)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false
    // Origin：浏览器扩展发出为 chrome-extension://<id>；无 Origin 的 curl 等本地工具放行（token 已把关）
    const origin = req.headers.origin
    if (origin && !/^chrome-extension:\/\//i.test(origin) && !/^moz-extension:\/\//i.test(origin)) {
      return false
    }
    // Host 必须是 127.0.0.1（防 DNS rebinding）
    const host = req.headers.host ?? ''
    return host.startsWith('127.0.0.1:')
  }

  private reply(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      // F7：浏览器扩展（MV3 SW fetch）跨域需要 CORS；token 鉴权不因此放宽
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-leaf-token'
    })
    res.end(JSON.stringify(body))
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > MAX_BODY_BYTES) throw new Error('body too large')
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks).toString('utf-8')
  }

  /**
   * 下载远端图片（代码审查 P0-3 修复）：
   * - 发起前 + 每跳重定向均做 SSRF 校验（assertPublicUrl：拒绝私有/链路本地 IP；
   *   鉴权后的剪藏下载允许回环目标，支持本地/内网图片剪藏）
   * - redirect: 'manual' 手动跟随，逐跳校验，最多 MAX_REDIRECT_HOPS 跳
   * - 流式读取并限制 MAX_DOWNLOAD_BYTES，防大响应打爆主进程内存
   */
  private async downloadImage(
    url: string,
    referer?: string
  ): Promise<{ buffer: Buffer; ext: string }> {
    // 鉴权后的剪藏下载允许回环目标（本地/内网图片剪藏；审查修复）
    await assertPublicUrl(url, { allowLoopback: true })
    let current = url
    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
      const resp = await fetch(current, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 LeafClip/1.0',
          ...(referer ? { Referer: referer } : {})
        },
        redirect: 'manual',
        // 远端挂起时请求会永久 pending（扩展侧表现为剪藏无响应）；
        // 32MB 上限下 30s 足够慢速服务器完成传输
        signal: AbortSignal.timeout(30_000)
      })
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location')
        if (!loc) throw new Error('redirect without location')
        const next = new URL(loc, current).toString()
        await assertPublicUrl(next, { allowLoopback: true })
        current = next
        continue
      }
      if (!resp.ok) throw new Error(`download failed: HTTP ${resp.status}`)
      const reader = resp.body?.getReader()
      if (!reader) throw new Error('download failed: empty body')
      const chunks: Buffer[] = []
      let size = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_DOWNLOAD_BYTES) {
          await reader.cancel().catch(() => {})
          throw new Error('download too large')
        }
        chunks.push(Buffer.from(value))
      }
      const buffer = Buffer.concat(chunks)
      const contentType = (resp.headers.get('content-type') ?? '').split(';')[0].trim()
      const ext = IMAGE_MIME_EXT[contentType] ?? extFromUrl(current)
      return { buffer, ext }
    }
    throw new Error('too many redirects')
  }

  private ingest(buffer: Buffer, fileName: string, folderId?: string): { id: string } {
    // 响应需要 id，入库须同步完成；至少去掉多余的 statSync（审查 P3-10）：
    // 刚写完的大小 buffer.length 已知，无需再读一次盘
    const dir = activeSubdir('clips')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, `${Date.now()}_${fileName}`)
    writeFileSync(filePath, buffer)
    const photo = photoRepository.addPhoto(filePath, {
      // 旧实现 statSync 只为拿刚写完的大小——buffer.length 已知（审查 P3-10）
      fileSize: buffer.length,
      source: 'clip'
    })
    // F7.1：扩展剪藏可指定目标文件夹（无效 id 静默忽略）
    if (folderId) {
      try {
        photoFolderRepository.assignPhotos(folderId, [photo.id])
      } catch (err) {
        console.warn('[ClipServer] assign folder failed:', folderId, err)
      }
    }
    getAssetProcessingRef()?.enqueue(photo.id)
    return { id: photo.id }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')

      // F7：CORS 预检（浏览器扩展 SW 发出的带 token 请求会先 OPTIONS；预检不带 token，直接放行）
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-leaf-token',
          'Access-Control-Max-Age': '86400'
        })
        res.end()
        return
      }

      if (url.pathname === '/api/v1/ping') {
        // 探活也要求 token：避免恶意网页探测应用存在
        if (!this.authorized(req)) return this.reply(res, 401, { ok: false, error: 'unauthorized' })
        return this.reply(res, 200, { ok: true, app: 'leaf' })
      }

      // F7.1：文件夹清单（扩展剪藏时选目标文件夹）
      if (url.pathname === '/api/v1/folders') {
        if (!this.authorized(req)) return this.reply(res, 401, { ok: false, error: 'unauthorized' })
        const folders = photoFolderRepository.list().map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId
        }))
        return this.reply(res, 200, { ok: true, folders })
      }

      // MCP 接入点（六期基建）：Streamable HTTP（POST + JSON 单响应），复用 token 鉴权
      if (url.pathname === '/mcp' || url.pathname === '/mcp/') {
        if (req.method !== 'POST')
          return this.reply(res, 405, { ok: false, error: 'method not allowed' })
        if (!this.authorized(req)) return this.reply(res, 401, { ok: false, error: 'unauthorized' })
        const rpc = JSON.parse(await this.readBody(req)) as Record<string, unknown>
        const mcpCtx: McpContext = {
          photos: photoRepository,
          albums: albumRepository,
          addBookmark: addBookmarkService,
          enqueue: (id) => getAssetProcessingRef()?.enqueue(id)
        }
        const result = await handleMcpJsonRpc(rpc, mcpCtx)
        if (result.body === null) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' })
          res.end()
          return
        }
        return this.reply(res, result.status, result.body)
      }

      if (req.method !== 'POST')
        return this.reply(res, 405, { ok: false, error: 'method not allowed' })
      if (!this.authorized(req)) return this.reply(res, 401, { ok: false, error: 'unauthorized' })

      const body = JSON.parse(await this.readBody(req)) as Record<string, string>

      if (url.pathname === '/api/v1/photos/fromUrl') {
        const src = String(body.url ?? '')
        if (!/^https?:\/\//i.test(src))
          return this.reply(res, 400, { ok: false, error: 'invalid url' })
        const { buffer, ext } = await this.downloadImage(src)
        const { id } = this.ingest(
          buffer,
          sanitizeFileName(String(body.title ?? ''), ext),
          typeof body.folder === 'string' && body.folder ? body.folder : undefined
        )
        return this.reply(res, 200, { ok: true, id })
      }

      if (url.pathname === '/api/v1/photos/fromBase64') {
        const raw = String(body.data ?? '')
        const commaIdx = raw.indexOf(',')
        const b64 = commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw
        const declaredMime =
          commaIdx >= 0 && raw.slice(0, commaIdx).includes('image/')
            ? raw.slice(5, raw.indexOf(';') > 0 ? raw.indexOf(';') : commaIdx)
            : ''
        const buffer = Buffer.from(b64, 'base64')
        if (buffer.length === 0) return this.reply(res, 400, { ok: false, error: 'empty data' })
        // ext 必须白名单（审查 P2-1）：body.ext 原样拼文件名时 `../` 可逃出 clips 目录任意写
        let ext = IMAGE_MIME_EXT[declaredMime] ?? String(body.ext ?? 'png').replace(/^\./, '')
        if (!IMAGE_EXTENSIONS.includes(ext)) ext = 'png'
        const { id } = this.ingest(
          buffer,
          sanitizeFileName(String(body.title ?? ''), ext),
          typeof body.folder === 'string' && body.folder ? body.folder : undefined
        )
        return this.reply(res, 200, { ok: true, id })
      }

      return this.reply(res, 404, { ok: false, error: 'not found' })
    } catch (err) {
      console.error('[ClipServer] handle error:', err)
      this.reply(res, 500, { ok: false, error: (err as Error).message })
    }
  }
}

let singleton: ClipServer | null = null

export function getClipServer(): ClipServer {
  if (!singleton) singleton = new ClipServer()
  return singleton
}
