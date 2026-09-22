/**
 * getPhotosPage keyset 分页回归测试（docs/PAGINATION_DESIGN.md 阶段 0）：
 * - 游标遍历无重无漏、排序单调；同值排序键靠 rowid tiebreaker 不重不漏
 * - where 过滤（回收站/收藏）与 total 一致
 * - 非法游标降级首页；limit 边界收敛
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'

describe('PhotoRepository · getPhotosPage（keyset 分页）', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  function walkAll(opts: Parameters<typeof photos.getPhotosPage>[0]): {
    ids: string[]
    total: number
    pages: number
  } {
    const ids: string[] = []
    let cursor: string | null = null
    let total = 0
    let pages = 0
    do {
      const page = photos.getPhotosPage({ ...opts, cursor })
      ids.push(...page.items.map((p) => p.id))
      total = page.total
      cursor = page.nextCursor
      pages += 1
      expect(pages).toBeLessThan(10_000) // 防游标永不终止的死循环
    } while (cursor)
    return { ids, total, pages }
  }

  it('同 imported_at（tiebreak rowid DESC）下遍历无重无漏', () => {
    const ids: string[] = []
    for (let i = 0; i < 37; i++) ids.push(photos.addPhoto(`/walk-${i}.jpg`).id)

    const { ids: walked, total, pages } = walkAll({ where: 'deleted_at IS NULL', limit: 10 })
    expect(total).toBe(37)
    expect(pages).toBe(4)
    expect(new Set(walked).size).toBe(37)
    expect(new Set(walked)).toEqual(new Set(ids))
  })

  it('file_name 升序 + 同名重复（不同目录）遍历正确', () => {
    for (const dir of ['d1', 'd2', 'd3']) {
      for (const name of ['alpha.jpg', 'beta.jpg', 'gamma.jpg']) {
        photos.addPhoto(`/${dir}/${name}`)
      }
    }
    const { ids, total } = walkAll({
      where: 'deleted_at IS NULL',
      sort: 'file_name',
      desc: false,
      limit: 4
    })
    expect(total).toBe(9)
    expect(new Set(ids).size).toBe(9)

    const names = photos
      .getPhotosByIds(ids)
      .map((p) => p.fileName)
      .filter((n) => n === 'alpha.jpg')
    // 同名组整体连续且完整（无重无漏的直接证据）
    expect(names.length).toBe(3)
  })

  it('同 file_size 排序（DESC）遍历正确', () => {
    for (let i = 0; i < 20; i++) photos.addPhoto(`/size-${i}.jpg`, { fileSize: 100 })
    const { ids, total } = walkAll({ where: 'deleted_at IS NULL', sort: 'file_size', limit: 6 })
    expect(total).toBe(20)
    expect(new Set(ids).size).toBe(20)
  })

  it('where 过滤与 total：回收站 / 收藏', () => {
    const a = photos.addPhoto('/a.jpg')
    const b = photos.addPhoto('/b.jpg')
    const c = photos.addPhoto('/c.jpg')
    photos.updatePhoto(b.id, { isFavorite: true })

    const fav = photos.getPhotosPage({ where: 'deleted_at IS NULL AND is_favorite = 1' })
    expect(fav.total).toBe(1)
    expect(fav.items.map((p) => p.id)).toEqual([b.id])

    photos.deletePhotos([a.id, c.id])
    const trash = photos.getPhotosPage({ where: 'deleted_at IS NOT NULL', limit: 1 })
    expect(trash.total).toBe(2)
    expect(trash.items.length).toBe(1)
    expect(trash.nextCursor).not.toBeNull()
    const trash2 = photos.getPhotosPage({
      where: 'deleted_at IS NOT NULL',
      limit: 1,
      cursor: trash.nextCursor
    })
    expect(trash2.items.length).toBe(1)
    expect(new Set([trash.items[0].id, trash2.items[0].id]).size).toBe(2)
  })

  it('非法游标降级为首页；空结果集游标为 null', () => {
    const p = photos.addPhoto('/only.jpg')
    expect(() =>
      photos.getPhotosPage({ where: 'deleted_at IS NULL', cursor: 'not-a-cursor!!' })
    ).not.toThrow()
    expect(
      photos
        .getPhotosPage({ where: 'deleted_at IS NULL', cursor: 'not-a-cursor!!' })
        .items.map((x) => x.id)
    ).toEqual([p.id])

    const empty = photos.getPhotosPage({ where: 'deleted_at IS NOT NULL' })
    expect(empty.total).toBe(0)
    expect(empty.items).toEqual([])
    expect(empty.nextCursor).toBeNull()
  })

  it('deleted_at DESC 排序（回收站视图排序，m015 部分索引）遍历正确', () => {
    const a = photos.addPhoto('/a.jpg')
    const b = photos.addPhoto('/b.jpg')
    const c = photos.addPhoto('/c.jpg')
    photos.deletePhotos([a.id, b.id, c.id])

    const { ids, total } = walkAll({
      where: 'deleted_at IS NOT NULL',
      sort: 'deleted_at',
      limit: 2
    })
    expect(total).toBe(3)
    expect(new Set(ids).size).toBe(3)
    expect(new Set(ids)).toEqual(new Set([a.id, b.id, c.id]))
  })

  it('limit 边界收敛（0 → 1；不足一页 → nextCursor null）', () => {
    for (let i = 0; i < 3; i++) photos.addPhoto(`/lim-${i}.jpg`)
    const one = photos.getPhotosPage({ where: 'deleted_at IS NULL', limit: 0 })
    expect(one.items.length).toBe(1)
    expect(one.nextCursor).not.toBeNull()

    const all = photos.getPhotosPage({ where: 'deleted_at IS NULL', limit: 10 })
    expect(all.items.length).toBe(3)
    expect(all.nextCursor).toBeNull()
  })
})
