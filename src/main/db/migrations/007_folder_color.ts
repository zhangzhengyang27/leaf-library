import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 007: 文件夹颜色（十五轮 D19，Eagle 文件夹右键「改变颜色…」）。
 *
 * - photo_folders.color：hex 字符串（'#rrggbb'），NULL=自动色（名称派生）。
 */
export const m007_folder_color: Migration = {
  version: 7,
  name: 'folder_color',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_folders ADD COLUMN color TEXT;
    `)
  }
}
