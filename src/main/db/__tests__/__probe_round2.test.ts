/**
 * 审查二轮的四个现场取证（原本跑完即删，留成回归桩）。
 * 1) advancedAst 的 INSTR 曾把 %通配% 原样喂进去 → 恒 0 行
 * 2) PAGE_SORT_KEYS 的 modified/created 曾引用不存在的 modified_at
 * 3) updatePhotos 只吃评分/描述/收藏/最近查看，sourceUrl 被忽略（要走单张 updatePhoto）
 * 4) 标签软删后 photo_tags 曾把裸 UUID 透给 UI
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { TagRepository } from '../repos/TagRepository'
import { buildSmartAlbumWhere } from '../smartAlbumRules'

describe('__probe 二轮验证', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let tags: TagRepository
  let id = ''

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    tags = new TagRepository(db)
    id = photos.addPhoto('/tmp/cat food.png', { width: 10, height: 20 }).id
  })
  afterEach(() => closeTestDb(db))

  const countWhere = (where: string, params: unknown[]): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM photo_photos WHERE ${where}`).get(...params) as { n: number })
      .n

  it('1) advancedAst 与同词的非 AST 分支命中同一张（曾经恒 0 行）', () => {
    const ast = buildSmartAlbumWhere({
      searchKeyword: 'cat',
      searchScopes: ['name'],
      advancedAst: { type: 'term', value: 'cat' }
    } as never)
    const plain = buildSmartAlbumWhere({ searchKeyword: 'cat', searchScopes: ['name'] } as never)
    console.log('[probe1] ast sql:', ast.whereSql)
    console.log(
      '[probe1] counts → ast:',
      countWhere(ast.whereSql, ast.params as never),
      'plain:',
      countWhere(plain.whereSql, plain.params as never)
    )
    expect(countWhere(ast.whereSql, ast.params as never)).toBe(1)
    expect(countWhere(plain.whereSql, plain.params as never)).toBe(1)
  })

  it('2) sort=modified / created 走得到列（曾经 no such column: modified_at）', () => {
    // 抛错即红：曾经这两个 key 生成 modified_at，表里没有这列
    expect(
      photos.getPhotosPage({ where: 'deleted_at IS NULL', sort: 'modified', limit: 5 }).items
    ).toHaveLength(1)
    expect(
      photos.getPhotosPage({ where: 'deleted_at IS NULL', sort: 'created', limit: 5 }).items
    ).toHaveLength(1)
    // 对照组：imported_at 正常
    expect(
      photos.getPhotosPage({ where: 'deleted_at IS NULL', sort: 'imported_at', limit: 5 }).items
    ).toHaveLength(1)
  })

  it('3) updatePhotos 是四字段窄接口：sourceUrl 走单张通道才落库', () => {
    photos.updatePhotos([id], { sourceUrl: 'https://example.com' } as never)
    const row = db.prepare('SELECT source_url FROM photo_photos WHERE id = ?').get(id) as {
      source_url: string | null
    }
    console.log('[probe3] source_url after updatePhotos →', JSON.stringify(row.source_url))
    expect(row.source_url).toBeNull()
    // 单张 updatePhoto 是否支持？
    let singleErr = 'ok'
    try {
      photos.updatePhoto(id, { sourceUrl: 'https://example.com' } as never)
    } catch (e) {
      singleErr = (e as Error).message
    }
    const row2 = db.prepare('SELECT source_url FROM photo_photos WHERE id = ?').get(id) as {
      source_url: string | null
    }
    console.log('[probe3] via updatePhoto →', JSON.stringify(row2.source_url), singleErr)
  })

  it('4) 标签软删后不再把裸 UUID 透给 UI', () => {
    const t = tags.create('小猫')
    photos.addTagToPhotos([id], t.name)
    expect(photos.getPhotoById(id)!.tags).toEqual(['小猫'])
    tags.softDelete(t.id)
    const after = photos.getPhotoById(id)!.tags
    console.log('[probe4] tags after softDelete →', JSON.stringify(after))
    // 曾经这里返回 [tagId]：软删标签的名字没了，UI 直接显示 UUID
    expect(after).toEqual([])
    const usage = db.prepare('SELECT usage_count, deleted_at FROM tag_tags WHERE id = ?').get(t.id)
    console.log('[probe4] tag row →', JSON.stringify(usage))
    const removed = photos.removeTagFromPhotos([id], '小猫')
    console.log('[probe4] removeTagFromPhotos("小猫") →', removed)
    const bindings = (
      db.prepare('SELECT COUNT(*) AS n FROM photo_tags WHERE photo_id = ?').get(id) as { n: number }
    ).n
    console.log('[probe4] photo_tags rows left →', bindings)
  })
})
