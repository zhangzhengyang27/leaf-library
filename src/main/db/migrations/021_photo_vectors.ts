import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 021: 图像向量表（G1 AI 搜索重建·图像塔）。
 *
 * 与 001 建、019 删掉的那张 `photo_embeddings` 同用途但不同形状，刻意不重用它：
 *  1. 带 `model` 列 —— 换模型/换量化档位时旧向量必须能被判出来并排除比对，
 *     否则 768 维的新向量会和 512 维的旧向量在同一个余弦里串味；
 *  2. 带 `dim` —— 长度不符直接当脏数据处理，不给它进相似度计算的机会；
 *  3. 向量存 Float32 little-endian BLOB，不在 SQL 里做算术（SQLite 没有向量索引，
 *     真做算术只会骗自己）；检索时按 model 过滤后在 JS 里算余弦。
 *
 * 空表是合法状态：模型没下载或没建索引时，向量档整体不可用，
 * 由 pHash 档继续兜着（见 services/VisionEmbeddingService 的可用性探测）。
 */
export const m021_photo_vectors: Migration = {
  version: 21,
  name: 'photo_vectors',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_vectors (
        photo_id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        dim INTEGER NOT NULL,
        vec BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_photo_vectors_model ON photo_vectors(model);
    `)
  }
}
