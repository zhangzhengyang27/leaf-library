/**
 * 022：视频实测帧率的落库与回填。
 *
 * 覆盖三条会静默失效的路径：
 *  1. 迁移只在存量库上加列（老行必须是 NULL，不能被当成 0 帧）；
 *  2. updateProcessingResult 的 fps 位序（SQL 是位置参数，错位会把帧率写进 hash）；
 *  3. 回填查询的谓词（把图片/待处理行捞进来 = 白起一堆 ffmpeg 进程）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import type DatabaseType from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { migrations } from '../migrations'
import { PhotoRepository } from '../repos/PhotoRepository'

let db: DatabaseType.Database
let photos: PhotoRepository

beforeEach(() => {
  db = createTestDb()
  photos = new PhotoRepository(db)
})
afterEach(() => closeTestDb(db))

const video = (name: string) => photos.addPhoto(`/lib/videos/${name}`, { kind: 'video' })

describe('落库', () => {
  it('管线回填 fps 后能从 Photo 上读回来', () => {
    const p = video('a.mp4')
    expect(p.fps).toBeUndefined()
    photos.updateProcessingResult(p.id, { durationMs: 1000, fps: 23.98, width: 160, height: 120 })
    expect(photos.getPhotoById(p.id)?.fps).toBe(23.98)
  })

  it('fps 的位序没串到别的列（时长/宽高/哈希各自归位）', () => {
    const p = video('order.mp4')
    photos.updateProcessingResult(p.id, {
      durationMs: 1500,
      fps: 60,
      width: 320,
      height: 240,
      hash: 'deadbeef'
    })
    const got = photos.getPhotoById(p.id)
    expect([got?.durationMs, got?.fps, got?.width, got?.height, got?.hash]).toEqual([
      1500,
      60,
      320,
      240,
      'deadbeef'
    ])
  })

  it('图片分支不传 fps：既不写值也不把已有值清掉（COALESCE）', () => {
    const p = video('keep.mp4')
    photos.updateProcessingResult(p.id, { fps: 25 })
    photos.updateProcessingResult(p.id, { colorDominant: '#ff0000' })
    expect(photos.getPhotoById(p.id)?.fps).toBe(25)
  })

  it('探到 null（无视频流/探测失败）也不覆盖旧值', () => {
    const p = video('probe-fail.mp4')
    photos.updateProcessingResult(p.id, { fps: 30 })
    photos.updateProcessingResult(p.id, { durationMs: 100, fps: null })
    expect(photos.getPhotoById(p.id)?.fps).toBe(30)
  })
})

describe('存量回填', () => {
  it('只捞「视频 + 处理完成 + 无 fps + 未删除」的行', () => {
    const done = video('done.mp4')
    photos.updateProcessingResult(done.id, { durationMs: 1000 }) // thumb_status → 1，fps 仍空
    const pending = video('pending.mp4') // 待处理：管线自己会探，回填不该抢
    const img = photos.addPhoto('/lib/pic.jpg')
    photos.updateProcessingResult(img.id, {})
    const noFpsAudio = photos.addPhoto('/lib/a.m4a', { kind: 'audio' })
    photos.updateProcessingResult(noFpsAudio.id, { durationMs: 500 })
    const trashed = video('trashed.mp4')
    photos.updateProcessingResult(trashed.id, { durationMs: 10 })
    photos.deletePhoto(trashed.id)

    expect(photos.getFpsBackfillPending(10).map((r) => r.id)).toEqual([done.id])
    expect(pending.thumbStatus).toBe(0)
  })

  it('limit 生效（一批做不完下一轮继续）', () => {
    const ids: string[] = []
    for (const n of ['v1.mp4', 'v2.mp4', 'v3.mp4']) {
      const p = video(n)
      photos.updateProcessingResult(p.id, { durationMs: 10 })
      ids.push(p.id)
    }
    expect(photos.getFpsBackfillPending(2)).toHaveLength(2)
    expect(photos.getFpsBackfillPending(0)).toHaveLength(0)
    expect(ids).toHaveLength(3)
  })

  it('写入只在行内仍为空时生效，且写完就不再被捞出来', () => {
    const p = video('backfill.mp4')
    photos.updateProcessingResult(p.id, { durationMs: 10 })
    photos.updateBackfilledFps(p.id, 24)
    expect(photos.getPhotoById(p.id)?.fps).toBe(24)
    photos.updateBackfilledFps(p.id, 30) // 已经有值：不覆盖
    expect(photos.getPhotoById(p.id)?.fps).toBe(24)
    expect(photos.getFpsBackfillPending(10).map((r) => r.id)).not.toContain(p.id)
  })
})

describe('迁移 022（存量库升级）', () => {
  const upTo21 = migrations.filter((m) => m.version < 22)
  const m22 = migrations.find((m) => m.version === 22)

  it('v21 没有 fps 列；升级后有列，且老行是 NULL 而不是 0', () => {
    expect(m22).toBeTruthy()
    const legacy = new Database(':memory:')
    legacy.exec(`CREATE TABLE meta (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`)
    for (const m of upTo21) {
      legacy.transaction(() => {
        m.up(legacy)
        legacy.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(m.version, 1)
      })()
    }
    const has = (): number =>
      (
        legacy
          .prepare(`SELECT COUNT(*) c FROM pragma_table_info('photo_photos') WHERE name = 'fps'`)
          .get() as { c: number }
      ).c
    expect(has()).toBe(0)

    m22?.up(legacy)
    expect(has()).toBe(1)

    const repo = new PhotoRepository(legacy)
    const old = repo.addPhoto('/legacy/old.mp4', { kind: 'video' })
    repo.updateProcessingResult(old.id, { durationMs: 900 })
    const row = legacy.prepare('SELECT fps FROM photo_photos WHERE id = ?').get(old.id) as {
      fps: number | null
    }
    expect(row.fps).toBeNull()
    // NULL 不能被映射成 0：0 帧会让步长跑成 Infinity
    expect(repo.getPhotoById(old.id)?.fps).toBeUndefined()
    legacy.close()
  })
})
