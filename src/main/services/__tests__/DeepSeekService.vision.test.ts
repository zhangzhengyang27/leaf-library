import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { app } from 'electron'
import {
  VISION_MAX_BYTES,
  VISION_MAX_EDGE,
  VISION_PROBE_PNG_BASE64,
  batchVisionMeta,
  getConfig,
  isVisionConfigured,
  resolveVisionEndpoint,
  setApiKey,
  setVisionConfig,
  suggestVisionMeta,
  testVisionConnection,
  toVisionJpeg,
  type BatchMetaProgress,
  type BatchMetaResult,
  type ChatResult
} from '../DeepSeekService'

/**
 * M3 看图工作流 · 视觉打标链（DeepSeekService 的 OpenAI 兼容视觉路径）。
 *
 * 主进程侧单测，外部依赖全部 mock：
 * - electron：app.getPath 指向一次性目录（deepseek.json 落那里），safeStorage 用可逆桩
 * - photoRepository / tagRepository：内存桩，不碰 SQLite
 * - ThumbnailService：getCachedPath 直接回夹具 jpg（视觉输入只来自缩略图缓存）
 * - fetch：截获请求体，断言 OpenAI 兼容 content 数组形状与图片压缩上限
 */

// ── electron mock：userData 指向一次性目录（把目录挂到 globalThis 供 afterAll 清理）──
vi.mock('electron', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'leaf-vision-cfg-'))
  ;(globalThis as { __leafVisionCfgDir?: string }).__leafVisionCfgDir = dir
  return {
    app: { getPath: (name: string) => (name === 'userData' ? dir : join(dir, name)) },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf-8'),
      decryptString: (b: Buffer) => {
        const s = b.toString('utf-8')
        if (!s.startsWith('enc:')) throw new Error('密文解不开')
        return s.slice(4)
      }
    }
  }
})

// ── 仓库桩：不碰 SQLite ──
const repos = vi.hoisted(() => ({
  photoRepository: {
    getPhotoById: vi.fn(),
    setDescription: vi.fn(),
    addTagToPhotos: vi.fn()
  },
  tagRepository: { all: vi.fn(() => []) }
}))
vi.mock('../../db/repos/PhotoRepository', () => ({ photoRepository: repos.photoRepository }))
vi.mock('../../db/repos/TagRepository', () => ({ tagRepository: repos.tagRepository }))

// ── 缩略图桩：视觉输入只来自这里 ──
const thumbs = vi.hoisted(() => ({
  getCachedPath: vi.fn(),
  generate: vi.fn()
}))
vi.mock('../ThumbnailService', () => ({ getThumbnailService: () => thumbs }))

// ── 被测对象 ──

interface RepoPhoto {
  id: string
  kind: 'image' | 'video' | 'audio' | 'font' | 'text' | 'file' | 'bookmark'
  fileName: string
  filePath: string
  tags: string[]
  description?: string
  width?: number
  height?: number
  takenAt?: number
}

function makePhoto(over: Partial<RepoPhoto> & { id: string }): RepoPhoto {
  return {
    kind: 'image',
    fileName: `${over.id}.jpg`,
    filePath: `/tmp/${over.id}.jpg`,
    tags: [],
    width: 4000,
    height: 3000,
    ...over
  }
}

interface FetchLikeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
}

function chatResponse(
  content: string,
  usage?: { prompt_tokens: number; completion_tokens: number }
): FetchLikeResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }], usage }),
    text: async () => ''
  }
}

const SUGGEST_JSON = '```json\n{"description":"一只橘猫趴在窗台","tags":["猫","橘猫","窗台"]}\n```'

const cfgDir = (): string => join(app.getPath('userData'), 'deepseek.json')

/** 配齐视觉档：主 Key + 模型名 + 开关（默认不覆盖端点）。返回 false 会让断言立刻翻红 */
function configureVisionSync(endpoint = ''): boolean {
  return (
    setApiKey('sk-vision-test-key-12345678').ok &&
    setVisionConfig({ model: 'deepseek-vl2', endpoint, enabled: true }).ok
  )
}

/** 异步测试里的便捷版本 */
async function configureVision(endpoint = ''): Promise<void> {
  expect(configureVisionSync(endpoint)).toBe(true)
}

let fixturesDir = ''
let bigJpgPath = ''
let smallJpgPath = ''
let fetchMock: ReturnType<typeof vi.fn>

beforeAll(async () => {
  fixturesDir = mkdtempSync(join(tmpdir(), 'leaf-vision-fixtures-'))
  // 大图：高斯噪声让 jpeg 压不小，逼出 200KB/768px 双闸的降质量路径
  bigJpgPath = join(fixturesDir, 'big.jpg')
  await sharp({
    create: {
      width: 2000,
      height: 1500,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: 'gaussian', mean: 128, sigma: 30 }
    }
  })
    .jpeg({ quality: 95 })
    .toFile(bigJpgPath)
  // 小图：断言 withoutEnlargement 不放大
  smallJpgPath = join(fixturesDir, 'small.jpg')
  await sharp({
    create: { width: 100, height: 80, channels: 3, background: { r: 200, g: 30, b: 40 } }
  })
    .jpeg()
    .toFile(smallJpgPath)
}, 30000)

afterAll(() => {
  rmSync(fixturesDir, { recursive: true, force: true })
  rmSync((globalThis as { __leafVisionCfgDir?: string }).__leafVisionCfgDir ?? '', {
    recursive: true,
    force: true
  })
})

beforeEach(() => {
  rmSync(cfgDir(), { force: true })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  repos.photoRepository.getPhotoById.mockReset()
  repos.photoRepository.setDescription.mockReset()
  repos.photoRepository.addTagToPhotos.mockReset()
  thumbs.getCachedPath.mockReset()
  thumbs.generate.mockReset()
  thumbs.getCachedPath.mockReturnValue(smallJpgPath)
  thumbs.generate.mockResolvedValue(smallJpgPath)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveVisionEndpoint（端点覆盖归一）', () => {
  it('空覆盖回 DeepSeek 主端点', () => {
    expect(resolveVisionEndpoint('')).toBe('https://api.deepseek.com/chat/completions')
    expect(resolveVisionEndpoint('   ')).toBe('https://api.deepseek.com/chat/completions')
  })

  it('base URL 与完整 URL 都归一到 /chat/completions', () => {
    expect(resolveVisionEndpoint('https://api.siliconflow.cn/v1')).toBe(
      'https://api.siliconflow.cn/v1/chat/completions'
    )
    expect(resolveVisionEndpoint('https://api.siliconflow.cn/v1/')).toBe(
      'https://api.siliconflow.cn/v1/chat/completions'
    )
    expect(resolveVisionEndpoint('https://x.example/v1/chat/completions')).toBe(
      'https://x.example/v1/chat/completions'
    )
  })
})

describe('视觉配置存储与入口判定', () => {
  it('默认（未存过配置）模型名落官方 4.1 视觉档，未启用 = 未配置，入口判定 false', () => {
    expect(setApiKey('sk-vision-test-key-12345678').ok).toBe(true)
    const cfg = getConfig()
    expect(cfg.vision.model).toBe('deepseek-4.1')
    expect(cfg.vision.configured).toBe(false)
    expect(isVisionConfigured()).toBe(false)
  })

  it('模型名 + 开关 + 主 Key 三者齐了才算配置好', () => {
    // 缺 Key：即使模型名已填也不算
    expect(setVisionConfig({ model: 'deepseek-vl2', endpoint: '', enabled: true }).ok).toBe(true)
    expect(isVisionConfigured()).toBe(false)
    // 补 Key：齐了
    expect(setApiKey('sk-vision-test-key-12345678').ok).toBe(true)
    expect(isVisionConfigured()).toBe(true)
    // 关开关：入口收回
    expect(setVisionConfig({ model: 'deepseek-vl2', endpoint: '', enabled: false }).ok).toBe(true)
    expect(isVisionConfigured()).toBe(false)
    // 开关回到开，Key 还在
    expect(setVisionConfig({ model: 'deepseek-vl2', endpoint: '', enabled: true }).ok).toBe(true)
    expect(isVisionConfigured()).toBe(true)
  })

  it('校验：enabled 缺模型名拒绝、非 http(s) 端点拒绝、保存后 getConfig 回读', () => {
    expect(setApiKey('sk-vision-test-key-12345678').ok).toBe(true)
    expect(setVisionConfig({ model: '', endpoint: '', enabled: true }).ok).toBe(false)
    expect(setVisionConfig({ model: 'm', endpoint: 'ftp://x', enabled: true }).ok).toBe(false)
    expect(
      setVisionConfig({
        model: 'deepseek-vl2',
        endpoint: 'https://api.siliconflow.cn/v1',
        enabled: true
      }).ok
    ).toBe(true)
    const cfg = getConfig()
    expect(cfg.vision.model).toBe('deepseek-vl2')
    expect(cfg.vision.endpoint).toBe('https://api.siliconflow.cn/v1')
    expect(cfg.vision.enabled).toBe(true)
    expect(cfg.vision.configured).toBe(true)
  })

  it('Key 与视觉档互不覆盖：setApiKey 不清 vision，setVisionConfig 不清 Key', () => {
    expect(setApiKey('sk-vision-test-key-12345678').ok).toBe(true)
    expect(setVisionConfig({ model: 'deepseek-vl2', endpoint: '', enabled: true }).ok).toBe(true)
    expect(getConfig().vision.configured).toBe(true)
    expect(setApiKey('sk-second-key-98765432').ok).toBe(true)
    expect(getConfig().vision.model).toBe('deepseek-vl2')
    expect(getConfig().configured).toBe(true)
  })
})

describe('toVisionJpeg（视觉输入压缩双闸）', () => {
  it('2000×1500 噪声大图压到 ≤768px 且 ≤200KB', async () => {
    const out = await toVisionJpeg(bigJpgPath)
    expect(out.length).toBeLessThanOrEqual(VISION_MAX_BYTES)
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(VISION_MAX_EDGE)
  }, 30000)

  it('小图不放大（withoutEnlargement）', async () => {
    const out = await toVisionJpeg(smallJpgPath)
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(100)
    expect(meta.height).toBe(80)
  })
})

describe('suggestVisionMeta（看图打标请求）', () => {
  it('未配置视觉模型直接报错，不发请求', async () => {
    repos.photoRepository.getPhotoById.mockReturnValue(makePhoto({ id: 'img1' }))
    const r = await suggestVisionMeta('img1')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('未配置视觉模型')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('非位图（kind≠image）报错不发请求——D-017 教训：不诱导瞎猜', async () => {
    await configureVision()
    repos.photoRepository.getPhotoById.mockReturnValue(makePhoto({ id: 'vid1', kind: 'video' }))
    const r = await suggestVisionMeta('vid1')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('不是位图')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('素材不存在报错', async () => {
    await configureVision()
    repos.photoRepository.getPhotoById.mockReturnValue(undefined)
    const r = await suggestVisionMeta('ghost')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('素材不存在')
  })

  it('请求体是 OpenAI 兼容 content 数组：text + image_url，图片是 ≤200KB 的 jpeg data URL', async () => {
    await configureVision()
    repos.photoRepository.getPhotoById.mockReturnValue(makePhoto({ id: 'img1' }))
    fetchMock.mockResolvedValue(
      chatResponse(SUGGEST_JSON, { prompt_tokens: 100, completion_tokens: 10 })
    )
    const r = await suggestVisionMeta('img1')
    expect(r.ok).toBe(true)
    expect(r.description).toBe('一只橘猫趴在窗台')
    expect(r.tags).toEqual(['猫', '橘猫', '窗台'])
    expect(r.tokens).toEqual({ prompt: 100, completion: 10 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    const body = JSON.parse(init.body) as {
      model: string
      messages: Array<{ role: string; content: unknown }>
    }
    expect(body.model).toBe('deepseek-vl2')
    expect(body.messages[0].role).toBe('system')
    const content = body.messages[1].content as Array<{ type: string; image_url?: { url: string } }>
    expect(Array.isArray(content)).toBe(true)
    expect(content[0].type).toBe('text')
    expect(content[1].type).toBe('image_url')
    const dataUrl = content[1].image_url?.url ?? ''
    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
    expect(bytes.length).toBeLessThanOrEqual(VISION_MAX_BYTES)
    const imgMeta = await sharp(bytes).metadata()
    expect(Math.max(imgMeta.width ?? 0, imgMeta.height ?? 0)).toBeLessThanOrEqual(VISION_MAX_EDGE)
  }, 30000)

  it('端点覆盖生效：请求打到归一后的覆盖端点', async () => {
    await configureVision('https://api.siliconflow.cn/v1')
    repos.photoRepository.getPhotoById.mockReturnValue(makePhoto({ id: 'img1' }))
    fetchMock.mockResolvedValue(chatResponse(SUGGEST_JSON))
    await suggestVisionMeta('img1')
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://api.siliconflow.cn/v1/chat/completions')
  })

  it('缩略图缓存未命中时按 id 现场生成（路径不经过渲染层）', async () => {
    await configureVision()
    thumbs.getCachedPath.mockReturnValue(null)
    repos.photoRepository.getPhotoById.mockReturnValue(makePhoto({ id: 'img1' }))
    fetchMock.mockResolvedValue(chatResponse(SUGGEST_JSON))
    await suggestVisionMeta('img1')
    expect(thumbs.generate).toHaveBeenCalledWith('img1', '/tmp/img1.jpg', 1024)
  })

  it('端点返回 401 时错误面带状态码与详情', async () => {
    await configureVision()
    repos.photoRepository.getPhotoById.mockReturnValue(makePhoto({ id: 'img1' }))
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'Unauthorized'
    })
    const r = await suggestVisionMeta('img1')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('视觉端点返回 401')
    expect(r.error).toContain('Unauthorized')
  })

  it('响应没有内容时报「响应里没有内容」', async () => {
    await configureVision()
    repos.photoRepository.getPhotoById.mockReturnValue(makePhoto({ id: 'img1' }))
    fetchMock.mockResolvedValue(chatResponse(''))
    const r = await suggestVisionMeta('img1')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('响应里没有内容')
  })
})

describe('testVisionConnection（1×1 png 探针）', () => {
  it('未配置直接报错', async () => {
    const r = await testVisionConnection()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('未配置视觉模型')
  })

  it('发内置 1×1 png（确实是 PNG 魔数 + 1×1），能回文本即算通', async () => {
    await configureVision()
    fetchMock.mockResolvedValue(chatResponse('正常'))
    const r: ChatResult = await testVisionConnection()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text).toBe('正常')
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    const body = JSON.parse(init.body) as {
      messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>
    }
    const dataUrl = body.messages[0].content[1].image_url?.url ?? ''
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    const bytes = Buffer.from(VISION_PROBE_PNG_BASE64, 'base64')
    expect(bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true)
    const meta = await sharp(bytes).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(1)
    expect(meta.height).toBe(1)
  })

  it('响应没有内容时同样报「响应里没有内容」口径', async () => {
    await configureVision()
    fetchMock.mockResolvedValue(chatResponse(''))
    const r: ChatResult = await testVisionConnection()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('响应里没有内容')
  })
})

describe('batchVisionMeta（批量看图打标）', () => {
  it('位图生成、非位图跳过（预期缺席），token 按条数累加，落库走既有通道', async () => {
    await configureVision()
    repos.photoRepository.getPhotoById.mockImplementation((id: string) =>
      id === 'img1' ? makePhoto({ id: 'img1' }) : makePhoto({ id: 'vid1', kind: 'video' })
    )
    fetchMock.mockResolvedValue(
      chatResponse(SUGGEST_JSON, { prompt_tokens: 40, completion_tokens: 6 })
    )
    const progress: BatchMetaProgress[] = []
    const r: BatchMetaResult = await batchVisionMeta(['img1', 'vid1'], (p) => progress.push(p))
    expect(r).toMatchObject({ done: 1, skipped: 1, failed: 0, requested: 2 })
    // 成本随图片条数：只有位图那张发了请求（1 次 × 40/6）
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r.tokens).toEqual({ prompt: 40, completion: 6 })
    // 描述只在为空时写入；标签走 addTagToPhotos
    expect(repos.photoRepository.setDescription).toHaveBeenCalledWith('img1', '一只橘猫趴在窗台')
    expect(repos.photoRepository.addTagToPhotos).toHaveBeenCalledWith(['img1'], '猫')
    expect(repos.photoRepository.setDescription).not.toHaveBeenCalledWith('vid1', expect.anything())
    // 进度流：running 起步、idle 收尾
    expect(progress[0]).toMatchObject({ done: 0, total: 2, phase: 'running' })
    expect(progress[progress.length - 1]).toMatchObject({ done: 2, total: 2, phase: 'idle' })
  })

  it('已有备注不覆盖（描述非空时不写 setDescription）', async () => {
    await configureVision()
    repos.photoRepository.getPhotoById.mockReturnValue(
      makePhoto({ id: 'img1', description: '手写的备注' })
    )
    fetchMock.mockResolvedValue(chatResponse(SUGGEST_JSON))
    const r = await batchVisionMeta(['img1'])
    expect(r.done).toBe(1)
    expect(repos.photoRepository.setDescription).not.toHaveBeenCalled()
    expect(repos.photoRepository.addTagToPhotos).toHaveBeenCalled()
  })

  it('两张位图 → 两次请求，token 累加是两份（成本随图片条数）', async () => {
    await configureVision()
    repos.photoRepository.getPhotoById.mockImplementation((id: string) => makePhoto({ id }))
    fetchMock.mockResolvedValue(
      chatResponse(SUGGEST_JSON, { prompt_tokens: 40, completion_tokens: 6 })
    )
    const r = await batchVisionMeta(['img1', 'img2'])
    expect(r.done).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(r.tokens).toEqual({ prompt: 80, completion: 12 })
  })

  it('未配置视觉模型直接抛错（渲染层 toast 可见原因）', async () => {
    repos.photoRepository.getPhotoById.mockReturnValue(makePhoto({ id: 'img1' }))
    await expect(batchVisionMeta(['img1'])).rejects.toThrow('未配置视觉模型')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('入参超 200 条截断（与文本链同一上限）', async () => {
    await configureVision()
    repos.photoRepository.getPhotoById.mockImplementation((id: string) => makePhoto({ id }))
    fetchMock.mockResolvedValue(chatResponse(SUGGEST_JSON))
    const ids = Array.from({ length: 210 }, (_, i) => `img${i}`)
    const r = await batchVisionMeta(ids)
    expect(r.requested).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(200)
  }, 60000)

  it('写盘文件里 Key 密文与 vision 明文配置共存（setApiKey 不清 vision）', () => {
    expect(configureVisionSync()).toBe(true)
    expect(setApiKey('sk-another-key-12345678').ok).toBe(true)
    const raw = JSON.parse(readFileSync(cfgDir(), 'utf-8')) as {
      key?: string
      vision?: { model?: string }
    }
    expect(typeof raw.key).toBe('string')
    expect(raw.vision?.model).toBe('deepseek-vl2')
  })
})
