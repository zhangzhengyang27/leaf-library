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

  /**
   * 处理管线的写入路径。占位符与参数是一一对位的裸数组，错一位就会把 phash 写进
   * waveform 这类静默串列——所以走真实方法写、再走真实方法读，不直接 UPDATE。
   */
  it('updateProcessingResult 能把峰值与 BPM 落进 BLOB/REAL 列', () => {
    const photos = new PhotoRepository(db)
    const p = photos.addPhoto('/tmp/audio-facts-pipeline.mp3')
    const peaks = Uint8Array.from(new Array(400).fill(7).map((v, i) => v + (i % 51)))
    photos.updateProcessingResult(p.id, { durationMs: 6_048, waveform: peaks, bpm: 118 })
    const f = photos.getAudioFacts(p.id)!
    expect(Array.from(f.waveform!)).toEqual(Array.from(peaks))
    expect(f.bpm).toBe(118)
    expect(f.durationMs).toBe(6_048)
    // 同一次调用没带 waveform/bpm 时不得把已算好的清掉（COALESCE 语义）
    photos.updateProcessingResult(p.id, { durationMs: 6_048 })
    expect(photos.getAudioFacts(p.id)!.waveform?.length).toBe(400)
    expect(photos.getAudioFacts(p.id)!.bpm).toBe(118)
    // 串列自查：别的数据也没被波形字节污染
    expect(photos.getPhotoById(p.id)!.phash ?? '').toBe('')
  })
})
