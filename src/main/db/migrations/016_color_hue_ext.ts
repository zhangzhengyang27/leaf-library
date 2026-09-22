import type Database from 'better-sqlite3'
import type { Migration } from '.'
import { extOfFileName, hueBucketOf } from '../../../shared/colorHue'

/**
 * 016: 分页化阶段 3 筛选下推的落库前提。
 *
 * - color_hue：color_dominant 的色相桶（shared/colorHue.hueBucketOf），
 *   颜色筛选维度下推 SQL（JS 的 HSV 归桶无法在 SQLite 内复算，落列是唯一正解）。
 * - file_ext：小写扩展名（无扩展名 = ''），格式多选/排除与 extension 排序的
 *   下推列（SQLite 内反向找 '.' 不现实，导入时在 JS 落列）。
 *
 * 写入钩子：photoRepository.addPhoto/importMany（file_ext）、
 * updateProcessingResult/updateBackfilledPalette（color_hue）。
 * 本迁移只回填存量行；触发器不引入（写入点集中且少）。
 */
export const m016_color_hue_ext: Migration = {
  version: 16,
  name: 'color_hue_ext',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_photos ADD COLUMN color_hue TEXT;
      ALTER TABLE photo_photos ADD COLUMN file_ext TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_photo_photos_color_hue
        ON photo_photos(color_hue) WHERE color_hue IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_photo_photos_file_ext
        ON photo_photos(file_ext) WHERE file_ext != '';
    `)

    // JS 回填存量行（色相桶需要 HSV 计算；单事务批量更新）
    const rows = db
      .prepare(`SELECT id, color_dominant, file_name FROM photo_photos`)
      .all() as Array<{ id: string; color_dominant: string | null; file_name: string }>
    const update = db.prepare(
      `UPDATE photo_photos SET color_hue = ?, file_ext = ? WHERE id = ?`
    )
    const tx = db.transaction(() => {
      for (const row of rows) {
        const hue =
          row.color_dominant && row.color_dominant !== 'null' ? hueBucketOf(row.color_dominant) : null
        update.run(hue, extOfFileName(row.file_name), row.id)
      }
    })
    tx()
  },
}
