/**
 * D-023 算子补齐引擎回归（真内存库，逐算子断言）：
 *
 * - 文件名开头/结尾：LIKE 前后缀 + 通配符转义（% _ \ 是字面量，不是通配）
 * - 文件名正则：UDF 下推（regexp(?, file_name)）——合法模式命中/大小写敏感/部分匹配语义；
 *   特殊字符注入面（( * \ 引号分号都是绑定参数的数据，不能炸查询）；非法模式在
 *   编译期抛明确错误（绝不让 UDF 在 SQL 执行中途抛穿）；UDF 自身对非法模式返回 0；
 * - 注释有无内容（descriptionEmpty / descriptionHasContent，同时给时 empty 优先）
 * - 数值 between（width/height/fileSize/durationMsBetween）：NULL 维度不命中、脏形状当没设
 * - 日期过去 N 天（imported/taken/modifiedWithinDays）：滚动窗口、NULL 维度不命中
 * - 嵌套组内可用：between/beginsWith/regex 在 any 组单行表达（这是 between 键的立项理由）、
 *   组级取反救回语义
 * - 占位符/绑定参数不变量：新键全组合下 `?` 数恒等于 params 数
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { buildSmartAlbumWhere, type SmartAlbumRules } from '../smartAlbumRules'
import { SMART_ALBUM_MAX_REGEX_LEN, checkRegexPattern } from '../../../shared/smartAlbumRules'

const DAY = 86_400_000

describe('buildSmartAlbumWhere · D-023 算子补齐', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let ids: Record<string, string>

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    const add = (name: string, m?: Partial<Parameters<PhotoRepository['addPhoto']>[1]>): string =>
      photos.addPhoto(`/${name}`, m).id

    ids = {
      // 4 维数字齐备的主样本
      img1: add('IMG_001.png', {
        width: 1920,
        height: 1080,
        fileSize: 2_000_000,
        description: '日落照片'
      }),
      img2: add('IMG_002.jpg', { width: 800, height: 600, fileSize: 800_000, description: '' }),
      shot: add('截图 12.png', { fileSize: 500_000 }),
      leaf: add('叶子_A.png', { width: 3840, height: 2160 }),
      pct: add('100%_进度.png'),
      leafDecoy: add('叶子XA.png'), // 验证 _ 不当通配符
      banner: add('banner_v2.FINAL.jpg')
    }
    // 时长维：只有截图这条有 duration_ms；把它的 taken_at/imported_at 也放旧（30 天前）
    db.prepare(`UPDATE photo_photos SET duration_ms = 5000 WHERE id = ?`).run(ids.shot)
    db.prepare(`UPDATE photo_photos SET taken_at = NULL WHERE id = ?`).run(ids.shot)
    db.prepare(`UPDATE photo_photos SET imported_at = ?, taken_at = ? WHERE id = ?`).run(
      Date.now() - 30 * DAY,
      Date.now() - 30 * DAY,
      ids.shot
    )
    // 文件系统修改时间：只有 img1 有近期值，img2 显式放旧
    db.prepare(`UPDATE photo_photos SET fs_modified_at = ? WHERE id = ?`).run(Date.now(), ids.img1)
    db.prepare(`UPDATE photo_photos SET fs_modified_at = ? WHERE id = ?`).run(
      Date.now() - 60 * DAY,
      ids.img2
    )
  })
  afterEach(() => closeTestDb(db))

  const run = (rules: Parameters<typeof buildSmartAlbumWhere>[0]): string[] => {
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    return (
      db
        .prepare(
          `SELECT id FROM photo_photos WHERE deleted_at IS NULL AND (${whereSql}) ORDER BY file_name`
        )
        .all(...(params as never[])) as Array<{ id: string }>
    )
      .map((r) => r.id)
      .sort()
  }
  const hitSet = (...keys: string[]): string[] => keys.map((k) => ids[k]).sort()

  // ── 文件名开头 / 结尾 ──

  it('nameBeginsWith：前缀命中；% _ 是字面量不是通配符', () => {
    expect(run({ nameBeginsWith: 'IMG_' })).toEqual(hitSet('img1', 'img2'))
    expect(run({ nameBeginsWith: '叶子_' })).toEqual(hitSet('leaf')) // 不含 叶子XA
    expect(run({ nameBeginsWith: '100%' })).toEqual(hitSet('pct')) // % 字面匹配
  })

  it('nameEndsWith：后缀命中；LIKE 的 ASCII 大小写不敏感口径与既有文本键一致', () => {
    expect(run({ nameEndsWith: '.png' })).toEqual(
      hitSet('img1', 'shot', 'leaf', 'pct', 'leafDecoy')
    )
    // SQLite LIKE 对 ASCII 大小写不敏感（与 keyword/formats 等既有 LIKE 键同口径）
    expect(run({ nameEndsWith: '.JPG' })).toEqual(hitSet('img2', 'banner'))
    expect(run({ nameEndsWith: '_v2.FINAL.jpg' })).toEqual(hitSet('banner'))
  })

  // ── 文件名正则 ──

  it('nameRegex：合法模式命中；JS 语义（部分匹配、大小写敏感、数字元字符可用）', () => {
    expect(run({ nameRegex: '^IMG_\\d{3}\\.png$' })).toEqual(hitSet('img1'))
    // 部分匹配（Eagle 正则同口径）：不要求全文匹配（100 的「00」也算两位数字）
    expect(run({ nameRegex: '\\d{2}' })).toEqual(hitSet('img1', 'img2', 'shot', 'pct'))
    // 大小写敏感：小写 img 不命中 IMG_*
    expect(run({ nameRegex: '^img' })).toEqual([])
    // 中文与特殊字符
    expect(run({ nameRegex: '叶子_(\\w)+' })).toEqual(hitSet('leaf'))
    expect(run({ nameRegex: '100%_' })).toEqual(hitSet('pct'))
  })

  it('非法正则在编译期抛明确错误，绝不带病进 SQL（( * \\ 未闭合序列）', () => {
    for (const bad of ['(', '*', 'a\\', '[a-', '(?P<x>1)']) {
      try {
        buildSmartAlbumWhere({ nameRegex: bad })
        expect.unreachable(`非法正则必须抛错：${bad}`)
      } catch (e) {
        expect((e as Error).message).toContain('文件名正则未通过校验')
        expect((e as Error).message).toContain('非法正则')
      }
    }
    // 长度闸
    try {
      buildSmartAlbumWhere({ nameRegex: 'a'.repeat(SMART_ALBUM_MAX_REGEX_LEN + 1) })
      expect.unreachable('超长正则必须抛错')
    } catch (e) {
      expect((e as Error).message).toContain('正则过长')
    }
    // 共享校验器与引擎同口径（编辑器行内报错用同一份）
    expect(checkRegexPattern('(')).toContain('非法正则')
    expect(checkRegexPattern('^ok$')).toBeNull()
  })

  it('正则注入面：引号/分号/DROP 等都是绑定参数的数据，查询照常执行且表无损', () => {
    const hostile = `'; DROP TABLE photo_photos; --`
    expect(run({ nameRegex: hostile })).toEqual([])
    // 表还在、数据无损
    const n = db.prepare(`SELECT COUNT(*) AS n FROM photo_photos`).get() as { n: number }
    expect(n.n).toBe(7)
  })

  it('UDF 纵深防御：非法模式返回 0（不命中）而不是抛穿 SQL 执行', () => {
    const q = db.prepare(`SELECT regexp(?, ?) AS m`)
    expect(q.get('^a', 'abc') as { m: number }).toEqual({ m: 1 })
    expect(q.get('a(', 'abc') as { m: number }).toEqual({ m: 0 }) // 非法模式 → 0
    expect(q.get('\\', 'abc') as { m: number }).toEqual({ m: 0 })
    expect(q.get(null, 'abc') as { m: number }).toEqual({ m: 0 }) // 非字符串模式
    expect(q.get('^a', null) as { m: number }).toEqual({ m: 0 }) // 非字符串值
  })

  // ── 注释有无内容 ──

  it('descriptionEmpty / descriptionHasContent：空串与 NULL 都算没有内容；同时给时 empty 优先', () => {
    // 没有内容：''（img2）与 NULL（shot/leaf/pct/leafDecoy/banner——夹具多数行无描述）
    expect(run({ descriptionEmpty: true })).toEqual(
      hitSet('img2', 'shot', 'leaf', 'pct', 'leafDecoy', 'banner')
    )
    expect(run({ descriptionHasContent: true })).toEqual(hitSet('img1'))
    // 矛盾输入按文档口径取 empty 优先（不会两个都加、也不会互相抵消成全集）
    expect(run({ descriptionEmpty: true, descriptionHasContent: true })).toEqual(
      hitSet('img2', 'shot', 'leaf', 'pct', 'leafDecoy', 'banner')
    )
    // undefined = 不限
    expect(run({})).toHaveLength(7)
  })

  // ── 数值 between ──

  it('widthBetween / heightBetween：闭区间命中，NULL 维度不命中', () => {
    expect(run({ widthBetween: [800, 1920] })).toEqual(hitSet('img1', 'img2'))
    expect(run({ widthBetween: [3840, 7680] })).toEqual(hitSet('leaf'))
    expect(run({ heightBetween: [1000, 2200] })).toEqual(hitSet('img1', 'leaf'))
    expect(run({ heightBetween: [100, 200] })).toEqual([])
  })

  it('fileSizeBetween / durationMsBetween：NULL duration 不命中', () => {
    expect(run({ fileSizeBetween: [500_000, 1_000_000] })).toEqual(hitSet('img2', 'shot'))
    expect(run({ durationMsBetween: [1000, 10_000] })).toEqual(hitSet('shot'))
  })

  it('between 脏形状（IPC 边界）当没设：不炸、不产生约束', () => {
    for (const dirty of [[], [1], [1, 2, 3], ['a', 'b'], [2000, 800], 'x', null]) {
      const rules = { widthBetween: dirty } as unknown as SmartAlbumRules
      expect(run(rules), JSON.stringify(rules)).toHaveLength(7)
    }
  })

  // ── 日期过去 N 天（滚动窗口） ──

  it('importedWithinDays：相对窗命中近期导入，30 天前的旧素材不在', () => {
    expect(run({ importedWithinDays: 7 })).toEqual(
      hitSet('img1', 'img2', 'leaf', 'pct', 'leafDecoy', 'banner')
    )
    expect(run({ importedWithinDays: 60 })).toHaveLength(7)
  })

  it('takenWithinDays / modifiedWithinDays：NULL 时间维度不命中', () => {
    // taken_at：shot 为 NULL，其余为近期（夹具默认 now）
    expect(run({ takenWithinDays: 7 })).toEqual(
      hitSet('img1', 'img2', 'leaf', 'pct', 'leafDecoy', 'banner')
    )
    // fs_modified_at：img1 近期 / img2 60 天前 / 其余 NULL
    expect(run({ modifiedWithinDays: 7 })).toEqual(hitSet('img1'))
    expect(run({ modifiedWithinDays: 90 })).toEqual(hitSet('img1', 'img2'))
  })

  it('withinDays 非正数/非数字忽略（不产生约束）', () => {
    for (const bad of [0, -3, '7', null]) {
      expect(run({ importedWithinDays: bad } as unknown as SmartAlbumRules)).toHaveLength(7)
    }
  })

  // ── 嵌套组内可用 ──

  it('OR 组内单行 between：宽度区间 OR 文件名开头（between 键的立项理由）', () => {
    const rules: SmartAlbumRules = {
      match: 'any',
      groups: [
        { match: 'all', rules: { widthBetween: [800, 1920] } },
        { match: 'all', rules: { nameBeginsWith: '叶子_' } }
      ]
    }
    expect(run(rules)).toEqual(hitSet('img1', 'img2', 'leaf'))
  })

  it('正则进组并被组级取反：NOT(命中 IMG_*) = 其余全部', () => {
    const rules: SmartAlbumRules = {
      groups: [{ not: true, rules: { nameRegex: '^IMG_' } }]
    }
    expect(run(rules)).toEqual(hitSet('shot', 'leaf', 'pct', 'leafDecoy', 'banner'))
  })

  it('正则 + 组级取反 + any 连接的真值组合', () => {
    const rules: SmartAlbumRules = {
      match: 'any',
      favorite: true,
      groups: [{ not: true, rules: { nameRegex: '\\d' } }]
    }
    // 夹具无人收藏 → NOT(\d) 救回来：文件名完全无数字的（叶子_A / 叶子XA）命中；
    // pct 的「100」、banner_v2 的「2」都含数字，不在其列
    expect(run(rules)).toEqual(hitSet('leaf', 'leafDecoy'))
  })

  it('嵌套组内 withinDays + between 组合', () => {
    const rules: SmartAlbumRules = {
      match: 'all',
      groups: [
        {
          match: 'any',
          rules: {
            importedWithinDays: 7,
            fileSizeBetween: [0, 100]
          }
        }
      ]
    }
    // 7 天内添加 ∪ 大小 ≤100B（无人满足）→ 六条近期素材
    expect(run(rules)).toEqual(hitSet('img1', 'img2', 'leaf', 'pct', 'leafDecoy', 'banner'))
  })

  // ── 占位符 / 绑定参数不变量 ──

  it('新键全组合下占位符数恒等于绑定参数数', () => {
    const battery: Array<SmartAlbumRules | Record<string, unknown>> = [
      { nameBeginsWith: 'IMG_', nameEndsWith: '.png' },
      { nameRegex: '^IMG_\\d+$', descriptionEmpty: true },
      { nameRegex: '叶子', descriptionHasContent: true },
      {
        widthBetween: [1, 2],
        heightBetween: [3, 4],
        fileSizeBetween: [5, 6],
        durationMsBetween: [7, 8]
      },
      { importedWithinDays: 7, takenWithinDays: 3, modifiedWithinDays: 1 },
      {
        match: 'any',
        groups: [
          { match: 'all', rules: { nameRegex: '^a', widthBetween: [1, 2] } },
          { not: true, rules: { nameBeginsWith: 'b', importedWithinDays: 2 } }
        ]
      }
    ]
    for (const rules of battery) {
      const { whereSql, params } = buildSmartAlbumWhere(rules as SmartAlbumRules)
      expect((whereSql.match(/\?/g) ?? []).length, JSON.stringify(rules)).toBe(params.length)
    }
    // 顶层正则的编译产物形状（UDF 调用 + 绑定参数）
    expect(buildSmartAlbumWhere({ nameRegex: '^IMG_' })).toEqual({
      whereSql: `regexp(?, file_name)`,
      params: ['^IMG_']
    })
  })
})
