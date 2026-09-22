import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 004: 二轮 Eagle 对齐（R4/R5）。
 *
 * - photo_folders.password：文件夹密码（safeStorage 加密 base64，FolderLockService）
 * - photo_folders.cover_photo_id：文件夹封面素材（侧栏缩略图）
 * - photo_folders.description：文件夹描述（Eagle 文件夹检查器有描述字段）
 * - photo_photos.pinned_at：置顶时间（置顶项在视图内优先展示）
 */
export const m004_folder_cover_pin: Migration = {
  version: 4,
  name: 'folder_cover_pin',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_folders ADD COLUMN password TEXT;
      ALTER TABLE photo_folders ADD COLUMN cover_photo_id TEXT;
      ALTER TABLE photo_folders ADD COLUMN description TEXT;
      ALTER TABLE photo_photos ADD COLUMN pinned_at INTEGER;
    `)
  }
}
