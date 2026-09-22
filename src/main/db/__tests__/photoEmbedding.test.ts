import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { EmbeddingService, type Embedder } from '../../services/EmbeddingService'

/** 确定性替身 embedder：文本/图像都映射到固定 8 维向量（余弦可判方向） */
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

// 旧 CLIP 链（EmbeddingService + photo_embeddings）随 D-017 下线，迁移 019 已 DROP 该表，
// 而 preload 也没暴露过 ai.semanticSearch 这类桥——想在测试里跑绿只能自建表，没有断言价值。
// 现役语义链是 ClipEmbeddingService + photo_vectors（021），覆盖在 ClipEmbeddingService.model.test.ts。
describe.skip('EmbeddingService · 语义检索', () => {
  let db: Database.Database
  let svc: EmbeddingService

  beforeEach(() => {
    db = createTestDb()
    svc = new EmbeddingService(db)
    svc.setEmbedder(makeFakeEmbedder())
  })
  afterEach(() => closeTestDb(db))

  it('semanticSearch 按余弦降序返回且过滤 minScore', async () => {
    // 造三个向量：q 的近邻、正交、反方向
    const target = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0])
    const near = new Float32Array([0.9, 0.1, 0, 0, 0, 0, 0, 0])
    const orthogonal = new Float32Array([0, 1, 0, 0, 0, 0, 0, 0])
    insertEmbedding(db, 'near', 'fake-clip', near)
    insertEmbedding(db, 'orth', 'fake-clip', orthogonal)

    // stub embedText：查询固定返回 target 方向
    const fake: Embedder = {
      ...(await Promise.resolve(makeFakeEmbedder())),
      embedText: async () => target
    }
    svc.setEmbedder(fake)

    const results = await svc.semanticSearch('anything', 10, 0.2)
    expect(results.map((r) => r.photoId)).toEqual(['near'])
    expect(results[0].score).toBeCloseTo(0.9, 5)

    // 放宽阈值后正交向量为 0 分仍被过滤
    const loose = await svc.semanticSearch('anything', 10, 0)
    expect(loose.map((r) => r.photoId)).toEqual(['near', 'orth'])
  })

  it('模型隔离：其他模型的向量不参与检索', async () => {
    insertEmbedding(db, 'x', 'another-model', new Float32Array(8).fill(0.5))
    const results = await svc.semanticSearch('q', 10, -1)
    expect(results).toEqual([])
  })

  it('indexedCount/hasEmbedding 按当前模型统计', () => {
    insertEmbedding(db, 'p1', 'fake-clip', new Float32Array(8))
    expect(svc.indexedCount()).toBe(1)
    expect(svc.hasEmbedding('p1')).toBe(true)
    expect(svc.hasEmbedding('p2')).toBe(false)
  })

  it('空查询返回空', async () => {
    expect(await svc.semanticSearch('  ')).toEqual([])
  })
})
