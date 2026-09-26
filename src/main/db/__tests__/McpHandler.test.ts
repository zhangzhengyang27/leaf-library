import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { AlbumRepository } from '../repos/AlbumRepository'
import { handleMcpJsonRpc, type McpContext } from '../../services/McpHandler'

/**
 * MCP 接入点单测（纯 JSON-RPC 分发，不依赖 HTTP/Electron）。
 * 阶段 5.2 起含可写工具：create_album / add_tags / import_paths / add_bookmark。
 */

function rpc(id: number | string, method: string, params?: Record<string, unknown>) {
  return { jsonrpc: '2.0', id, method, params }
}

describe('McpHandler', () => {
  let db: Database.Database
  let repo: PhotoRepository
  let albums: AlbumRepository
  let ctx: McpContext
  let resolveImage: Mock<[photoId: string, size: 'thumb' | 'original'], Promise<string | null>>
  const enqueued: string[] = []
  const addBookmark = vi.fn()

  beforeEach(() => {
    db = createTestDb()
    repo = new PhotoRepository(db)
    albums = new AlbumRepository(db)
    enqueued.length = 0
    addBookmark.mockReset()
    addBookmark.mockImplementation(async (url: string, _title?: string) =>
      repo.addPhoto(`/tmp/bookmark-${Date.now()}.png`, {
        kind: 'bookmark',
        source: 'bookmark',
        sourceUrl: url
      })
    )
    resolveImage = vi.fn(
      async (_photoId: string, _size: 'thumb' | 'original'): Promise<string | null> => null
    )
    ctx = { photos: repo, albums, addBookmark, enqueue: (id) => enqueued.push(id), resolveImage }
  })

  afterEach(() => {
    closeTestDb(db)
  })

  function seed(): string {
    const photo = repo.addPhoto('/tmp/a.png', { kind: 'image' })
    const video = repo.addPhoto('/tmp/meeting-recording.mp4', { kind: 'video' })
    return `${photo.id},${video.id}`
  }

  it('initialize 返回协议版本与工具能力', async () => {
    const res = await handleMcpJsonRpc(rpc(1, 'initialize', {}), ctx)
    expect(res.status).toBe(200)
    const result = res.body!.result as Record<string, unknown>
    expect(result.protocolVersion).toBe('2025-06-18')
    expect(result.serverInfo).toMatchObject({ name: 'leaf-photos-mcp' })
  })

  it('notifications/initialized 为通知：body=null 且 202', async () => {
    const res = await handleMcpJsonRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)
    expect(res.status).toBe(202)
    expect(res.body).toBeNull()
  })

  it('tools/list 列出 8 个工具（4 只读 + 4 可写）', async () => {
    const res = await handleMcpJsonRpc(rpc(2, 'tools/list'), ctx)
    const tools = (res.body!.result as { tools: Array<{ name: string }> }).tools
    expect(tools.map((t) => t.name)).toEqual([
      'leaf_photos_search',
      'leaf_photo_detail',
      'leaf_library_stats',
      'leaf_get_image',
      'leaf_create_album',
      'leaf_add_tags',
      'leaf_import_paths',
      'leaf_add_bookmark'
    ])
  })

  it('tools/call search：keyword + kind 过滤', async () => {
    const [imgId, videoId] = seed().split(',')
    const res = await handleMcpJsonRpc(
      rpc(3, 'tools/call', {
        name: 'leaf_photos_search',
        arguments: { keyword: 'meeting', kind: 'video' }
      }),
      ctx
    )
    const result = res.body!.result as { content: Array<{ text: string }> }
    const data = JSON.parse(result.content[0].text) as { items: Array<{ id: string }> }
    expect(data.items).toHaveLength(1)
    expect(data.items[0].id).toBe(videoId)
    expect(data.items[0].id).not.toBe(imgId)
  })

  it('tools/call detail：完整元数据；未知 id 报 not found', async () => {
    const [imgId] = seed().split(',')
    const res = await handleMcpJsonRpc(
      rpc(4, 'tools/call', { name: 'leaf_photo_detail', arguments: { id: imgId } }),
      ctx
    )
    const result = res.body!.result as { content: Array<{ text: string }> }
    const data = JSON.parse(result.content[0].text) as Record<string, unknown>
    expect(data.filePath).toBe('/tmp/a.png')

    const res2 = await handleMcpJsonRpc(
      rpc(5, 'tools/call', { name: 'leaf_photo_detail', arguments: { id: 'nope' } }),
      ctx
    )
    const result2 = res2.body!.result as { content: Array<{ text: string }> }
    expect(JSON.parse(result2.content[0].text)).toEqual({ error: 'not found' })
  })

  it('tools/call stats：按类型统计', async () => {
    seed()
    const res = await handleMcpJsonRpc(rpc(6, 'tools/call', { name: 'leaf_library_stats' }), ctx)
    const result = res.body!.result as { content: Array<{ text: string }> }
    const data = JSON.parse(result.content[0].text) as {
      byKind: Record<string, number>
      total: number
    }
    expect(data.total).toBe(2)
    expect(data.byKind).toMatchObject({ image: 1, video: 1 })
  })

  it('leaf_get_image original：返回 image content（base64 解回 PNG 魔数，mimeType 按扩展名）', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'leaf-mcp-img-'))
    const pngPath = join(tmp, 'pic.png')
    // 只关心魔数与管道：8 字节 PNG 签名 + 任意尾部
    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('rest')
    ])
    writeFileSync(pngPath, pngBytes)
    const photo = repo.addPhoto(pngPath, { kind: 'image' })
    resolveImage.mockResolvedValue(pngPath)

    const res = await handleMcpJsonRpc(
      rpc(11, 'tools/call', {
        name: 'leaf_get_image',
        arguments: { id: photo.id, size: 'original' }
      }),
      ctx
    )
    const result = res.body!.result as {
      content: Array<{ type: string; data: string; mimeType: string }>
    }
    expect(result.content[0].type).toBe('image')
    expect(result.content[0].mimeType).toBe('image/png')
    const decoded = Buffer.from(result.content[0].data, 'base64')
    expect(decoded.subarray(0, 4)).toEqual(pngBytes.subarray(0, 4))
    expect(resolveImage).toHaveBeenCalledWith(photo.id, 'original')
    rmSync(tmp, { recursive: true, force: true })
  })

  it('leaf_get_image 缺省 size=thumb：mimeType 固定 image/jpeg（缩略图恒为落盘 jpg）', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'leaf-mcp-img-'))
    const thumbPath = join(tmp, '256.jpg')
    writeFileSync(thumbPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
    const photo = repo.addPhoto(join(tmp, 'pic.png'), { kind: 'image' })
    resolveImage.mockResolvedValue(thumbPath)

    const res = await handleMcpJsonRpc(
      rpc(12, 'tools/call', { name: 'leaf_get_image', arguments: { id: photo.id } }),
      ctx
    )
    const result = res.body!.result as {
      content: Array<{ type: string; data: string; mimeType: string }>
    }
    expect(result.content[0].mimeType).toBe('image/jpeg')
    expect(resolveImage).toHaveBeenCalledWith(photo.id, 'thumb')
    rmSync(tmp, { recursive: true, force: true })
  })

  it('leaf_get_image：素材不存在 / id 形状非法 / 非位图 original 均 isError', async () => {
    // 合法 uuid 但库里没有
    const missing = await handleMcpJsonRpc(
      rpc(13, 'tools/call', {
        name: 'leaf_get_image',
        arguments: { id: '00000000-0000-4000-8000-000000000000' }
      }),
      ctx
    )
    expect((missing.body!.result as { isError: boolean }).isError).toBe(true)

    // 形状不是 uuid：连 SQL 都不落
    const badShape = await handleMcpJsonRpc(
      rpc(14, 'tools/call', { name: 'leaf_get_image', arguments: { id: '../../etc/passwd' } }),
      ctx
    )
    expect((badShape.body!.result as { isError: boolean }).isError).toBe(true)
    expect(resolveImage).not.toHaveBeenCalled()

    // 非位图（.mp4）请求 original：明确报错而不是把字节当图回
    const video = repo.addPhoto('/tmp/meeting-recording.mp4', { kind: 'video' })
    resolveImage.mockResolvedValue('/tmp/meeting-recording.mp4')
    const notImage = await handleMcpJsonRpc(
      rpc(15, 'tools/call', {
        name: 'leaf_get_image',
        arguments: { id: video.id, size: 'original' }
      }),
      ctx
    )
    const result = notImage.body!.result as { isError: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not an image asset')
  })

  it('可写 create_album：新建相册并返回 id', async () => {
    const res = await handleMcpJsonRpc(
      rpc(7, 'tools/call', { name: 'leaf_create_album', arguments: { name: '项目截图' } }),
      ctx
    )
    const result = res.body!.result as { content: Array<{ text: string }> }
    const data = JSON.parse(result.content[0].text) as { id: string; name: string }
    expect(data.name).toBe('项目截图')
    expect(albums.list().some((a) => a.id === data.id)).toBe(true)
  })

  it('可写 add_tags：批量加标签（同名去重由仓储保证）', async () => {
    const [imgId, videoId] = seed().split(',')
    const res = await handleMcpJsonRpc(
      rpc(8, 'tools/call', {
        name: 'leaf_add_tags',
        arguments: { ids: [imgId, videoId], tags: ['待办', '评审'] }
      }),
      ctx
    )
    const result = res.body!.result as { content: Array<{ text: string }> }
    const data = JSON.parse(result.content[0].text) as { applied: number }
    expect(data.applied).toBe(4)
    const updated = repo.getPhotoById(imgId)!
    expect(updated.tags).toEqual(expect.arrayContaining(['待办', '评审']))
  })

  it('可写 import_paths：入库新文件并触发后台处理', async () => {
    // 代码审查 P1：import_paths 现在要求绝对路径且文件真实存在（防灌库/读任意路径）
    const tmp = mkdtempSync(join(tmpdir(), 'leaf-mcp-'))
    const p1 = join(tmp, 'new-photo.png')
    const p2 = join(tmp, 'another.jpg')
    writeFileSync(p1, 'fake')
    writeFileSync(p2, 'fake')
    const res = await handleMcpJsonRpc(
      rpc(9, 'tools/call', {
        name: 'leaf_import_paths',
        arguments: { paths: [p1, p2, '/no/such/file.png'] }
      }),
      ctx
    )
    const result = res.body!.result as { content: Array<{ text: string }> }
    const data = JSON.parse(result.content[0].text) as {
      added: number
      skipped: number
      items: Array<{ id: string }>
    }
    expect(data.added).toBe(2)
    expect(data.skipped).toBe(1) // 不存在的路径被跳过
    expect(data.items).toHaveLength(2)
    expect(enqueued).toEqual(expect.arrayContaining(data.items.map((i) => i.id)))
    rmSync(tmp, { recursive: true, force: true })
  })

  it('可写 add_bookmark：调用 BookmarkService 并返回书签素材', async () => {
    const res = await handleMcpJsonRpc(
      rpc(10, 'tools/call', {
        name: 'leaf_add_bookmark',
        arguments: { url: 'https://example.com/leaf', title: 'Leaf 官网' }
      }),
      ctx
    )
    const result = res.body!.result as { content: Array<{ text: string }> }
    const data = JSON.parse(result.content[0].text) as { id: string; sourceUrl: string }
    expect(data.sourceUrl).toBe('https://example.com/leaf')
    expect(addBookmark).toHaveBeenCalledWith('https://example.com/leaf', 'Leaf 官网')
    expect(repo.getPhotoById(data.id)?.kind).toBe('bookmark')
  })

  it('未知工具 → -32602；未知方法 → -32601', async () => {
    const badTool = await handleMcpJsonRpc(rpc(11, 'tools/call', { name: 'nope' }), ctx)
    expect((badTool.body!.error as { code: number }).code).toBe(-32602)
    const badMethod = await handleMcpJsonRpc(rpc(12, 'resources/list'), ctx)
    expect((badMethod.body!.error as { code: number }).code).toBe(-32601)
  })
})
