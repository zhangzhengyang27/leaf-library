import type Database from 'better-sqlite3'
import { normalizeOcrText } from '@shared/ocrText'
import type { Migration } from '.'

/**
 * 020: 回填存量 OCR 文本的汉字间空白（chi_sim 会在相邻汉字间插空格）。
 *
 * photo_fts 是 external-content 的 trigram 表，且 018 建的触发器覆盖
 * `AFTER UPDATE OF ... ocr_text`，所以逐行 UPDATE 会自动把索引同步过去，
 * 不需要再 rebuild。只改写「归一化后确实变了」的行。
 */
export const m020_normalize_ocr_text: Migration = {
  version: 20,
  name: 'normalize_ocr_text',
  up(db: Database.Database) {
    const rows = db
      .prepare(`SELECT id, ocr_text FROM photo_photos WHERE ocr_text IS NOT NULL AND ocr_text <> ''`)
      .all() as Array<{ id: string; ocr_text: string }>
    const write = db.prepare(`UPDATE photo_photos SET ocr_text = ? WHERE id = ?`)
    for (const r of rows) {
      const next = normalizeOcrText(r.ocr_text)
      if (next !== r.ocr_text) write.run(next, r.id)
    }
  }
}
