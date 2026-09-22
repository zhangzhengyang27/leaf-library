import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 005: 每文件夹独立视图设置（Eagle 新建/编辑文件夹对话框的布局/排列/显示覆盖）。
 *
 * - photo_folders.view_layout：布局覆盖（'auto'|'waterfall'|'grid'|'list'，NULL=跟随全局）
 * - photo_folders.view_sort：排列覆盖（LibrarySort，NULL=跟随全局）
 * - photo_folders.view_display：显示开关覆盖（JSON 部分对象，如 {"showName":0}；NULL=跟随全局）
 */
export const m005_folder_view_settings: Migration = {
  version: 5,
  name: 'folder_view_settings',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_folders ADD COLUMN view_layout TEXT;
      ALTER TABLE photo_folders ADD COLUMN view_sort TEXT;
      ALTER TABLE photo_folders ADD COLUMN view_display TEXT;
    `)
  }
}
