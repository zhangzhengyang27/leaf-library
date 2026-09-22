import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 014: FTS5 全文索引（photo_fts），替代 searchPhotos 的 LIKE '%kw%' 全表扫描。
 *
 * - tokenize='trigram'：子串匹配语义（与旧 LIKE '%kw%' 等价），且对 CJK 有效
 *   （unicode61 会把连续汉字并成一个 token，无法子串命中）。trigram 最短可匹配
 *   长度为 3 字符，1-2 字符查询由 PhotoRepository.searchPhotos 回退 LIKE 路径。
 * - content='photo_photos'（external content）：文本不重复存储；同步靠三个触发器
 *   （INSERT / DELETE / UPDATE OF 被索引列），覆盖一切写入路径，无需业务代码参与。
 * - deleted_at 不参与索引：软删行同样进 FTS，由查询侧 `deleted_at IS NULL` 过滤；
 *   清空回收站的硬删行由 DELETE 触发器从索引移除。
 */
export const m014_photo_fts: Migration = {
  version: 14,
  name: 'photo_fts',
  up(db: Database.Database) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS photo_fts USING fts5(
        file_name,
        description,
        ocr_text,
        content='photo_photos',
        content_rowid='rowid',
        tokenize='trigram'
      );

      CREATE TRIGGER IF NOT EXISTS photo_fts_ai AFTER INSERT ON photo_photos BEGIN
        INSERT INTO photo_fts(rowid, file_name, description, ocr_text)
        VALUES (new.rowid, new.file_name, new.description, new.ocr_text);
      END;

      CREATE TRIGGER IF NOT EXISTS photo_fts_ad AFTER DELETE ON photo_photos BEGIN
        INSERT INTO photo_fts(photo_fts, rowid, file_name, description, ocr_text)
        VALUES ('delete', old.rowid, old.file_name, old.description, old.ocr_text);
      END;

      CREATE TRIGGER IF NOT EXISTS photo_fts_au AFTER UPDATE OF file_name, description, ocr_text ON photo_photos BEGIN
        INSERT INTO photo_fts(photo_fts, rowid, file_name, description, ocr_text)
        VALUES ('delete', old.rowid, old.file_name, old.description, old.ocr_text);
        INSERT INTO photo_fts(rowid, file_name, description, ocr_text)
        VALUES (new.rowid, new.file_name, new.description, new.ocr_text);
      END;

      INSERT INTO photo_fts(rowid, file_name, description, ocr_text)
      SELECT rowid, file_name, description, ocr_text FROM photo_photos;
    `)
  }
}
