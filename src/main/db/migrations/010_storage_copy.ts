import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 010: 库拷贝式存储追踪（F11，对齐 Eagle「导入时拷贝入库」）。
 *
 * - photo_photos.source_path：copy 模式下记录导入时的原始路径（「显示原文件」/ 迁移审计）
 * - photo_photos.missing_at：断链标记（ms 时间戳，NULL=正常）；启动/手动扫描时维护
 */
export const m010_storage_copy: Migration = {
  version: 10,
  name: 'storage_copy',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_photos ADD COLUMN source_path TEXT;
      ALTER TABLE photo_photos ADD COLUMN missing_at INTEGER;
    `)
  }
}
