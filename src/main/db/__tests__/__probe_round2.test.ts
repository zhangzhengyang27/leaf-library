/**
 * 临时验证脚本（审查二轮）：跑完即删。
 * 1) advancedAst 的 INSTR + %通配% 是否恒 0 行
 * 2) PAGE_SORT_KEYS 的 modified/created 是否引用不存在列
 * 3) updatePhotos 是否静默丢弃 sourceUrl
 * 4) 标签软删后 photo_tags 是否显示裸 UUID + 批量取消标签失效
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

  it('1) advancedAst：INSTR 收到 %词% → 恒 0 行；同词的非 AST 分支能命中', () => {
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
    expect(countWhere(ast.whereSql, ast.params as never)).toBe(0) // 现状：应命中 1 却得 0
    expect(countWhere(plain.whereSql, plain.params as never)).toBe(1)
  })

  it('2) sort=modified / created → 表达式引用不存在的 modified_at', () => {
    let errM = ''
    try {
      photos.getPhotosPage({ where: 'deleted_at IS NULL', sort: 'modified', limit: 5 })
    } catch (e) {
      errM = (e as Error).message
    }
    let errC = ''
    try {
      photos.getPhotosPage({ where: 'deleted_at IS NULL', sort: 'created', limit: 5 })
    } catch (e) {
      errC = (e as Error).message
    }
    console.log('[probe2] modified →', errM, '| created →', errC)
    expect(errM).toMatch(/no such column/)
    expect(errC).toMatch(/no such column/)
    // 对照组：imported_at 正常
    expect(photos.getPhotosPage({ where: 'deleted_at IS NULL', sort: 'imported_at', limit: 5 }).items).toHaveLength(1)
  })

  it('3) updatePhotos 传 sourceUrl → 不写库（但调用方 toast 成功）', () => {
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

  it('4) 标签软删：素材标签显示裸 UUID，批量取消标签失效', () => {
    const t = tags.create('小猫')
    photos.addTagToPhotos([id], t.name)
    expect(photos.getPhotoById(id)!.tags).toEqual(['小猫'])
    tags.softDelete(t.id)
    const after = photos.getPhotoById(id)!.tags
    console.log('[probe4] tags after softDelete →', JSON.stringify(after))
    expect(after).toEqual([t.name.toLowerCase() === '小猫' ? t.id : after[0]]) // 裸 UUID 泄漏到 UI
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
