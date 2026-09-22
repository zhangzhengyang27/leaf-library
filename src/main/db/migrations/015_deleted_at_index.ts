import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 015: 回收站 keyset 分页部分索引。
 *
 * 回收站查询形态固定为 `WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, rowid DESC`
 * （分页化阶段 1，docs/PAGINATION_DESIGN.md）。部分索引让每页取数避开全匹配集排序
 * （SQLite 索引条目隐含 rowid；同 deleted_at 值的组内 tiebreak 由查询引擎就地排序，
 * 组通常只有个位数行）。只覆盖 deleted_at IS NOT NULL：活跃素材查询从不用此列序。
 */
export const m015_deleted_at_index: Migration = {
  version: 15,
  name: 'deleted_at_index',
  up(db: Database.Database) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_photo_photos_deleted_at_desc
        ON photo_photos(deleted_at DESC)
        WHERE deleted_at IS NOT NULL
    `)
  }
}
