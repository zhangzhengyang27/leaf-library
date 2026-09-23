// @vitest-environment node
/**
 * G1 · Chinese-CLIP 真跑一遍（模型与评测图在位时才跑）
 *
 * 这条测试守的不是"代码跑通"，而是 D-017 那类坑：**模型加载成功 ≠ 向量有意义**。
 * 所以断言全是检索真正在意的性质：中文查询能把目标图排到第一、"池子里确实没有"的
 * 查询必须被阈值挡成空、同一张图的轻微扰动远比内容不同的图更近。
 *
 * 预处理写错（通道序反了、忘了归一化、resize 档位错、把 4 通道当 3 通道读）会让
 * 两两余弦全挤在一起、上面三条同时红。
 *
 * 来源（按序找）：LEAF_MODEL_DIR → /tmp/jina-text-probe/（探针下载位置）。
 * 评测图取 /tmp/ai-probe/img 里的真照片；任一缺失就整块 skip——不假装测过。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import type Database from 'better-sqlite3'
import { CLIP_MODEL_ID, SEMANTIC_MIN_SCORE, ClipEmbeddingService } from '../ClipEmbeddingService'
import { PhotoVectorRepository } from '../../db/repos/PhotoVectorRepository'
import { createTestDb, closeTestDb } from '../../db/__tests__/testDb'
import { cosine, vectorToBlob } from '@shared/vectors'

// /tmp/cc-probe 是探针目录：model.onnx + 配套的那份 tokenizer.json（21,128 条中文词表）。
// 别拿 jina 的 tokenizer.json 混进来——服务在 warm-up 里会按词表条数拒掉它。
// 第三个来源是**应用自己下载模型的落点**：装好了却只认 /tmp 的话，
// 日常 `pnpm test` 会一直静默 skip 这 6 条，"模型在位"这件事就永远不出证据。
// 与 ClipEmbeddingService.modelDir() 同源（那边是 app.getPath('userData')，
// vitest 里没有 electron 上下文，按平台拼同一条路径）。
const userDataModels = join(
  homedir(),
  process.platform === 'darwin'
    ? 'Library/Application Support/leaf-library'
    : process.platform === 'win32'
      ? 'AppData/Roaming/leaf-library'
      : '.config/leaf-library',
  'models'
)
const MODEL_DIR_CANDIDATES = [
  process.env.LEAF_MODEL_DIR ?? '',
  join(userDataModels, CLIP_MODEL_ID),
  '/tmp/cc-probe',
  '/tmp/jina-text-probe'
].filter(Boolean)
const SRC = MODEL_DIR_CANDIDATES.find(
  (d) => existsSync(join(d, 'model.onnx')) && existsSync(join(d, 'tokenizer.json'))
)
const IMG_DIR = '/tmp/ai-probe/img'
const POOL = ['cats.jpg', 'bread.png', 'pikachu.png', 'moraine-lake.png', 'sam-car.png']
const havePool = existsSync(IMG_DIR) && POOL.every((f) => existsSync(join(IMG_DIR, f)))

const svc = new ClipEmbeddingService()
let dir: string | null = null

/** 底色 + 3×3 棋盘；jitter 只改亮度，用来造"同一张图的轻微扰动" */
async function pattern(bg: string, squares: string, jitter = 0): Promise<Buffer> {
  const size = 300
  const px = Buffer.alloc(size * size * 3)
  const hex = (h: string): [number, number, number] => {
    const n = parseInt(h.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [r, g, b] = hex(bg)
  for (let i = 0; i < size * size; i++) {
    px[i * 3] = Math.min(255, r + jitter)
    px[i * 3 + 1] = Math.min(255, g + jitter)
    px[i * 3 + 2] = Math.min(255, b + jitter)
  }
  const [sr, sg, sb] = hex(squares)
  for (let by = 0; by < 3; by++) {
    for (let bx = 0; bx < 3; bx++) {
      if ((bx + by) % 2 !== 0) continue
      for (let y = by * 100 + 20; y < by * 100 + 80; y++) {
        for (let x = bx * 100 + 20; x < bx * 100 + 80; x++) {
          const i = (y * size + x) * 3
          px[i] = Math.min(255, sr + jitter)
          px[i + 1] = Math.min(255, sg + jitter)
          px[i + 2] = Math.min(255, sb + jitter)
        }
      }
    }
  }
  return sharp(px, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer()
}

describe.skipIf(!SRC)('ClipEmbeddingService · 真模型', () => {
  let db: Database.Database

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'leaf-vectors-'))
    copyFileSync(join(SRC!, 'model.onnx'), join(dir, 'model.onnx'))
    copyFileSync(join(SRC!, 'tokenizer.json'), join(dir, 'tokenizer.json'))
    writeFileSync(join(dir, '.ready'), JSON.stringify({ at: Date.now() }))
    svc.setModelDirForTests(dir)
    db = createTestDb()
    svc.setRepoForTests(new PhotoVectorRepository(db))
  }, 120_000)

  afterAll(() => {
    svc.setModelDirForTests(null)
    svc.setRepoForTests(new PhotoVectorRepository())
    if (dir) rmSync(dir, { recursive: true, force: true })
    closeTestDb(db)
  })

  it('status 认两个文件都在位，并能连库数向量', () => {
    const s = svc.status()
    expect(s.installed).toBe(true)
    expect(s.ready).toBe(true)
    expect(s.bytesOnDisk).toBeGreaterThan(100_000_000)
    expect(s.indexed).toBe(0)
    expect(s.modelId).toBe(CLIP_MODEL_ID)
  })

  it('512 维单位向量、可复现（同一张图两次前向余弦为 1）', async () => {
    const base = await svc.embedBuffer(await pattern('#c0392b', '#f5f5f5'))
    const again = await svc.embedBuffer(await pattern('#c0392b', '#f5f5f5'))
    expect(base).not.toBeNull()
    expect(base!.length).toBe(512)
    expect(cosine(base!, again!)).toBeCloseTo(1, 5)
  }, 300_000)

  it('喂垃圾字节返回 null，而不是抛或存进脏向量', async () => {
    expect(await svc.embedBuffer(Buffer.from('not an image'))).toBeNull()
  })

  it('中文分词没塌：不同查询给出不同向量，且几乎不产 UNK', async () => {
    const a = await svc.embedText('一只打呼噜的虎斑猫')
    const b = await svc.embedText('面包房木架上的长条面包')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(cosine(a!, b!)).toBeLessThan(0.95)
  }, 300_000)

  describe.skipIf(!havePool)('真照片池：文搜图与近似重复判别', () => {
    /** 直接走同一个仓储实例写向量：不去撬服务的私有字段。
     *  必须在 beforeAll 里建——db 是外层 beforeAll 才赋值的，收集期还是 undefined */
    let repo: PhotoVectorRepository
    beforeAll(async () => {
      repo = new PhotoVectorRepository(db)
      for (const f of POOL) {
        const id = `probe-${f.replace(/[^a-z0-9]/gi, '_')}`
        const buf = await sharp(join(IMG_DIR, f)).png().toBuffer()
        const v = await svc.embedBuffer(buf)
        expect(v).not.toBeNull()
        repo.upsert(id, CLIP_MODEL_ID, v!.length, vectorToBlob(v!))
      }
    }, 300_000)

    it('近似重复 ≫ 内容不同（抽象合成图案对这座模型不判别，只能在真照片上量）', async () => {
      const f = POOL[0]
      const original = await svc.embedBuffer(await sharp(join(IMG_DIR, f)).toBuffer())
      const variant = await svc.embedBuffer(
        await sharp(join(IMG_DIR, f))
          .resize(640, 640, { fit: 'cover' })
          .jpeg({ quality: 72 })
          .toBuffer()
      )
      const others = await Promise.all(
        POOL.filter((x) => x !== f).map(async (x) =>
          svc.embedBuffer(await sharp(join(IMG_DIR, x)).toBuffer())
        )
      )
      const near = cosine(original!, variant!)
      const far = Math.max(...others.map((o) => cosine(original!, o!)))
      console.log(
        `  [真照片] cos(原图,jpeg变体)=${near.toFixed(4)} cos(原图,池内最像的别的图)=${far.toFixed(4)}`
      )
      expect(near).toBeGreaterThan(0.95)
      expect(far).toBeLessThan(near - 0.15)
    }, 300_000)

    it('中文查询把目标图排在第一', async () => {
      const hits = await svc.searchText('一只猫', 3)
      expect(hits.length).toBeGreaterThan(0)
      expect(hits[0].id).toBe('probe-cats_jpg')
    }, 300_000)

    it('池子里确实没有的东西，被实测阈值挡成空结果', async () => {
      const hits = await svc.searchText('一架黑色三角钢琴', 5)
      expect(hits).toEqual([])
      // 判别性：把阈值放到 0 就一定能捞出东西——说明"空"是阈值挡的，不是检索没跑
      const loose = await svc.searchText('一架黑色三角钢琴', 5, 0)
      expect(loose.length).toBeGreaterThan(0)
      expect(loose[0].score).toBeLessThan(SEMANTIC_MIN_SCORE)
    }, 300_000)
  })
})

describe('模型缺席时明确不可用（不依赖模型在位）', () => {
  it('没下载就是没下载：ready=false，embed 返回 null 并记下原因', async () => {
    const bare = new ClipEmbeddingService()
    const empty = mkdtempSync(join(tmpdir(), 'leaf-no-model-'))
    const db = createTestDb()
    bare.setModelDirForTests(empty)
    bare.setRepoForTests(new PhotoVectorRepository(db))
    expect(bare.status().ready).toBe(false)
    expect(bare.status().installed).toBe(false)
    expect(await bare.embedBuffer(await pattern('#000000', '#ffffff'))).toBeNull()
    expect(bare.status().lastError).toContain('模型未下载')
    // 文本侧同口径：没模型就是一条命中都不给，而不是抛给渲染层
    expect(await bare.searchText('猫')).toEqual([])
    bare.setModelDirForTests(null)
    bare.setRepoForTests(new PhotoVectorRepository())
    rmSync(empty, { recursive: true, force: true })
    closeTestDb(db)
  })

  it('只有权重没有分词表也算没装好（融合图两件套缺一不可）', () => {
    const half = new ClipEmbeddingService()
    const d = mkdtempSync(join(tmpdir(), 'leaf-half-model-'))
    const db2 = createTestDb()
    writeFileSync(join(d, 'model.onnx'), 'x')
    half.setModelDirForTests(d)
    half.setRepoForTests(new PhotoVectorRepository(db2))
    expect(half.status().installed).toBe(false)
    expect(half.isReady()).toBe(false)
    half.setModelDirForTests(null)
    half.setRepoForTests(new PhotoVectorRepository())
    rmSync(d, { recursive: true, force: true })
    closeTestDb(db2)
  })
})
