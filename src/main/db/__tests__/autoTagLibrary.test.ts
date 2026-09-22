/**
 * EmbeddingService.autoTagLibrary / suggestDescription（阶段 5.3）
 *
 * mock ThumbnailService 让 suggestTags 不依赖真实缩略图；fake embedder 确定性打分。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { EmbeddingService, type Embedder } from '../../services/EmbeddingService'

vi.mock('../../services/ThumbnailService', () => ({
  getThumbnailService: () => ({ getCachedPath: () => '/tmp/fake-preview.png' })
}))

vi.mock('../../db/repos/PhotoRepository', () => ({
  photoRepository: {
    getPhotoById: () => ({ id: 'p1', fileName: 'photo.png' }),
    addTag: () => true
  }
}))

/** 确定性替身 embedder：文本/图像都映射到固定 8 维向量 */
function makeFakeEmbedder(): Embedder {
  const vec = (seed: number): Float32Array => {
    const v = new Float32Array(8)
    for (let i = 0; i < 8; i++) v[i] = Math.cos(seed * (i + 1))
    return v
  }
  return {
    modelId: 'fake-clip',
    dim: 8,
    embedImage: async (p) => vec(p.length),
    embedText: async (t) => vec(t.length)
  }
}

function insertEmbedding(
  db: Database.Database,
  photoId: string,
  model: string,
  vec: Float32Array
): void {
  db.prepare(
    `INSERT INTO photo_embeddings (photo_id, model, dim, embedding, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    photoId,
    model,
    vec.length,
    Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength),
    Date.now()
  )
}

describe('EmbeddingService · 全库自动打标（阶段 5.3）', () => {
  let db: Database.Database
  let svc: EmbeddingService

  beforeEach(() => {
    db = createTestDb()
    svc = new EmbeddingService(db)
    svc.setEmbedder(makeFakeEmbedder())
  })
  afterEach(() => closeTestDb(db))

  it('只处理「缺标签 + 已有向量」的素材，分数达标才落库', async () => {
    const vec = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0])
    insertEmbedding(db, 'p1', 'fake-clip', vec)
    insertEmbedding(db, 'p2', 'fake-clip', vec)
    const applied: Array<[string, string]> = []
    const r = await svc.autoTagLibrary(
      [
        { id: 'p1', tags: [] }, // 缺标签 + 有向量 → 处理
        { id: 'p2', tags: ['已有'] }, // 已有标签 → 跳过
        { id: 'p3', tags: [] } // 无向量 → 跳过
      ],
      {
        minScore: -1, // 放宽阈值让候选必然达标（fake 分数可能很低）
        applyTag: (id, tag) => {
          applied.push([id, tag])
          return true
        }
      }
    )
    expect(r.scanned).toBe(1)
    expect(applied.length).toBeGreaterThan(0)
    expect(applied.every(([id]) => id === 'p1')).toBe(true)
  })

  it('无候选时返回 0 且不推送进度', async () => {
    const r = await svc.autoTagLibrary([{ id: 'p1', tags: [] }], { applyTag: () => false })
    expect(r).toEqual({ tagged: 0, scanned: 0 })
  })

  it('suggestDescription：基于候选标签拼接描述文案', async () => {
    const vec = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0])
    insertEmbedding(db, 'p1', 'fake-clip', vec)
    const text = await svc.suggestDescription('p1')
    expect(text).toBeTruthy()
    expect(text).toContain('这张素材的内容偏向')
  })

  it('suggestName：top 候选标签 + 原名生成命名建议（含扩展名）', async () => {
    const vec = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0])
    insertEmbedding(db, 'p1', 'fake-clip', vec)
    const name = await svc.suggestName('p1')
    expect(name).toBeTruthy()
    // 形如「截图-photo.png」（中文词-原名.ext）
    expect(name).toMatch(/^[\u4e00-\u9fa5]+-photo\.png$/)
  })
})
