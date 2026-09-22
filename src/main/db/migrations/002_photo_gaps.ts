import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 002: 补齐素材库功能/布局差距所需的表字段（D-009 配套）。
 *
 * - photo_photos.last_viewed_at：最近查看入口（§3 L4 / §2.B 固定入口）需要按查看时间排序。
 *   仅新增列 + 索引，不破坏既有数据；旧行该列为 NULL，按导入时间兜底。
 */
export const m002_photo_gaps: Migration = {
  version: 2,
  name: 'photo_gaps',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_photos ADD COLUMN last_viewed_at INTEGER;
    `)
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_photo_photos_last_viewed ON photo_photos(last_viewed_at DESC);`
    )
  }
}
