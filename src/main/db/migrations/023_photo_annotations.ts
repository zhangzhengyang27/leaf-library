import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 023: 标注 comments[]（Eagle 的招牌差异之一）。
 *
 * 与 `description`（注释）是**两个东西**：注释是一段说明文字，标注是"图里这一块"
 * 或"视频第几秒"上的一条批注。Eagle 侧图片用矩形批注 `{x,y,width,height,annotation}`
 * （最小 10×10）、视频用时间点笔记（`duration` 存 currentTime），既能筛选也能搜索，
 * 卡片上还有数量徽标。
 *
 * 一张表装两种形状，靠 CHECK 逼出"要么四个坐标都有、要么一个都没有"：
 * 只存一半坐标的脏行会让 overlay 画出一个压扁的框，而 SQL 里没人会去查这种组合。
 * 坐标是**源图像素**（不是 0..1 归一化）：与 Eagle 同口径，导入/导出素材时不用换算，
 * 缩放交给显示层。时间点用毫秒整数，与 duration_ms 同一单位。
 *
 * 不加外键：本库所有关联表（photo_tags / photo_album_items / photo_freeform_pos）
 * 都在删除路径上手写清理，加半个外键体系只会让两套规则并存。
 * 删除清理见 PhotoRepository.clearRecycleBin 里那一段（漏表的历史就在那行注释里）。
 */
export const m023_photo_annotations: Migration = {
  version: 23,
  name: 'photo_annotations',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_annotations (
        id          TEXT PRIMARY KEY,
        photo_id    TEXT    NOT NULL,
        body        TEXT    NOT NULL,
        x           REAL,
        y           REAL,
        w           REAL,
        h           REAL,
        at_ms       INTEGER,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        CHECK (
          (x IS NULL AND y IS NULL AND w IS NULL AND h IS NULL) OR
          (x IS NOT NULL AND y IS NOT NULL AND w IS NOT NULL AND h IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS idx_photo_annotations_photo
        ON photo_annotations(photo_id);
    `)
  }
}
