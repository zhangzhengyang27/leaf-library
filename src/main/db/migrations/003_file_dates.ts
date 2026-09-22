import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 003: 文件系统时间列（D-012 配套：排列方式对齐 Eagle 10 种）。
 *
 * - photo_photos.fs_created_at / fs_modified_at：导入时从 fs.stat 写入的
 *   文件系统创建/修改时间。taken_at 的语义是 EXIF 拍摄时间（无则落 now()），
 *   不能冒充文件创建/修改时间。
 * - 旧行两列为 NULL，由启动时的 FileDatesBackfill 分批回填（fileDates.ts）。
 */
export const m003_file_dates: Migration = {
  version: 3,
  name: 'file_dates',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_photos ADD COLUMN fs_created_at INTEGER;
      ALTER TABLE photo_photos ADD COLUMN fs_modified_at INTEGER;
    `)
  }
}
