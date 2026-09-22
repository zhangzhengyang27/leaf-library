/**
 * 025: source_path 索引（D-020 入库即拷贝）
 *
 * 拷贝式入库的重复导入判定只能按原始路径查：入库后 file_path 是库内副本路径
 * （images/YYMM/原名），与用户再选一次的原路径对不上，按 file_path 去重形同虚设。
 * 那条查询走 source_path 等值匹配，没索引就是每次导入全表扫一遍
 * （批量导入 5,000 个文件 = 2,500 万次行访问）。
 */
import type Database from 'better-sqlite3'
import type { Migration } from '.'

export const m025_source_path_index: Migration = {
  version: 25,
  name: 'source_path_index',
  up(db: Database.Database) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_photo_photos_source_path
        ON photo_photos(source_path);
    `)
  }
}
