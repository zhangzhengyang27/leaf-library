import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 013: photo_photos.file_path 索引。
 *
 * 按路径查询是导入热路径：addPhoto/addPhotos 的去重、getPhotoByPath、
 * pathPolicy 白名单（openPath/showInFolder/openWith）每次都按 file_path 查；
 * 无索引时每次 INSERT 前的全表扫让整批导入退化为 O(n²)。
 */
export const m013_file_path_index: Migration = {
  version: 13,
  name: 'file_path_index',
  up(db: Database.Database) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_photos_file_path ON photo_photos(file_path)`)
  }
}
