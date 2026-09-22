import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'

let db: Database.Database
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => closeTestDb(db))

describe('024 音频事实：波形/BPM 列与按 id 取用', () => {
  it('迁移后 photo_photos 有 waveform/bpm 列，空库查不存在的 id 返回 null', () => {
    const cols = db.prepare(`PRAGMA table_info(photo_photos)`).all().map((r: any) => r.name)
    expect(cols).toContain('waveform')
    expect(cols).toContain('bpm')
    const photos = new PhotoRepository(db)
    expect(photos.getAudioFacts('00000000-0000-0000-0000-000000000000')).toBe(null)
  })
  it('写入 waveform/BPM 后能取回，peaks 字节与 duration 一致', () => {
    const photos = new PhotoRepository(db)
    const p = photos.addPhoto('/tmp/audio-facts-probe.mp3')
    const peaks = Uint8Array.from([0, 40, 120, 255, 90])
    db.prepare(`UPDATE photo_photos SET kind='audio', waveform=?, bpm=?, duration_ms=? WHERE id=?`)
      .run(peaks, 128, 34_500, p.id)
    const f = photos.getAudioFacts(p.id)!
    expect(Array.from(f.waveform!)).toEqual([0, 40, 120, 255, 90])
    expect(f.bpm).toBe(128)
    expect(f.durationMs).toBe(34500)
    // 非音频素材不应给事实（audioFactsForPhoto 的 kind 门槛）
    db.prepare(`UPDATE photo_photos SET kind='file' WHERE id=?`).run(p.id)
    expect(photos.getPhotoById(p.id)!.kind).toBe('file')
  })
})
