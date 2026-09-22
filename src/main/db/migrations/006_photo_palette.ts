import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 006: 检查器主色板行（十五轮 B4，Eagle 预览图下方多色点板）。
 *
 * - photo_photos.palette：JSON 字符串数组（'#rrggbb'，3~5 色，亮→暗或按占比序），
 *   NULL=未提取。color_dominant 保持单主色语义不动。
 */
export const m006_photo_palette: Migration = {
  version: 6,
  name: 'photo_palette',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_photos ADD COLUMN palette TEXT;
    `)
  }
}
