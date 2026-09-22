/**
 * 2026-09-18 审查修复回归测试：
 * - P0-2 游标安全：渲染层可控的 e（键表达式）字段退役——注入载荷不得执行，
 *   游标只携带值；键值数量与排序键不符时降级首页
 * - P1-1 tagNamesExact：NOT IN 占位符必须配齐绑定参数（旧实现直接 RangeError）
 * - 不变量：buildSmartAlbumWhere 产出的 whereSql 占位符数 == params 数
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository, type PageSortCol } from '../repos/PhotoRepository'
import { encodePageCursor, decodePageCursor } from '../pageCursor'
import { buildSmartAlbumWhere, type SmartAlbumRules } from '../smartAlbumRules'

describe('P0-2 · 分页游标安全', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    // 造一批素材
    for (let i = 0; i < 30; i++) {
      photos.addPhoto(`/tmp/p0-2-${i}.png`, { width: 10 + i, height: 20 })
    }
  })
  afterEach(() => closeTestDb(db))

  it('游标携带恶意 e（SQL 表达式）不影响查询：e 字段被忽略，按本次 sort 键续页', () => {
    const first = photos.getPhotosPage({
      where: 'deleted_at IS NULL',
      sort: 'imported_at',
      limit: 5
    })
    expect(first.nextCursor).not.toBeNull()
    const real = decodePageCursor(first.nextCursor!)!
    // 构造渲染层注入载荷：WHERE 内子查询探测 photo_photos 行数
    const malicious = encodePageCursor({
      ...real,
      e: [
        "(CASE WHEN (SELECT COUNT(*) FROM photo_photos) > 0 THEN imported_at ELSE 1/0 END)"
      ]
    })
    // 不得抛错、不得执行注入表达式；e 被忽略后按真实 ks 正常续页
    const page = photos.getPhotosPage({
      where: 'deleted_at IS NULL',
      sort: 'imported_at',
      limit: 5,
      cursor: malicious
    })
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.length).toBeLessThanOrEqual(5)
    // 与不携带 e 的干净游标结果完全一致
    const clean = photos.getPhotosPage({
      where: 'deleted_at IS NULL',
      sort: 'imported_at',
      limit: 5,
      cursor: encodePageCursor(real)
    })
    expect(page.items.map((p) => p.id)).toEqual(clean.items.map((p) => p.id))
  })

  it('键值数量与排序键数量不符（旧格式/跨 sort 复用/篡改）→ 丢弃游标回首页', () => {
    const first = photos.getPhotosPage({
      where: 'deleted_at IS NULL',
      sort: 'extension',
      limit: 5
    })
    expect(first.nextCursor).not.toBeNull()
    // extension 是双键排序（file_ext + file_name），只带 1 个键值 → 游标无效
    const bad = encodePageCursor({ r: 1, p: 0, ks: ['png'] })
    const page = photos.getPhotosPage({
      where: 'deleted_at IS NULL',
      sort: 'extension',
      limit: 5,
      cursor: bad
    })
    // 降级为首页：返回按 extension 排序的前 5 条，不崩、不漏
    expect(page.items.length).toBe(5)
  })

  it('extension 双键游标 roundtrip：整库遍历无重无漏', () => {
    const seen = new Set<string>()
    let cursor: string | null = null
    let pages = 0
    do {
      const page = photos.getPhotosPage({
        where: 'deleted_at IS NULL',
        sort: 'extension',
        limit: 7,
        cursor
      })
      for (const p of page.items) seen.add(p.id)
      cursor = page.nextCursor
      pages += 1
      expect(pages).toBeLessThan(100)
    } while (cursor)
    expect(seen.size).toBe(30)
  })
})

describe('P1-1 · buildSmartAlbumWhere 参数配对不变量', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    for (let i = 0; i < 8; i++) {
      photos.addPhoto(`/tmp/inv-${i}.png`, { width: 10, height: 10 })
    }
  })
  afterEach(() => closeTestDb(db))

  /** 占位符 ? 数 == 绑定参数数（避开字符串字面量里的 ?：本规则集不含） */
  function assertParamsBalanced(rules: SmartAlbumRules): void {
    const where = buildSmartAlbumWhere(rules)
    const placeholders = (where.whereSql.match(/\?/g) ?? []).length
    expect(where.params.length).toBe(placeholders)
  }

  it('tagNamesExact：NOT IN 的 N 个占位符配齐参数，且查询可执行（旧版 RangeError）', () => {
    const rules: SmartAlbumRules = { tagNamesExact: ['a', 'b'] }
    assertParamsBalanced(rules)
    // 真实执行：旧实现 better-sqlite3 抛 Too few parameter values
    const w = buildSmartAlbumWhere(rules)
    expect(() =>
      photos.getPhotosPage({ where: w.whereSql || '1=1', params: w.params, limit: 5 })
    ).not.toThrow()
  })

  it('全维度组合下占位符数 == 参数数', () => {
    const rules: SmartAlbumRules = {
      tagNamesAny: ['x'],
      tagNamesAll: ['y'],
      tagNamesExact: ['a', 'b'],
      tagNamesExclude: ['z'],
      untaggedOnly: false,
      minFileSize: 1,
      resolutionMin: 10
    }
    assertParamsBalanced(rules)
    const w = buildSmartAlbumWhere(rules)
    expect(() =>
      photos.getPhotosPage({ where: w.whereSql || '1=1', params: w.params, limit: 5 })
    ).not.toThrow()
  })
})

/**
 * 二轮审查：排序键表达式的列存在性。
 * PAGE_SORT_KEYS 的表达式直接拼进 ORDER BY / 键链 WHERE，写错列名不会 typecheck，
 * 只会在「UI 排序下推到分页」那天让五个池整体报错（曾引用不存在的 modified_at）。
 */
describe('PAGE_SORT_KEYS · 表达式可执行', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    photos.addPhoto('/sort-key.png', { width: 8, height: 8 })
  })
  afterEach(() => closeTestDb(db))

  const SORTS: PageSortCol[] = [
    'imported_at',
    'file_name',
    'file_size',
    'deleted_at',
    'rating',
    'modified',
    'created',
    'extension',
    'dimensions',
    'duration'
  ]

  it('每个排序键都能出首页并续页（键链条件同表达式）', () => {
    for (const sort of SORTS) {
      for (const desc of [true, false]) {
        const first = photos.getPhotosPage({ where: 'deleted_at IS NULL', sort, desc, limit: 1 })
        expect(first.items, `sort=${sort} desc=${desc} 首页`).toHaveLength(1)
        if (!first.nextCursor) continue
        const second = photos.getPhotosPage({
          where: 'deleted_at IS NULL',
          sort,
          desc,
          limit: 1,
          cursor: first.nextCursor
        })
        expect(second.items, `sort=${sort} desc=${desc} 续页`).toHaveLength(0)
      }
    }
  })
})
