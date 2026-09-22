import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 009: 自由网格位置（F10，对齐 Eagle 自由网格）。
 *
 * photo_freeform_pos：文件夹 × 素材 的画布摆放（x/y 像素、scale 缩放）。
 * 布局标识本身复用 photo_folders.view_layout（m005）第 5 个枚举值 'freeform'。
 * 素材/文件夹删除时的孤儿行由重扫覆盖写入，无需触发器。
 */
export const m009_freeform_positions: Migration = {
  version: 9,
  name: 'freeform_positions',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_freeform_pos (
        folder_id TEXT NOT NULL,
        photo_id TEXT NOT NULL,
        x REAL NOT NULL DEFAULT 0,
        y REAL NOT NULL DEFAULT 0,
        scale REAL NOT NULL DEFAULT 1,
        PRIMARY KEY (folder_id, photo_id)
      );
      CREATE INDEX IF NOT EXISTS idx_freeform_folder ON photo_freeform_pos(folder_id);
    `)
  }
}
