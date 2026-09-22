import { protocol, net } from 'electron'
import { createReadStream, existsSync, rmSync } from 'fs'
import { promises as fsp } from 'fs'
import { Readable } from 'stream'
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
    for (const candidate of macOsAliasForms(rawPath)) {
      const photo = photoRepository.getPhotoByPathIncludingDeleted(candidate)
      // 命中后回库里那条路径：DB 写的是哪种别名，读文件就用哪种
      if (photo && existsSync(photo.filePath)) return photo.filePath
    }
    return null
  } catch {
    return null
  }
}

/**
 * macOS 上 `/var`、`/etc`、`/tmp` 是 `/private` 下的软链，而媒体元素取流时
 * Chromium 会把 `video:///var/...` 归一化成 `video:///private/var/...` 再发请求
 * （实测：`img.getAttribute('src')` 是 /var，`el.src` 读回来已经是 /private/var）。
 * 主进程按精确路径查库 → 查不到 → 404 → `<audio>` 报 MediaError 4「无可用源」，
 * 用户侧就是"音频打不开"，而素材明明在库里。两种写法都认，仍然只认已入库路径。
 */
function macOsAliasForms(rawPath: string): string[] {
  if (process.platform !== 'darwin') return [rawPath]
  const stripped = rawPath.replace(/^\/private\/(?=(?:var|etc|tmp)\/)/, '/')
  if (stripped !== rawPath) return [rawPath, stripped]
  if (/^\/(?:var|etc|tmp)\//.test(rawPath)) return [rawPath, `/private${rawPath}`]
  return [rawPath]
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
  // video 此前只靠 <video src> 加载（不需要 scheme 特权）；与 connect-src 同口径注册后
  // 才可 fetch——为「抓帧/海报图取像素」这类后续消费留口，不改变现有播放路径
  { scheme: 'video', privileges: { supportFetchAPI: true, stream: true } },
  // pdfres 辅助资源（CJK cmap/标准字体/wasm 解码器）：渲染端 pdfjs 走 fetch 加载，
  // 本地路径会被拦，注册成 privileged 协议后 cMapUrl 直接用 pdfres://<kind>/
  { scheme: 'pdfres', privileges: { supportFetchAPI: true } }
])

/** 响应透传 + CORS 头（插件沙箱跨源读取缩略图/原图用；协议本身仍校验入库素材） */
function withCors(resp: Response): Response {
  const headers = new Headers(resp.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers })
}

/**
 * 扩展名 → MIME 的权威表（媒体类）。
 *
 * 为什么不能只靠下面那次 sniff：媒体元素收不收这个源，看的就是响应的 content-type。
 * 同一份字节实测三种结果——`audio/mpeg` 能播、`application/octet-stream` 与「干脆没有
 * 这个头」都直接 MediaError 4「无可用源」；而结果原先由 Chromium 的 file:// 处理器顺手
 * sniff 决定，**同一进程内一致、跨进程随机**（用户侧就是"音频有时放不出来"）。
 * 已知类型不再问 OS。
 */
const MEDIA_MIME: Record<string, string> = {
  // 音频（@shared/assetTypes 的 AUDIO_EXTENSIONS）
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  // .m4a 必须 audio/x-m4a：同一份字节标 audio/mp4 时 <audio> 判「无可用源」（实测）
  '.m4a': 'audio/x-m4a',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  // 视频（PLAYABLE_VIDEO_EXTENSIONS + 只转码的那批）
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.3gp': 'video/3gpp',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.f4v': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.m2ts': 'video/mp2t',
  '.hevc': 'video/hevc',
  '.h265': 'video/hevc'
}

/** 表里没有的扩展名：向 Chromium 的 file:// 处理器问一次（bytes=0-0） */
const mimeByExt = new Map<string, string>()
async function sniffFileType(filePath: string): Promise<string> {
  const ext = (filePath.match(/\.[^.]*$/)?.[0] ?? '').toLowerCase()
  const fixed = MEDIA_MIME[ext]
  if (fixed) return fixed
  const hit = mimeByExt.get(ext)
  if (hit) return hit
  try {
    const probe = await net.fetch(pathToFileURL(filePath).toString(), {
      headers: { range: 'bytes=0-0' }
    })
    const type = probe.headers.get('content-type')
    await probe.body?.cancel()
    // octet-stream 不入库：那等于"没问出来"，缓存它会把这条路径永久钉死在放不出来
    if (type && type !== 'application/octet-stream') {
      mimeByExt.set(ext, type)
      return type
    }
  } catch {
    /* 回落 octet-stream */
  }
  return 'application/octet-stream'
}

/**
 * 本地文件的 Range 响应（video:// 用，代码审查二轮）。
 *
 * 不能只是把 Range 头转给 net.fetch：实测 Chromium 的 file:// 处理器会按区间
 * 切片却仍回 200、不给 Content-Range/Accept-Ranges，媒体元素据此误判整文件长度，
 * 拖动进度条退化为重新拉全文件。这里自己出 206 + Content-Range，正文用
 * createReadStream 的区间流（不把整个视频读进内存）。
 */
async function serveFileWithRange(filePath: string, request: Request): Promise<Response> {
  const { size } = await fsp.stat(filePath)
  const raw = request.headers.get('range')?.trim() ?? ''
  /**
   * 正文一律自己开文件流，不把 net.fetch(file://) 的 body 转手出去。
   *
   * `<audio>` 首发是不带 Range 的裸 GET：实测同一个 .mp3，`fetch()` 拿到的 96,801
   * 字节喂成 blob 能播，而 `<audio src="video://…">` 直接 MediaError 4「无可用源」；
   * `<video>` 走 206 分支（自己 createReadStream）却一直正常。转手流与手写的
   * content-length 一旦对不齐，媒体栈就当容器坏了。
   */
  const fileResponse = (start: number, end: number, status: 200 | 206, contentType: string) => {
    const headers = new Headers({
      'accept-ranges': 'bytes',
      'content-length': String(end - start + 1),
      'content-type': contentType
    })
    if (status === 206) headers.set('content-range', `bytes ${start}-${end}/${size}`)
    return new Response(
      Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream,
      { status, headers }
    )
  }
  if (!raw) {
    // 整文件响应也必须带 MIME：缺 content-type 时 Chromium 直接判 Format error
    return fileResponse(0, size - 1, 200, await sniffFileType(filePath))
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(raw)
  if (!m || (m[1] === '' && m[2] === '')) {
    // 多区间/异常语法（媒体元素极少发）：不报错，退回整文件
    return fileResponse(0, size - 1, 200, await sniffFileType(filePath))
  }
  let start: number
  let end: number
  if (m[1] === '') {
    // 后缀区间 bytes=-N（最后 N 字节）——非 faststart 的 mp4/m4a 靠它读尾部 moov
    end = size - 1
    start = Math.max(0, size - Number(m[2]))
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { 'content-range': `bytes */${size}` }
    })
  }
  return fileResponse(start, end, 206, await sniffFileType(filePath))
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

      return serveFileWithRange(filePath, request)
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
