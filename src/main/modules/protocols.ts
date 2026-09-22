import { protocol, net } from 'electron'
import { existsSync, rmSync } from 'fs'
import { promises as fsp } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { convertHeicToPng, isHeicPath } from '../utils/imageConvert'
import { photoRepository } from '../db/repos/PhotoRepository'
import { getThumbnailService, type ThumbSize } from '../services/ThumbnailService'
import { getPdfjsDistRoot, PDFJS_RESOURCE_KINDS } from '../utils/pdfjsResources'

/**
 * 素材路径归属校验（代码审查 P0-1）。
 *
 * 旧实现只做 existsSync，等于把整个本地文件系统对渲染层开放——任何一次 XSS
 * 都能 fetch('rawfile:///etc/passwd') 或 image:// 读取 ~/.ssh/id_rsa、
 * clip-server.json（ClipServer token）、其它资源库的 db。
 * 这里统一要求：路径必须是**已入库素材**的 file_path，且文件仍存在。
 * 含回收站软删行：空格 QuickLook 明确支持回收站视图预览，按活跃行过滤会让
 * 软删素材的图片/视频/文本预览全部 404（缩略图按 photoId 反而正常）。
 */
function resolveAssetPath(rawPath: string): string | null {
  if (!rawPath) return null
  try {
    const photo = photoRepository.getPhotoByPathIncludingDeleted(rawPath)
    if (!photo || !existsSync(photo.filePath)) return null
    return photo.filePath
  } catch {
    return null
  }
}

/**
 * 协议 URL → 磁盘路径（审查 P2-32）：
 * - 渲染端逐段 encodeURIComponent（utils/mediaPath），此处整体解码；
 * - Windows 上渲染端以 / 分隔、DB 存 \：归一后再做精确比对，
 *   否则 image:// 原图预览在 Windows 全量 404。
 */
function decodeProtocolPath(raw: string): string {
  let p = raw
  try {
    p = decodeURIComponent(raw)
  } catch {
    /* 保留原样（含非法 % 序列的旧 URL） */
  }
  if (process.platform === 'win32') p = p.replace(/\//g, '\\')
  return p
}

// F20：插件沙箱（无 same-origin 的 iframe）需要以 fetch/crossorigin 读取缩略图
// 画直方图等像素数据——必须在 app ready 前注册一次；不加 standard，保持现有 URL 解析
protocol.registerSchemesAsPrivileged([
  { scheme: 'thumb', privileges: { supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'image', privileges: { supportFetchAPI: true, corsEnabled: true, stream: true } },
  // pdfjs 辅助资源（CJK cmap/标准字体/wasm 解码器）：渲染端 pdfjs 走 fetch 加载，
  // 本地路径会被拦，注册成 privileged 协议后 cMapUrl 直接用 pdfres://<kind>/
  { scheme: 'pdfres', privileges: { supportFetchAPI: true } }
])

/** 响应透传 + CORS 头（插件沙箱跨源读取缩略图/原图用；协议本身仍校验入库素材） */
function withCors(resp: Response): Response {
  const headers = new Headers(resp.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers })
}

export function registerProtocols(): void {
  // 注册 image:// 协议（使用现代 protocol.handle API，原生支持异步）
  protocol.handle('image', async (request) => {
    try {
      // 移除 'image://' 前缀
      const url = request.url.replace(/^image:\/\//, '')
      const filePath = resolveAssetPath(decodeProtocolPath(url))

      // 非入库素材（或文件已不存在）一律拒绝
      if (!filePath) {
        console.error(`Image file not an asset: ${request.url}`)
        return new Response('Not Found', { status: 404 })
      }

      let targetPath = filePath
      let heicTempPath: string | null = null
      if (isHeicPath(filePath)) {
        try {
          targetPath = await convertHeicToPng(filePath)
          heicTempPath = targetPath
        } catch (heicError) {
          console.error(`HEIC conversion failed: ${filePath}`, heicError)
          return new Response('Conversion Failed', { status: 500 })
        }
      }

      try {
        if (heicTempPath) {
          // 转换产物读入内存后立即清理临时文件（旧实现每次预览都向 tmpdir
          // 泄漏一个 PNG，永不回收）
          const buf = await fsp.readFile(heicTempPath)
          const headers = new Headers()
          headers.set('content-type', 'image/png')
          return withCors(new Response(buf, { status: 200, headers }))
        }
        // 使用 net.fetch 加载本地文件
        return withCors(await net.fetch(pathToFileURL(targetPath).toString()))
      } finally {
        if (heicTempPath) {
          try {
            rmSync(heicTempPath, { force: true })
          } catch {
            // Windows 上文件仍被占用时可能删不掉，忽略
          }
        }
      }
    } catch (err) {
      console.error(`Error in image protocol handler: ${request.url}`, err)
      return new Response('Internal Error', { status: 500 })
    }
  })

  // 注册 thumb:// 协议：thumb://<size>/<photoId>（256/1024）
  // 命中缩略图缓存直返；未命中现场生成（等待后台管线亦可，按需生成保证网格永不缺图）
  protocol.handle('thumb', async (request) => {
    try {
      const raw = request.url.replace(/^thumb:\/\//, '')
      const slashIdx = raw.indexOf('/')
      if (slashIdx <= 0) return new Response('Bad Request', { status: 400 })
      const size = Number(raw.slice(0, slashIdx)) as ThumbSize
      const photoId = decodeURI(raw.slice(slashIdx + 1))
      if ((size !== 256 && size !== 1024) || !photoId) {
        return new Response('Bad Request', { status: 400 })
      }

      const thumbs = getThumbnailService()
      let cached = thumbs.getCachedPath(photoId, size)
      if (!cached) {
        const photo = photoRepository.getPhotoById(photoId)
        if (!photo || !existsSync(photo.filePath)) {
          return new Response('Not Found', { status: 404 })
        }
        cached = await thumbs.generate(photoId, photo.filePath, size)
      }
      return withCors(await net.fetch(pathToFileURL(cached).toString()))
    } catch (err) {
      console.error(`Error in thumb protocol handler: ${request.url}`, err)
      return new Response('Internal Error', { status: 500 })
    }
  })

  // 注册 rawfile:// 协议：加载入库素材原文件（字体 FontFace 预览等渲染层消费场景）
  protocol.handle('rawfile', async (request) => {
    try {
      const filePath = resolveAssetPath(
        decodeProtocolPath(request.url.replace(/^rawfile:\/\//, ''))
      )
      if (!filePath) {
        return new Response('Not Found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.error(`Error in rawfile protocol handler: ${request.url}`, err)
      return new Response('Internal Error', { status: 500 })
    }
  })

  // 注册 video:// 协议（用于加载本地视频文件）
  protocol.handle('video', async (request) => {
    try {
      const url = request.url.replace(/^video:\/\//, '')
      const filePath = resolveAssetPath(decodeProtocolPath(url))

      if (!filePath) {
        console.error(`Video file not an asset: ${request.url}`)
        return new Response('Not Found', { status: 404 })
      }

      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.error('Error handling video protocol:', err)
      return new Response('Internal Error', { status: 500 })
    }
  })

  // 注册 pdfres:// 协议：pdfjs 辅助资源（pdfres://<kind>/<filename>）。
  // 渲染端 PDF 预览的 cMapUrl/standardFontDataUrl/wasmUrl 都指向这里——
  // pdfjs 只按「URL + 文件名」拼接后 fetch，本地路径在 Chromium 里不可 fetch。
  protocol.handle('pdfres', async (request) => {
    try {
      const raw = request.url.replace(/^pdfres:\/\//, '')
      const slashIdx = raw.indexOf('/')
      if (slashIdx <= 0) return new Response('Bad Request', { status: 400 })
      const kind = raw.slice(0, slashIdx)
      const name = raw.slice(slashIdx + 1)
      // kind 白名单 + 文件名字符白名单（pdfjs 资源名均为 [A-Za-z0-9._-]），
      // 双保险杜绝 ../ 穿越读取任意文件
      if (!PDFJS_RESOURCE_KINDS.has(kind) || !/^[A-Za-z0-9._-]+$/.test(name)) {
        return new Response('Bad Request', { status: 400 })
      }
      const root = getPdfjsDistRoot()
      if (!root) return new Response('Not Found', { status: 404 })
      const buf = await fsp.readFile(join(root, kind, name))
      return new Response(buf, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' }
      })
    } catch (err) {
      console.error(`Error in pdfres protocol handler: ${request.url}`, err)
      return new Response('Not Found', { status: 404 })
    }
  })
}
