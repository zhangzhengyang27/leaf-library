/**
 * 破坏性数据路径 · PhotoRepository 删除分支（回收站双向 + 硬删清理）
 *
 * 与 repoFixes.test.ts 分工：那边钉「清空回收站的孤儿清理与计数回退」的历史 bug，
 * 这里钉删除路径本身的**守卫语义**——
 * - 软删是可逆的：deleted_at 落库即进回收站，restorePhotos 反向；重复软删 / 还原活跃行必须 no-op
 * - clearRecycleBin 是不可逆点：行真删、023 标注跟随清理、二次调用空转
 * - clearAllPhotos 是批量软删：已在回收站的行不得被改写 deleted_at
 * D-020「只删库内副本」的磁盘守卫在 PhotoDataStore（stores/__tests__/d020TrashGuard.test.ts），
 * repository 保持纯数据层。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'

describe('PhotoRepository · 软删 deletePhoto/deletePhotos（回收站入口）', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  const rowOf = (id: string): { deleted_at: number | null; updated_at: number } =>
    db.prepare(`SELECT deleted_at, updated_at FROM photo_photos WHERE id = ?`).get(id) as {
      deleted_at: number | null
      updated_at: number
    }

  it('软删落 deleted_at/updated_at：活跃列表消失、回收站出现', () => {
    const p = photos.addPhoto('/lib/a.png')
    const before = rowOf(p.id)
    expect(before.deleted_at).toBeNull()

    expect(photos.deletePhoto(p.id)).toBe(true)
    const after = rowOf(p.id)
    expect(after.deleted_at).not.toBeNull()
    expect(after.updated_at).toBeGreaterThanOrEqual(before.updated_at)
    expect(photos.getPhotos().some((x) => x.id === p.id)).toBe(false)
    expect(photos.getRecycleBinPhotos().map((x) => x.id)).toEqual([p.id])
  })

  it('重复软删返回 false（deleted_at IS NULL 守卫），deleted_at 不被改写', () => {
    const p = photos.addPhoto('/lib/a.png')
    expect(photos.deletePhoto(p.id)).toBe(true)
    const first = rowOf(p.id).deleted_at

    expect(photos.deletePhoto(p.id)).toBe(false)
    expect(rowOf(p.id).deleted_at).toBe(first)
    // 不存在的 id 同样安全
    expect(photos.deletePhoto('no-such-id')).toBe(false)
  })

  it('deletePhotos 混合批次只数活跃行；空数组直接返回 0', () => {
    const live = photos.addPhoto('/lib/live.png').id
    const gone = photos.addPhoto('/lib/gone.png').id
    photos.deletePhotos([gone])

    // 活跃行计入，已软删行与不存在的 id 不计入
    expect(photos.deletePhotos([live, gone, 'no-such-id'])).toBe(1)
    expect(photos.deletePhotos([])).toBe(0)
    expect(photos.getRecycleBinPhotos().map((p) => p.id).sort()).toEqual([gone, live].sort())
  })
})

describe('PhotoRepository · restorePhotos（回收站出口）', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  const rowOf = (id: string): { deleted_at: number | null } =>
    db.prepare(`SELECT deleted_at FROM photo_photos WHERE id = ?`).get(id) as {
      deleted_at: number | null
    }

  it('只还原软删行：deleted_at 清空、回到活跃列表并离开回收站', () => {
    const a = photos.addPhoto('/lib/a.png').id
    const b = photos.addPhoto('/lib/b.png').id
    const c = photos.addPhoto('/lib/c.png').id // 保持活跃
    photos.deletePhotos([a, b])

    // 活跃行 c 与不存在的 id 不计入还原数
    expect(photos.restorePhotos([a, c, 'no-such-id'])).toBe(1)
    expect(rowOf(a).deleted_at).toBeNull()
    expect(photos.getPhotos().map((p) => p.id)).toContain(a)
    expect(photos.getRecycleBinPhotos().map((p) => p.id)).toEqual([b])
  })

  it('还原活跃行与空数组都是 no-op', () => {
    const a = photos.addPhoto('/lib/a.png').id
    expect(photos.restorePhotos([a])).toBe(0)
    expect(photos.restorePhotos([])).toBe(0)
    expect(photos.getRecycleBinPhotos()).toEqual([])
  })
})

describe('PhotoRepository · 回收站视图排序', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('getRecycleBinPhotos 按 deleted_at DESC：后删的排前面', async () => {
    const a = photos.addPhoto('/lib/a.png').id
    const b = photos.addPhoto('/lib/b.png').id
    photos.deletePhoto(a)
    // deleted_at 精确到毫秒：隔开一点，避免同毫秒并列时顺序不确定
    await new Promise((r) => setTimeout(r, 5))
    photos.deletePhoto(b)

    expect(photos.getRecycleBinPhotos().map((p) => p.id)).toEqual([b, a])
  })
})

describe('PhotoRepository · clearAllPhotos（全库批量软删）', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('活跃行全部进回收站；已在回收站的行 deleted_at 不被改写', () => {
    const live = photos.addPhoto('/lib/live.png').id
    const trashed = photos.addPhoto('/lib/trashed.png').id
    photos.deletePhoto(trashed)
    const original = db.prepare(`SELECT deleted_at AS d FROM photo_photos WHERE id = ?`).get(trashed) as {
      d: number
    }

    photos.clearAllPhotos()
    expect(
      (db.prepare(`SELECT deleted_at AS d FROM photo_photos WHERE id = ?`).get(live) as { d: number | null })
        .d
    ).not.toBeNull()
    // WHERE deleted_at IS NULL 守卫：回收站里的行不挨这一刀
    expect(
      (db.prepare(`SELECT deleted_at AS d FROM photo_photos WHERE id = ?`).get(trashed) as { d: number })
        .d
    ).toBe(original.d)
    expect(photos.getPhotos()).toEqual([])
    expect(photos.getRecycleBinPhotos().length).toBe(2)
  })
})

describe('PhotoRepository · clearRecycleBin（不可逆点：硬删 + 关联表）', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  const countRows = (table: string, photoId: string): number =>
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE photo_id = ?`)
        .get(photoId) as { n: number }
    ).n

  const insertAnnotation = (photoId: string, id: string): void => {
    const ts = Date.now()
    db.prepare(
      `INSERT INTO photo_annotations (id, photo_id, body, x, y, w, h, at_ms, created_at, updated_at)
       VALUES (?, ?, '矩形批注', 1, 2, 10, 10, NULL, ?, ?)`
    ).run(id, photoId, ts, ts)
  }

  it('硬删后行消失并返回被清理 id；二次调用返回 []（幂等）', () => {
    const a = photos.addPhoto('/lib/a.png').id
    const b = photos.addPhoto('/lib/b.png').id
    photos.deletePhotos([a, b])

    const purged = photos.clearRecycleBin()
    expect([...purged].sort()).toEqual([a, b].sort())
    expect(photos.getPhotoById(a)).toBeUndefined()
    expect(photos.getPhotoById(b)).toBeUndefined()
    expect(photos.getRecycleBinPhotos()).toEqual([])
    // 没有第二次可清的东西
    expect(photos.clearRecycleBin()).toEqual([])
  })

  it('023 标注跟随硬删清理；存活素材的标注不受牵连', () => {
    const doomed = photos.addPhoto('/lib/doomed.png').id
    const survivor = photos.addPhoto('/lib/survivor.png').id
    insertAnnotation(doomed, 'd-1')
    insertAnnotation(survivor, 's-1')

    photos.deletePhotos([doomed])
    photos.clearRecycleBin()

    // 标注表没有外键兜底，漏清就剩指向不存在素材的批注（023 注释里点名的坑）
    expect(countRows('photo_annotations', doomed)).toBe(0)
    expect(countRows('photo_annotations', survivor)).toBe(1)
  })

  // 本条立项时是**现状 bug**的占位（it.skip）：clearRecycleBin 的清理名单只有
  // photo_tags / photo_album_items / photo_freeform_pos / photo_annotations，
  // 没有 photo_vectors（021），而清理钩子 ClipEmbeddingService.removeVector 全库无调用方——
  // 孤儿向量会被 searchByVector（allByModel）当真命中，以图搜图返回已硬删素材的幽灵 id。
  // 2026-09-25 在事务里补上 DELETE FROM photo_vectors 并摘掉 skip（复盘教训：docstring
  // 声称清「孤儿语义向量」，事务体里从来没有这张表）。
  it('清空回收站应连带清理 photo_vectors 孤儿行', () => {
    const doomed = photos.addPhoto('/lib/v-doomed.png').id
    db.prepare(
      `INSERT INTO photo_vectors (photo_id, model, dim, vec, created_at) VALUES (?, 'test-model', 2, ?, ?)`
    ).run(doomed, Buffer.from(new Float32Array([1, 0]).buffer), Date.now())

    photos.deletePhotos([doomed])
    photos.clearRecycleBin()
    expect(countRows('photo_vectors', doomed)).toBe(0)
  })
})
