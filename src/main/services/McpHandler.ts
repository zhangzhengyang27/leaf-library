import { existsSync, statSync, promises as fsp } from 'fs'
import { isAbsolute } from 'path'
import { isAnnotationIdLike } from '@shared/annotations'
import { extensionOf, IMAGE_EXTENSIONS, RASTER_EXTENSIONS } from '@shared/assetTypes'
import type { PhotoRepository, Photo } from '../db/repos/PhotoRepository'

/** 代码审查 P1：单次 MCP 导入上限（防 token 泄漏后被拿去批量灌库） */
const MAX_IMPORT_PATHS = 200

/**
 * leaf_get_image 的原图字节上限（D-023 安全边界的一部分）：base64 后体积 ×4/3，
 * 再大就会撑爆 MCP 消息与 Agent 上下文；超限返回明确错误提示改用 thumb。
 * 缩略图是 256px 的 JPEG（几十 KB 量级），不设限。
 */
const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024

/**
 * original 的扩展名 → MIME。缩略图永远是 ThumbnailService 落盘的 .jpg，
 * 不走这张表；映射不到的位图扩展（heic/tiff 等）按 image/png 兜底——
 * 客户端渲染不了时会自己报错，而 thumb 档永远可看。
 */
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff'
}

/**
 * McpHandler — Model Context Protocol 接入点（六期基建 + 阶段 5.2 可写扩展）。
 *
 * 让 Claude 等 Agent 通过 MCP 检索/写入素材库。传输为 Streamable HTTP 的
 * 「POST + JSON 单响应」模式（无 SSE 流），挂在 ClipServer 的 /mcp 路由上，
 * 复用其 x-leaf-token 鉴权（Agent 配置方式与浏览器插件一致）。
 *
 * 实现为纯 JSON-RPC 分发函数（不碰 http 对象），可脱离 Electron 单测。
 * 协议版本 2025-06-18；未支持的方法按规范回 -32601。
 * 可写能力（D-014 阶段 5.2）：add_tags / import_paths / add_bookmark，
 * 均通过注入的 McpContext 访问仓储与服务（与 AI 能力解耦，不依赖本地模型）。
 * 图片内容暴露（AI 看图工作流 M1）：get_image 返回 MCP image content，
 * 缩略图/原图的磁盘解析经 McpContext.resolveImage 注入（实现挂 ClipServer，
 * 照 thumb:// 协议同语义），本文件保持不依赖 Electron。
 */

export interface McpRpcResult {
  status: number
  /** null = 通知（不回包，HTTP 层回 202） */
  body: Record<string, unknown> | null
}

/** 可写工具依赖注入（ClipServer 组装；测试可注入 mock） */
export interface McpContext {
  photos: PhotoRepository
  addBookmark: (url: string, title?: string) => Promise<Photo>
  enqueue: (photoId: string) => void
  /**
   * 按 id 解析图片文件的磁盘路径（get_image 专用；ClipServer 注入真实实现）。
   * - 'thumb'：缩略图缓存（未命中现场生成，照 thumb:// 协议「按需生成保证永不缺图」语义）
   * - 'original'：库里登记的原文件路径——客户端只传 id，绝不接受外部传来的任意路径
   * 素材不存在 / 文件已丢失时回 null，由工具侧转成 isError。
   */
  resolveImage: (photoId: string, size: 'thumb' | 'original') => Promise<string | null>
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run: (args: Record<string, unknown>, ctx: McpContext) => unknown | Promise<unknown>
  /**
   * true = run 的返回值本身就是 MCP content 数组（get_image 的 image content
   * 不能被 JSON.stringify 包成 text）；缺省按既有工具包成 [{ type:'text', ... }]。
   */
  returnsContent?: boolean
}

function photoSummary(p: Photo): Record<string, unknown> {
  return {
    id: p.id,
    fileName: p.fileName,
    kind: p.kind,
    fileSize: p.fileSize,
    width: p.width ?? null,
    height: p.height ?? null,
    durationMs: p.durationMs ?? null,
    rating: p.rating,
    isFavorite: p.isFavorite,
    tags: p.tags,
    description: p.description ?? null,
    sourceUrl: p.sourceUrl ?? null,
    takenAt: p.takenAt ?? null,
    importedAt: p.importedAt
  }
}

const TOOLS: ToolDef[] = [
  {
    name: 'leaf_photos_search',
    description: '检索 Leaf 素材库（文件名/描述关键词 + 素材类型过滤）。返回摘要列表。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '文件名/描述关键词，可空' },
        kind: {
          type: 'string',
          enum: ['image', 'video', 'audio', 'font', 'file', 'bookmark'],
          description: '按素材类型过滤，可空'
        },
        limit: { type: 'number', description: '返回条数上限，默认 20，最大 100' }
      }
    },
    run: (args, ctx) => {
      const keyword = typeof args.keyword === 'string' ? args.keyword : ''
      const kind = typeof args.kind === 'string' ? args.kind : ''
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100)
      let list: Photo[] = keyword ? ctx.photos.searchPhotos(keyword) : ctx.photos.getPhotos()
      if (kind) list = list.filter((p) => p.kind === kind)
      return {
        total: list.length,
        items: list.slice(0, limit).map(photoSummary)
      }
    }
  },
  {
    name: 'leaf_photo_detail',
    description: '按 id 取单个素材的完整元数据（含 EXIF/GPS/来源 URL）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '素材 id' } },
      required: ['id']
    },
    run: (args, ctx) => {
      const p = ctx.photos.getPhotoById(String(args.id ?? ''))
      if (!p) return { error: 'not found' }
      return {
        ...photoSummary(p),
        filePath: p.filePath,
        cameraModel: p.cameraModel ?? null,
        lensModel: p.lensModel ?? null,
        iso: p.iso ?? null,
        aperture: p.aperture ?? null,
        shutter: p.shutter ?? null,
        focalLength: p.focalLength ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        phash: p.phash ?? null,
        colorDominant: p.colorDominant ?? null
      }
    }
  },
  {
    name: 'leaf_library_stats',
    description: '素材库统计：各类型数量、收藏数、库内最早/最晚导入时间。',
    inputSchema: { type: 'object', properties: {} },
    // 审查改 SQL 聚合：全量 getPhotos 在大库只为计数太重
    run: (_args, ctx) => ctx.photos.getLibraryStats()
  },
  {
    name: 'leaf_get_image',
    // AI 看图工作流 M1：把图片内容真正暴露给 MCP 客户端——没有这一步，
    // 无文字信号的图片对 Agent 就是黑盒，打标只能瞎猜（同 D-017 的理由）。
    returnsContent: true,
    description:
      '按 id 返回素材图片内容（MCP image content，base64）。看图打标工作流：' +
      '先 leaf_photos_search 检索 → 用本工具看图 → leaf_add_tags 写回标签。' +
      'size=thumb 返回缩略图（默认，快且小）；size=original 返回库内原文件（仅位图，≤8MB，超限请用 thumb）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '素材 id' },
        size: {
          type: 'string',
          enum: ['thumb', 'original'],
          description: 'thumb=缩略图（默认）；original=原文件'
        }
      },
      required: ['id']
    },
    run: async (args, ctx) => {
      // id 先过 uuid 形状校验（与标注链 isAnnotationIdLike 同款守卫）：
      // 库里都是 uuid，形状不对的东西没有别的含义，也不必落一次 SQL
      const rawId: unknown = args.id
      if (!isAnnotationIdLike(rawId)) throw new Error(`invalid id: ${String(rawId).slice(0, 64)}`)
      const id: string = rawId
      const size = args.size == null ? 'thumb' : String(args.size)
      if (size !== 'thumb' && size !== 'original') {
        throw new Error(`invalid size: ${size.slice(0, 32)} (expected 'thumb' | 'original')`)
      }
      const photo = ctx.photos.getPhotoById(id)
      if (!photo) throw new Error(`not found: ${id}`)
      // original 只给位图（kindOfExt 判 image 的那两组扩展名）：把 mp3/ttf 的字节
      // 当图片回给 Agent 没有意义。thumb 不设这道门——视频封面/PDF 首页的缩略图同样可看。
      const ext = extensionOf(photo.fileName)
      if (
        size === 'original' &&
        !IMAGE_EXTENSIONS.includes(ext) &&
        !RASTER_EXTENSIONS.includes(ext)
      ) {
        throw new Error(
          `not an image asset: ${photo.fileName} (original serves bitmaps only; use size=thumb for the cover)`
        )
      }
      const path = await ctx.resolveImage(id, size)
      if (!path) throw new Error(`file missing or unreadable: ${photo.filePath}`)
      if (size === 'original') {
        // 读前 stat 卡字节上限（超限回明确错误而不是把消息撑爆）
        const bytes = statSync(path).size
        if (bytes > MAX_ORIGINAL_BYTES) {
          throw new Error(
            `original too large: ${bytes} bytes (limit ${MAX_ORIGINAL_BYTES}); use size=thumb`
          )
        }
      }
      const buf = await fsp.readFile(path)
      // thumb 是 ThumbnailService 落盘的 .jpg；original 按扩展名映射，兜底 image/png
      const mimeType = size === 'thumb' ? 'image/jpeg' : (IMAGE_MIME_BY_EXT[ext] ?? 'image/png')
      return [{ type: 'image', data: buf.toString('base64'), mimeType }]
    }
  },
  // —— 阶段 5.2 可写工具 ——
  {
    name: 'leaf_add_tags',
    description: '给一个或多个素材添加标签（同名标签自动复用）。返回实际添加的条目数。',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: '素材 id 列表'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '要添加的标签名列表'
        }
      },
      required: ['ids', 'tags']
    },
    run: (args, ctx) => {
      const ids = Array.isArray(args.ids) ? args.ids.map(String) : []
      const tags = Array.isArray(args.tags)
        ? args.tags
            .map(String)
            .map((t) => t.trim())
            .filter(Boolean)
        : []
      let applied = 0
      for (const id of ids) {
        for (const tag of tags) {
          if (ctx.photos.addTag(id, tag)) applied += 1
        }
      }
      return { applied, ids: ids.length, tags: tags.length }
    }
  },
  {
    name: 'leaf_import_paths',
    description: '导入本地文件路径到素材库（按路径去重，缩略图/EXIF 后台处理）。返回新入库素材。',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: '要导入的本地文件绝对路径列表'
        }
      },
      required: ['paths']
    },
    run: (args, ctx) => {
      const raw = Array.isArray(args.paths)
        ? args.paths
            .map(String)
            .map((p) => p.trim())
            .filter(Boolean)
            .slice(0, MAX_IMPORT_PATHS)
        : []
      // 代码审查 P1：仅接受「绝对路径 + 存在」的路径，拒绝相对路径/不存在项
      const paths = raw.filter((p) => isAbsolute(p) && existsSync(p) && statSync(p).isFile())
      const added = ctx.photos.addPhotos(paths)
      for (const p of added) ctx.enqueue(p.id)
      return {
        added: added.length,
        skipped: raw.length - paths.length,
        items: added.map(photoSummary)
      }
    }
  },
  {
    name: 'leaf_add_bookmark',
    description: '添加书签素材（抓取页面标题 + 截图存档，异步生成缩略图）。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '书签 URL（http/https）' },
        title: { type: 'string', description: '可选标题，缺省抓取页面 og:title' }
      },
      required: ['url']
    },
    run: async (args, ctx) => {
      const url = String(args.url ?? '')
      const title = typeof args.title === 'string' ? args.title : undefined
      const p = await ctx.addBookmark(url, title)
      return { id: p.id, fileName: p.fileName, sourceUrl: p.sourceUrl ?? null }
    }
  }
]

const SERVER_INFO = { name: 'leaf-photos-mcp', version: '1.0.0' }

/** 处理一条 JSON-RPC 请求；body 解析失败由 HTTP 层兜底 */
export async function handleMcpJsonRpc(
  body: Record<string, unknown>,
  ctx: McpContext
): Promise<McpRpcResult> {
  const method = String(body.method ?? '')
  const id = body.id as string | number | null | undefined

  // 通知（无 id）：不回包
  if (id === undefined || id === null) {
    if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
      return { status: 202, body: null }
    }
    return {
      status: 200,
      body: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
    }
  }

  const ok = (result: Record<string, unknown>): McpRpcResult => ({
    status: 200,
    body: { jsonrpc: '2.0', id, result }
  })
  const err = (code: number, message: string): McpRpcResult => ({
    status: 200,
    body: { jsonrpc: '2.0', id, error: { code, message } }
  })

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      })
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      })
    case 'tools/call': {
      const params = (body.params ?? {}) as Record<string, unknown>
      const name = String(params.name ?? '')
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) return err(-32602, `Unknown tool: ${name}`)
      try {
        const result = await tool.run((params.arguments ?? {}) as Record<string, unknown>, ctx)
        // get_image 等工具的返回值已是 MCP content 数组（image content 不能包成 text）
        const content = tool.returnsContent
          ? (result as unknown[])
          : [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        return ok({ content })
      } catch (e) {
        return ok({
          isError: true,
          content: [{ type: 'text', text: (e as Error).message }]
        })
      }
    }
    default:
      return err(-32601, `Method not found: ${method}`)
  }
}
