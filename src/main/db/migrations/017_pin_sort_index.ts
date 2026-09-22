import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 017: 分页 ORDER BY 的置顶分组索引（代码审查二轮）。
 *
 * 五个分页池的 ORDER BY 都是 `(pinned_at IS NOT NULL) DESC, imported_at DESC, rowid DESC`
 * （PAGE_PIN_EXPR 前置，Eagle 的「置顶恒在最前」）。SQLite 无法用现有
 * idx_photo_photos_imported_at_desc 满足该序，实测 5 万行下每页退化为
 * `SCAN + USE TEMP B-TREE FOR ORDER BY`：20 页 268ms（无置顶项的同构查询 19ms）。
 * 建本索引后同一翻页 8ms。
 *
 * 代价实测：5 万行建索引 8ms；3000 次插入 71ms → 79ms（+11%，导入管线可忽略）。
 * 只覆盖 imported_at 这一组排序——其余排序键（file_name/rating/…）目前
 * 没有池在用，将来下推时再按同样形状各建一条，不预先堆索引。
 */
export const m017_pin_sort_index: Migration = {
  version: 17,
  name: 'pin_sort_index',
  up(db: Database.Database) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_photo_photos_pin_imported
        ON photo_photos ((pinned_at IS NOT NULL) DESC, imported_at DESC)
        WHERE deleted_at IS NULL;
    `)
  }
}
