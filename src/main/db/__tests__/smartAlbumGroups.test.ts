/**
 * 智能夹规则形状 v2（D-022）引擎回归：条件组嵌套 + 组级取反
 *
 * - 嵌套真值表：(A AND B) OR NOT(C) 型三层组合，8 格组合逐格断言
 * - v1 回归：无 groups 的现存形状编译产物与升级前语义一致——
 *   a) 用升级前实现产出的 SQL 原文钉住两条代表性规则的编译产物；
 *   b) v1 扁平规则 ≡ 包成单组的 v2 规则（编译产物与命中集都对拍）；
 *   c) 「旧库规则打开保存后命中集不变」：JSON 往返（保存/读回的最小模拟）后命中集不变
 * - annotationFilter（f8efd59 最新谓词）在嵌套层内正常工作
 * - 防炸闸：深度 >8 / 组节点 >300 抛明确错误；边界值（恰好达限）放行
 * - 空组/空 rules 边界：空组不产生约束，空组取反同样不产生约束（= 全集）
 * - semanticIds（D-021）语义下推在任意嵌套层保持可用
 * - 占位符/绑定参数不变量：嵌套各形状下 `?` 数恒等于 params 数
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { PhotoAnnotationRepository } from '../repos/PhotoAnnotationRepository'
import { buildSmartAlbumWhere, type SmartAlbumRules } from '../smartAlbumRules'
import { validateSmartAlbumRules } from '../../../shared/smartAlbumRules'

describe('buildSmartAlbumWhere · 条件组 v2（D-022）', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let annotations: PhotoAnnotationRepository

  /** 真值表夹具：A=收藏 / B=评分≥4 / C=图片类型，8 格组合各一张 */
  let tt: Array<{ id: string; fav: boolean; rating: number; kind: 'image' | 'video' }>
  /** 标注夹具：annFav = 有标注且收藏；annBare = 有标注未收藏 */
  let annFav: { id: string }
  let annBare: { id: string }

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    annotations = new PhotoAnnotationRepository(db)
    tt = []
    for (const fav of [true, false]) {
      for (const rating of [4, 0]) {
        for (const kind of ['image', 'video'] as const) {
          const p = photos.addPhoto(`/tt-${fav ? 'F' : 'n'}${rating}-${kind}.png`, { kind })
          if (rating > 0) photos.setRating(p.id, rating)
          if (fav) photos.toggleFavorite(p.id)
          tt.push({ id: p.id, fav, rating, kind })
        }
      }
    }
    annFav = photos.addPhoto('/ann-fav.png')
    annBare = photos.addPhoto('/ann-bare.png')
    expect(
      annotations.create(annFav.id, { body: '区域批注', rect: { x: 0, y: 0, w: 40, h: 30 } }).ok
    ).toBe(true)
    expect(annotations.create(annBare.id, { body: '素材级批注' }).ok).toBe(true)
    photos.toggleFavorite(annFav.id)
  })
  afterEach(() => closeTestDb(db))

  /** 命中集统一按 id 排序断言（run 内部按 file_name 排序，与期望集的构造顺序无关） */
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

  const hitSet = (ids: string[]): string[] => [...ids].sort()

  it('(A AND B) OR NOT(C)：8 格组合逐格断言', () => {
    // A = favorite，B = minRating:4，C = kinds:['image']；组间 any，组 2 取反
    const rules: SmartAlbumRules = {
      match: 'any',
      groups: [
        { match: 'all', rules: { favorite: true, minRating: 4 } },
        { match: 'all', not: true, rules: { kinds: ['image'] } }
      ]
    }
    const hits = hitSet(run(rules))
    for (const f of tt) {
      const a = f.fav
      const b = f.rating >= 4
      const c = f.kind === 'image'
      const expected = (a && b) || !c
      expect(hits.includes(f.id), `格子 fav=${a} rating=${b} kind=${c}`).toBe(expected)
    }
    // 与 JS 真值表全集对账（防止夹具自身缺席某格造成假绿）
    const expectedAll = hitSet(
      tt.filter((f) => (f.fav && f.rating >= 4) || f.kind !== 'image').map((f) => f.id)
    )
    expect(hits).toEqual(expectedAll)
  })

  it('顶层扁平规则与条件组并存：顶层 match 同时连接两边', () => {
    // A = 收藏（顶层扁平键，与 groups 同层）AND [组: 评分≥4 OR 有标注] —— 顶层 all
    const rules: SmartAlbumRules = {
      match: 'all',
      favorite: true,
      groups: [{ match: 'any', rules: { minRating: 4, annotationFilter: 'any' } }]
    }
    const hits = run(rules)
    // 夹具里评分≥4 的都是收藏组，且 annFav 收藏 + 有标注
    expect(hits).toEqual(
      hitSet([...tt.filter((f) => f.fav && f.rating >= 4).map((f) => f.id), annFav.id])
    )
    // 顶层 any：收藏 OR 组(评分≥4 OR 有标注) → 未收藏但评分 4 的也进来
    const anyRules: SmartAlbumRules = {
      match: 'any',
      favorite: true,
      groups: [{ match: 'any', rules: { minRating: 4, annotationFilter: 'any' } }]
    }
    const anyHits = run(anyRules)
    expect(anyHits).toContain(annBare.id) // 未收藏、有标注 → 经组进来
    expect(anyHits.length).toBeGreaterThan(hits.length)
  })

  it('深层嵌套：(A AND (B OR NOT C)) 组内再嵌组', () => {
    // 嵌套组挂在组内 rules.groups（递归类型展开的唯一通道）；
    // 两个子组之间的 OR 由中间组的 match:'any' 决定
    const rules = {
      match: 'all',
      favorite: true,
      groups: [
        {
          match: 'any',
          rules: {
            groups: [
              { match: 'any', rules: { minRating: 4 } },
              { match: 'all', not: true, rules: { kinds: ['video'] } }
            ]
          }
        }
      ]
    } as unknown as SmartAlbumRules
    const hits = hitSet(run(rules))
    for (const f of tt) {
      const expected = f.fav && (f.rating >= 4 || f.kind !== 'video')
      expect(hits.includes(f.id)).toBe(expected)
    }
  })

  // ── v1 回归 ──

  it('v1 形状编译产物与升级前逐字节一致（升级前实现产出的 SQL 原文）', () => {
    // 两条代表性规则：OR 串接 + 文件夹 'none' 混选；SQL 原文取自升级前的 buildSmartAlbumWhere
    const r1: SmartAlbumRules = { match: 'any', annotationFilter: 'none', favorite: true }
    expect(buildSmartAlbumWhere(r1)).toEqual({
      whereSql:
        'is_favorite = 1 OR NOT EXISTS (SELECT 1 FROM photo_annotations pa WHERE pa.photo_id = photo_photos.id)',
      params: []
    })

    const r2: SmartAlbumRules = { folderIds: ['none', 'fa'], keyword: '叶' }
    const c2 = buildSmartAlbumWhere(r2)
    expect(c2.whereSql).toBe(
      `(folder_id IS NULL OR folder_id IN (?)) AND (file_name LIKE ? ESCAPE '\\' OR (description IS NOT NULL AND description LIKE ? ESCAPE '\\'))`
    )
    expect(c2.params).toEqual(['fa', '%叶%', '%叶%'])

    // tagNamesExact 是多行 SQL，按结构断言（2 个 EXISTS 等值 + 1 个 NOT IN，占位符对齐）
    const c3 = buildSmartAlbumWhere({ tagNamesExact: ['a', 'b'] })
    expect((c3.whereSql.match(/LOWER\(tt\.name\) = LOWER\(\?\)/g) ?? []).length).toBe(2)
    expect(c3.whereSql).toContain('NOT EXISTS')
    expect(c3.whereSql).toContain('NOT IN (LOWER(?),LOWER(?))')
    expect((c3.whereSql.match(/\?/g) ?? []).length).toBe(c3.params.length)
    expect(c3.params).toEqual(['a', 'b', 'a', 'b'])
  })

  it('v1 扁平规则 ≡ 包成单组的 v2 规则（编译产物逐字节对拍 + 命中集一致）', () => {
    const battery: SmartAlbumRules[] = [
      { favorite: true },
      { match: 'any', annotationFilter: 'none', favorite: true },
      { folderIds: ['none', 'fa'], keyword: '叶' },
      { minRating: 3, shapesInclude: ['landscape'], fileExtsExclude: ['gif'] },
      { searchKeyword: 'cat' }
    ]
    for (const v1 of battery) {
      const flat = buildSmartAlbumWhere(v1)
      const groupedRules = {
        match: v1.match,
        rules: {},
        groups: [{ match: v1.match, rules: { ...v1 } }]
      } as unknown as SmartAlbumRules
      const grouped = buildSmartAlbumWhere(groupedRules)
      expect(grouped.whereSql, JSON.stringify(v1)).toBe(flat.whereSql)
      expect(grouped.params, JSON.stringify(v1)).toEqual(flat.params)
      expect(run(v1), JSON.stringify(v1)).toEqual(run(groupedRules))
    }
  })

  it('旧库规则打开保存后命中集不变（JSON 往返 + 校验放行）', () => {
    const v1: SmartAlbumRules = {
      match: 'any',
      favorite: true,
      minRating: 4,
      annotationFilter: 'any'
    }
    const before = run(v1)
    // 「打开 → 保存」的最小引擎侧模拟：rules_json 序列化落库再读回
    const reopened = JSON.parse(JSON.stringify(v1)) as SmartAlbumRules
    expect(buildSmartAlbumWhere(reopened).whereSql).toBe(buildSmartAlbumWhere(v1).whereSql)
    expect(run(reopened)).toEqual(before)
    // 编辑器保存前的结构校验不得拒绝存量 v1 形状
    expect(validateSmartAlbumRules(v1).ok).toBe(true)
    // match:'any' = OR 串接：收藏 ∪ 评分≥4 ∪ 有标注
    expect(before).toEqual(
      hitSet([...tt.filter((f) => f.fav || f.rating >= 4).map((f) => f.id), annFav.id, annBare.id])
    )
  })

  // ── annotationFilter（f8efd59）在嵌套层内 ──

  it('annotationFilter 在组内正常工作（包含进 AND 链 / 被组级取反）', () => {
    // 收藏 AND 组(有标注) → 只有 annFav
    expect(
      run({ favorite: true, groups: [{ match: 'all', rules: { annotationFilter: 'any' } }] })
    ).toEqual([annFav.id])
    // any + 组级取反「无标注」：NOT(无标注) = 有标注 → annFav + annBare（无需收藏）
    expect(
      run({ match: 'any', groups: [{ not: true, rules: { annotationFilter: 'none' } }] })
    ).toEqual(hitSet([annFav.id, annBare.id]))
    // 组内 any 连接：有标注 OR 收藏
    expect(
      run({
        match: 'all',
        groups: [{ match: 'any', rules: { annotationFilter: 'any', favorite: true } }]
      })
    ).toEqual(hitSet([...tt.filter((f) => f.fav).map((f) => f.id), annFav.id, annBare.id]))
  })

  // ── 防炸闸 ──

  /** 造 n 层套娃组：每组把上一层的规则对象装进自己的 rules（深层只可能来自手改 JSON） */
  const nest = (n: number): SmartAlbumRules => {
    let node: Record<string, unknown> = { favorite: true }
    for (let i = 0; i < n; i++) {
      node = { groups: [{ rules: node as SmartAlbumRules }] }
    }
    return node as unknown as SmartAlbumRules
  }

  it('深度闸：第 8 层组放行、第 9 层拒绝且报错点名深度', () => {
    expect(() => buildSmartAlbumWhere(nest(7))).not.toThrow() // 根 1 层 + 7 层组 = 8 层，达限放行
    try {
      buildSmartAlbumWhere(nest(8))
      expect.unreachable('深度超限必须抛错')
    } catch (e) {
      expect((e as Error).message).toContain('嵌套深度超过上限 8')
    }
  })

  it('节点闸：根+299 组放行、+300 组拒绝且报错点名上限', () => {
    const okRules = {
      groups: Array.from({ length: 299 }, () => ({ rules: {} }))
    } as unknown as SmartAlbumRules
    expect(buildSmartAlbumWhere(okRules).whereSql).toBe('1=1') // 全空组 = 无约束，但预算内放行
    const overRules = {
      groups: Array.from({ length: 300 }, () => ({ rules: {} }))
    } as unknown as SmartAlbumRules
    try {
      buildSmartAlbumWhere(overRules)
      expect.unreachable('节点超限必须抛错')
    } catch (e) {
      expect((e as Error).message).toContain('节点数超过上限 300')
    }
  })

  it('结构损坏：groups 非数组 / 组非对象 / 组上直接挂 groups 抛明确错误而不是静默丢弃', () => {
    expect(() => buildSmartAlbumWhere({ groups: 'x' } as unknown as SmartAlbumRules)).toThrow(
      /groups 必须是数组/
    )
    expect(() => buildSmartAlbumWhere({ groups: ['x'] } as unknown as SmartAlbumRules)).toThrow(
      /条件组必须是对象/
    )
    // 嵌套组只认组内 rules.groups 一条通道；组对象自身挂 groups 会静默变语义，必须报错
    expect(() =>
      buildSmartAlbumWhere({
        groups: [{ match: 'all', groups: [{ rules: { favorite: true } }] }]
      } as unknown as SmartAlbumRules)
    ).toThrow(/不支持自身的 groups/)
  })

  // ── 空组 / 空 rules 边界 ──

  it('空组不产生约束；空组取反同样不产生约束（= 全集）', () => {
    const all = run({})
    expect(buildSmartAlbumWhere({ groups: [] }).whereSql).toBe('1=1')
    expect(run({ groups: [] })).toEqual(all)
    expect(run({ rules: {}, groups: [{ rules: {} }] } as SmartAlbumRules)).toEqual(all)
    // 钉死的边角：空组取反没有可取反的对象 → 不产生 NOT，仍是全集
    expect(buildSmartAlbumWhere({ groups: [{ not: true, rules: {} }] }).whereSql).toBe('1=1')
    expect(run({ groups: [{ not: true, rules: {} }] })).toEqual(all)
    expect(run({ groups: [{ not: true }] })).toEqual(all) // 连 rules 都没给的空组
  })

  it('非空组的组级取反生效：NOT(收藏) = 未收藏全集', () => {
    const c = buildSmartAlbumWhere({ groups: [{ not: true, rules: { favorite: true } }] })
    expect(c.whereSql).toBe('NOT (is_favorite = 1)')
    // 夹具里的收藏 = tt 收藏 4 张 + annFav；取反应命中其余全部
    expect(run({ groups: [{ not: true, rules: { favorite: true } }] })).toEqual(
      hitSet([...tt.filter((f) => !f.fav).map((f) => f.id), annBare.id])
    )
  })

  it('组间 any：收藏 OR 视频', () => {
    expect(
      run({
        match: 'any',
        groups: [
          { match: 'all', rules: { favorite: true } },
          { match: 'all', rules: { kinds: ['video'] } }
        ]
      })
    ).toEqual(
      hitSet([
        ...tt.filter((f) => f.fav || f.kind === 'video').map((f) => f.id),
        annFav.id // annFav 也是收藏
      ])
    )
  })

  // ── semanticIds（D-021）在嵌套层 ──

  it('根级语义空集闸在 v2 仍优先：semanticIds=[] 整册为空', () => {
    expect(
      buildSmartAlbumWhere({ semanticIds: [], groups: [{ rules: { favorite: true } }] })
    ).toEqual({
      whereSql: '1=0',
      params: []
    })
    expect(run({ semanticIds: [], groups: [{ rules: { favorite: true } }] })).toEqual([])
  })

  it('组内语义条件：空集是叶子 1=0，可被所在层组合/取反', () => {
    // any：1=0 OR 收藏 → 收藏（「无命中」叶子不污染同层其它分支）
    const anyRules: SmartAlbumRules = {
      match: 'any',
      groups: [{ rules: { semanticIds: [] } }, { rules: { favorite: true } }]
    }
    expect(buildSmartAlbumWhere(anyRules).whereSql).toBe('1=0 OR is_favorite = 1')
    expect(run(anyRules)).toEqual(run({ favorite: true }))
    // 组级取反把空集救回来：NOT(1=0) = 全集
    const notRules: SmartAlbumRules = { groups: [{ not: true, rules: { semanticIds: [] } }] }
    expect(buildSmartAlbumWhere(notRules).whereSql).toBe('NOT (1=0)')
    expect(run(notRules)).toEqual(run({}))
  })

  it('组内非空 semanticIds 按 id 收窄，非法 id 被过滤（下推语义在任意层一致）', () => {
    const target = tt[0].id
    const other = tt[1].id
    const rules: SmartAlbumRules = {
      groups: [{ rules: { semanticIds: [target, other, 'garbage'] } }]
    }
    const c = buildSmartAlbumWhere(rules)
    expect(c.params).toEqual([target, other])
    expect(run(rules)).toEqual(hitSet([target, other]))
  })

  // ── 占位符 / 绑定参数不变量 ──

  it('嵌套各形状下占位符数恒等于绑定参数数', () => {
    const battery: Array<SmartAlbumRules | Record<string, unknown>> = [
      {
        match: 'any',
        groups: [
          { match: 'all', rules: { favorite: true, minRating: 4 } },
          { match: 'all', not: true, rules: { kinds: ['image'] } }
        ]
      },
      { groups: [{ match: 'any', rules: { tagNamesAll: ['a', 'b'], tagNamesExact: ['c'] } }] },
      { groups: [{ rules: { folderIds: ['none', 'fa'], folderExcludeIds: ['fb'] } }] },
      { groups: [{ not: true, rules: { searchKeyword: 'cat' } }] },
      {
        groups: [
          { rules: { shapesInclude: ['landscape'], colorClose: { hex: '#ff0000', accuracy: 20 } } }
        ]
      },
      {
        match: 'all',
        rules: { keyword: '叶' },
        groups: [
          { match: 'any', rules: { minRating: 2 } },
          { not: true, rules: { fileExtsInclude: ['png'], tagNamesExclude: ['废弃'] } }
        ]
      }
    ]
    for (const rules of battery) {
      const { whereSql, params } = buildSmartAlbumWhere(rules as SmartAlbumRules)
      expect((whereSql.match(/\?/g) ?? []).length, JSON.stringify(rules)).toBe(params.length)
    }
  })

  // ── 共享结构校验（编辑器保存前用，口径与引擎一致） ──

  describe('validateSmartAlbumRules', () => {
    it('合法 v2 / v1 形状放行', () => {
      expect(validateSmartAlbumRules({}).ok).toBe(true)
      expect(validateSmartAlbumRules({ favorite: true }).ok).toBe(true)
      expect(
        validateSmartAlbumRules({
          match: 'any',
          groups: [
            { match: 'all', not: true, rules: { favorite: true } },
            { match: 'any', rules: { groups: [{ rules: { minRating: 2 } }] } }
          ]
        }).ok
      ).toBe(true)
    })

    it('超限与结构错误逐项拒绝', () => {
      expect(validateSmartAlbumRules({ groups: 'x' }).ok).toBe(false)
      expect(validateSmartAlbumRules({ groups: ['x'] }).ok).toBe(false)
      expect(validateSmartAlbumRules({ groups: [{ match: 'XOR' }] }).ok).toBe(false)
      expect(validateSmartAlbumRules({ groups: [{ not: 'yes' }] }).ok).toBe(false)
      expect(validateSmartAlbumRules(nest(8)).ok).toBe(false) // 与引擎同一深度闸
      expect(
        validateSmartAlbumRules({
          groups: Array.from({ length: 300 }, () => ({ rules: {} }))
        }).ok
      ).toBe(false)
      // 错误信息能念出来
      const deep = validateSmartAlbumRules(nest(8))
      expect(deep.ok).toBe(false)
      if (!deep.ok) expect(deep.error).toContain('嵌套')
    })
  })
})
