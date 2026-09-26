import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 026: 智能夹树形嵌套（D-022 M4，Eagle 智能文件夹同款）。
 *
 * photo_smart_albums 加 parent_id：智能夹可挂在另一条智能夹之下，
 * 求值时子级命中 = 子级规则 AND 全部祖先规则（编译组合在 PhotoDataStore，
 * 环防护在 SmartAlbumRepository）。parent_id 存的是另一条智能夹的 id，
 * **不加外键**——本库关联表都不挂外键（023 注释里有这笔账），删除路径
 * 由应用层决定语义：删除父夹不级联，子夹变孤儿按根级展示。
 *
 * 索引服务两件事：侧栏按 parentId 组织树的查询、求值时沿父链向上走。
 */
export const m026_smart_album_parent: Migration = {
  version: 26,
  name: 'smart_album_parent',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_smart_albums ADD COLUMN parent_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_photo_smart_albums_parent
        ON photo_smart_albums(parent_id);
    `)
  }
}
