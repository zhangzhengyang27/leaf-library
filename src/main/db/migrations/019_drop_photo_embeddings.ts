import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 019: 丢弃 CLIP 语义向量表（D-017 下线 AI 语义搜索）。
 *
 * 向量是派生数据、可由模型重算，但整条 CLIP 链路（EmbeddingService / transformers.js）
 * 已随决策删除，留着这张表只会让「已索引 N 张」这类状态在 UI 上无处安放。
 * 001 里的 CREATE 不动——迁移只追加不改写，存量库升级走这条 DROP。
 */
export const m019_drop_photo_embeddings: Migration = {
  version: 19,
  name: 'drop_photo_embeddings',
  up(db: Database.Database) {
    db.exec(`DROP TABLE IF EXISTS photo_embeddings`)
  }
}
