/**
 * 024: 音频事实列（P1 波形 + BPM）
 *
 * waveform 是 400 B 一条的降采样包络，不随列表下发（进列表会让首屏 payload 爆掉），
 * 打开音频预览时按 id 单独取；bpm 由 ffmpegAudio 的分析结果回填。
 */
import type Database from 'better-sqlite3'
import type { Migration } from '.'

export const m024_audio_facts: Migration = {
  version: 24,
  name: 'audio_facts',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_photos ADD COLUMN waveform BLOB;
      ALTER TABLE photo_photos ADD COLUMN bpm REAL;
    `)
  }
}
