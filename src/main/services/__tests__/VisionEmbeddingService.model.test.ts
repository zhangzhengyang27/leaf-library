// @vitest-environment node
/**
 * G1 · 视觉塔真跑一遍（模型在位时才跑）
 *
 * 这条测试守的不是"代码跑通"，而是 D-017 那类坑：**模型加载成功 ≠ 向量有意义**。
 * 断言的是检索真正在意的性质——同一张图的轻微扰动，应当远比另一张内容不同的图更近。
 * 预处理写错（通道序反了、忘了归一化、resize 档位错）会让两两余弦全挤到 0.99 附近，
 * 这条就会红。
 *
 * 走过的弯路记下来免得照抄：最初那版拿"纯红 vs 纯红加条纹"当同类对、阈值定 0.95，
 * 那是照一份用 lanczos3 的探针脚本量的；换成规范写明的 bicubic（sharp kernel:'cubic'）
 * 之后同一对掉到 0.894（跨色系仍 0.859）。纯色+硬条纹对采样核太敏感，不是好样本，
 * 所以换成"近似重复 vs 内容不同"这种与采样核无关的结构化判据。
 *
 * 模型来源（按序找）：LEAF_MODEL_DIR/vision_model.onnx → /tmp/jina-probe/。
 * 都没有就整块 skip——不假装测过。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import type Database from 'better-sqlite3'
import { VISION_MODEL_ID, VisionEmbeddingService } from '../VisionEmbeddingService'
import { PhotoVectorRepository } from '../../db/repos/PhotoVectorRepository'
import { createTestDb, closeTestDb } from '../../db/__tests__/testDb'
import { cosine } from '@shared/vectors'

const MODEL_FILE = 'vision_model.onnx'
const candidates = [
  process.env.LEAF_MODEL_DIR ? join(process.env.LEAF_MODEL_DIR, MODEL_FILE) : '',
  '/tmp/jina-probe/vision_fp32.onnx',
  '/tmp/jina-probe/vision_model.onnx'
].filter(Boolean)
const source = candidates.find((p) => existsSync(p))

const svc = new VisionEmbeddingService()
let dir: string | null = null

/** 结构化图案：底色 + 3×3 棋盘方块；jitter 只改亮度，不改内容 */
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

describe.skipIf(!source)('VisionEmbeddingService · 真模型', () => {
  let db: Database.Database

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'leaf-vectors-'))
    copyFileSync(source!, join(dir, MODEL_FILE))
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

  it('status 认模型已就绪，并能连库数向量', () => {
    const s = svc.status()
    expect(s.installed).toBe(true)
    expect(s.ready).toBe(true)
    expect(s.bytesOnDisk).toBeGreaterThan(100_000_000)
    expect(s.indexed).toBe(0)
  })

  it('768 维单位向量；近似重复远比内容不同更近', async () => {
    const base = await svc.embedBuffer(await pattern('#c0392b', '#f5f5f5'))
    const nearDup = await svc.embedBuffer(await pattern('#c0392b', '#f5f5f5', 10))
    const different = await svc.embedBuffer(await pattern('#1e6f3c', '#c5d8ff'))
    expect(base).not.toBeNull()
    expect(base!.length).toBe(768)
    expect(cosine(base!, base!)).toBeCloseTo(1, 5)

    const dup = cosine(base!, nearDup!)
    const diff = cosine(base!, different!)
    console.log(
      `[${VISION_MODEL_ID}] cos(近似重复)=${dup.toFixed(4)} cos(内容不同)=${diff.toFixed(4)}`
    )
    expect(dup).toBeGreaterThan(0.95)
    expect(diff).toBeLessThan(dup - 0.1)
  }, 180_000)

  it('喂垃圾字节返回 null，而不是抛或存进脏向量', async () => {
    expect(await svc.embedBuffer(Buffer.from('not an image'))).toBeNull()
  })
})

describe('模型缺席时明确不可用（不依赖模型在位）', () => {
  it('没下载就是没下载：ready=false，embed 返回 null 并记下原因', async () => {
    const bare = new VisionEmbeddingService()
    const empty = mkdtempSync(join(tmpdir(), 'leaf-no-model-'))
    const db = createTestDb()
    bare.setModelDirForTests(empty)
    bare.setRepoForTests(new PhotoVectorRepository(db))
    expect(bare.status().ready).toBe(false)
    expect(bare.status().installed).toBe(false)
    expect(await bare.embedBuffer(await pattern('#000000', '#ffffff'))).toBeNull()
    expect(bare.status().lastError).toContain('模型未下载')
    bare.setModelDirForTests(null)
    bare.setRepoForTests(new PhotoVectorRepository())
    rmSync(empty, { recursive: true, force: true })
    closeTestDb(db)
  })
})
