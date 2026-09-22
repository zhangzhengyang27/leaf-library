/**
 * Leaf · PhotoVectorRepository（G1 图像向量塔）
 *
 * 只管 photo_vectors 的读写与批量取，不算相似度（那是 VisionEmbeddingService 的事）。
 * 一次全库检索要把候选向量都读进内存：768 维 Float32 = 3KB/条，5 万条约 150MB ——
 * 所以 `allByModel` 只在检索时调用，且必须带 model 过滤（跨模型混比会得出无意义的余弦）。
 */
import type Database from 'better-sqlite3'
import { database } from '../database'
import { now } from '../repo'

export interface VectorRow {
  photo_id: string
  model: string
  dim: number
  vec: Buffer
}

export class PhotoVectorRepository {
  constructor(private readonly _db?: Database.Database) {}

  private get db(): Database.Database {
    return this._db ?? database.handle
  }

  upsert(photoId: string, model: string, dim: number, vec: Buffer): void {
    this.db
      .prepare(
        `INSERT INTO photo_vectors (photo_id, model, dim, vec, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(photo_id) DO UPDATE SET
           model = excluded.model, dim = excluded.dim, vec = excluded.vec, created_at = excluded.created_at`
      )
      .run(photoId, model, dim, vec, now())
  }

  get(photoId: string): VectorRow | undefined {
    return this.db
      .prepare(`SELECT photo_id, model, dim, vec FROM photo_vectors WHERE photo_id = ?`)
      .get(photoId) as VectorRow | undefined
  }

  /** 指定模型的全部向量（跨模型的行天然被排除） */
  allByModel(model: string): VectorRow[] {
    return this.db
      .prepare(`SELECT photo_id, model, dim, vec FROM photo_vectors WHERE model = ?`)
      .all(model) as VectorRow[]
  }

  countByModel(model: string): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM photo_vectors WHERE model = ?`)
      .get(model) as { n: number }
    return r.n
  }

  /** 已入库素材里有多少条还没建这个模型的向量（进度分母用） */
  countMissing(model: string): number {
    const r = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM photo_photos p
          WHERE p.deleted_at IS NULL AND p.kind = 'image' AND p.thumb_status = 1
            AND NOT EXISTS (SELECT 1 FROM photo_vectors v WHERE v.photo_id = p.id AND v.model = ?)`
      )
      .get(model) as { n: number }
    return r.n
  }

  /** 待建向量清单（按导入序，分批消费） */
  listMissing(model: string, limit: number): Array<{ id: string; filePath: string }> {
    return this.db
      .prepare(
        `SELECT p.id, p.file_path AS filePath FROM photo_photos p
          WHERE p.deleted_at IS NULL AND p.kind = 'image' AND p.thumb_status = 1
            AND NOT EXISTS (SELECT 1 FROM photo_vectors v WHERE v.photo_id = p.id AND v.model = ?)
          ORDER BY p.imported_at LIMIT ?`
      )
      .all(model, Math.min(Math.max(Math.trunc(limit) || 200, 1), 1000)) as Array<{
      id: string
      filePath: string
    }>
  }

  delete(photoId: string): void {
    this.db.prepare(`DELETE FROM photo_vectors WHERE photo_id = ?`).run(photoId)
  }

  /** 换模型/换量化档时的全量重建入口 */
  clearAll(): number {
    return this.db.prepare(`DELETE FROM photo_vectors`).run().changes
  }
}
