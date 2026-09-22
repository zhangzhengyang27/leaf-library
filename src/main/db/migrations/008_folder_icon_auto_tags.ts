import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 008: 文件夹图标与自动标签（二十四轮，Eagle 文件夹右键「文件夹图标」「设置自动标签」）。
 *
 * - photo_folders.icon：emoji 图标字符串，NULL=默认文件夹图形。
 * - photo_folders.auto_tags：JSON 字符串（string[]，标签名列表），NULL=未设置；
 *   素材归入文件夹时自动补打这些标签。
 */
export const m008_folder_icon_auto_tags: Migration = {
  version: 8,
  name: 'folder_icon_auto_tags',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_folders ADD COLUMN icon TEXT;
      ALTER TABLE photo_folders ADD COLUMN auto_tags TEXT;
    `)
  }
}
