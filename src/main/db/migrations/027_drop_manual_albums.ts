import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 027: 撤销手动相册（D-027，组织维度与 Eagle 对齐——文件夹/智能夹/标签）。
 *
 * photo_albums / photo_album_items 出库：Eagle 无手动相册（实包取证），Leaf 的
 * 手动相册与文件夹语义重叠且入口默认隐藏（建完无去处），实测成死胡同功能；
 * 「收集册」语义由标签（多对多）覆盖。
 *
 * 对账（2026-09-27 真库）：仅 1 相册、1 条素材引用，无实际数据损失。
 * 未分类语义随之简化：原「不在任何文件夹且不在任何手动相册」→「不在任何文件夹」
 * （查询侧简化在 PhotoRepository.getUnsortedPhotos）。
 */
export const m027_drop_manual_albums: Migration = {
  version: 27,
  name: 'drop_manual_albums',
  up(db: Database.Database) {
    db.exec(`
      DROP TABLE IF EXISTS photo_album_items;
      DROP TABLE IF EXISTS photo_albums;
    `)
  }
}
