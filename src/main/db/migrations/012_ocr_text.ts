import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 012: OCR 文字搜索（F12，对齐 Eagle 图片内文字搜索）。
 *
 * photo_photos.ocr_text：识别出的文本（NULL=未识别/未启用）。
 * tesseract.js（chi_sim+eng）识别由 OcrService 在缩略图完成后低优先级执行。
 */
export const m012_ocr_text: Migration = {
  version: 12,
  name: 'ocr_text',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_photos ADD COLUMN ocr_text TEXT;
    `)
  }
}
