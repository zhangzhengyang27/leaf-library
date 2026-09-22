import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 018: 文档正文抽取落库（officeparser 主线，D 轴「可检索」）。
 *
 * - doc_text：从 docx/xlsx/pptx/odf/rtf/epub/pdf 等抽出的纯文本。
 *   语义与 ocr_text 对齐——NULL = 未抽取（待处理），'' = 抽过但没文本/抽取失败已认账。
 * - photo_fts 是 external content 表（014），FTS5 不能 ALTER 列，
 *   所以必须「删触发器 → 删索引表 → 带新列重建 → rebuild 回填」。
 *   DROP 外部内容表不会动 photo_photos 本身的数据。
 * - 用 rebuild 而不是 014 那种手写 INSERT…SELECT：索引与内容的一致性由 SQLite 保证。
 */
export const m018_doc_text: Migration = {
  version: 18,
  name: 'doc_text',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_photos ADD COLUMN doc_text TEXT;

      DROP TRIGGER IF EXISTS photo_fts_ai;
      DROP TRIGGER IF EXISTS photo_fts_ad;
      DROP TRIGGER IF EXISTS photo_fts_au;
      DROP TABLE IF EXISTS photo_fts;

      CREATE VIRTUAL TABLE photo_fts USING fts5(
        file_name,
        description,
        ocr_text,
        doc_text,
        content='photo_photos',
        content_rowid='rowid',
        tokenize='trigram'
      );

      CREATE TRIGGER photo_fts_ai AFTER INSERT ON photo_photos BEGIN
        INSERT INTO photo_fts(rowid, file_name, description, ocr_text, doc_text)
        VALUES (new.rowid, new.file_name, new.description, new.ocr_text, new.doc_text);
      END;

      CREATE TRIGGER photo_fts_ad AFTER DELETE ON photo_photos BEGIN
        INSERT INTO photo_fts(photo_fts, rowid, file_name, description, ocr_text, doc_text)
        VALUES ('delete', old.rowid, old.file_name, old.description, old.ocr_text, old.doc_text);
      END;

      CREATE TRIGGER photo_fts_au AFTER UPDATE OF file_name, description, ocr_text, doc_text
      ON photo_photos BEGIN
        INSERT INTO photo_fts(photo_fts, rowid, file_name, description, ocr_text, doc_text)
        VALUES ('delete', old.rowid, old.file_name, old.description, old.ocr_text, old.doc_text);
        INSERT INTO photo_fts(rowid, file_name, description, ocr_text, doc_text)
        VALUES (new.rowid, new.file_name, new.description, new.ocr_text, new.doc_text);
      END;

      INSERT INTO photo_fts(photo_fts) VALUES('rebuild');
    `)
  }
}
