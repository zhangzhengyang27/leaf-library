import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 028: 标签管理 Eagle 复刻（常用标签 + 群组容器语义 + 群组排序）。
 *
 * tag_tags 加三列：
 * - starred：常用标签（Eagle sidebar.starred）由用户手动设定（拖拽/右键菜单），
 *   取代渲染层 usageCount>=3 的自动口径——Eagle 语义里「常用」是收藏不是统计。
 * - sort_order：标签群组在侧栏与内容区的展示顺序（Eagle 群组行 ui-sortable
 *   拖拽排序落库）；标签 chip 在群组内仍按名称/使用数动态排序，不走此列。
 * - is_group：群组标记（Eagle 群组=容器，不是标签）。历史数据按六期分组模型
 *   推导——凡当作父级用过的标签回填为群组；群组行本身不进 chip 池。
 */
export const m028_tag_starred_sort: Migration = {
  version: 28,
  name: 'tag_starred_sort',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE tag_tags ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tag_tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tag_tags ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_tag_tags_starred ON tag_tags(starred);
      CREATE INDEX IF NOT EXISTS idx_tag_tags_is_group ON tag_tags(is_group);
      UPDATE tag_tags
        SET is_group = 1
        WHERE deleted_at IS NULL
          AND id IN (
            SELECT DISTINCT parent_id FROM tag_tags
            WHERE parent_id IS NOT NULL AND deleted_at IS NULL
          );
    `)
  }
}
