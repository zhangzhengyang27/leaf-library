/**
 * searchPhotos 混合搜索回归测试（m014 FTS5 trigram + LIKE 回退）：
 * - CJK ≥3 字走 FTS 子串匹配；1-2 字回退 LIKE（trigram 最短匹配长度）
 * - 标签名不在 FTS 内，两条路径都必须命中
 * - 恶意/语法类输入不抛错；软删与硬删行不返回；改名/描述/OCR 更新后索引同步
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { buildSmartAlbumWhere } from '../smartAlbumRules'
import { SEARCH_SCOPE_IDS, type SearchScopeId } from '../../../shared/smartAlbumRules'

describe('PhotoRepository · searchPhotos（FTS + LIKE 混合）', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('CJK ≥3 字走 FTS 子串匹配，1-2 字回退 LIKE 仍可命中', () => {
    const p = photos.addPhoto('/p1.jpg')
    photos.setDescription(p.id, '黄昏时分的城市天际线')

    expect(photos.searchPhotos('城市天际').map((x) => x.id)).toEqual([p.id]) // 4 字 FTS
    expect(photos.searchPhotos('天际线').map((x) => x.id)).toEqual([p.id]) // 3 字 FTS
    expect(photos.searchPhotos('城市').map((x) => x.id)).toEqual([p.id]) // 2 字 LIKE 回退
    expect(photos.searchPhotos('不存在的词句')).toEqual([])
  })

  it('文件名 ASCII 子串（大小写不敏感），OCR 文本可搜', () => {
    const a = photos.addPhoto('/sunset-beach.jpg')
    const b = photos.addPhoto('/doc.txt')
    photos.updateOcrText(b.id, '发票号码 12345，金额 800 元')

    expect(photos.searchPhotos('BEACH').map((x) => x.id)).toEqual([a.id])
    expect(photos.searchPhotos('发票号码').map((x) => x.id)).toEqual([b.id])
    expect(photos.searchPhotos('12345').map((x) => x.id)).toEqual([b.id])
  })

  it('两条路径都命中标签名', () => {
    const p = photos.addPhoto('/p1.jpg')
    photos.updatePhoto(p.id, { tags: ['风光摄影'] })

    // 2 字：LIKE 路径的标签 EXISTS
    expect(photos.searchPhotos('风光').map((x) => x.id)).toEqual([p.id])
    // 4 字：FTS 不含标签，靠 FTS 分支里保留的标签 EXISTS 命中
    expect(photos.searchPhotos('风光摄影').map((x) => x.id)).toEqual([p.id])
  })

  it('FTS 语法类输入不抛错、不误报', () => {
    photos.addPhoto('/p1.jpg')
    expect(() => photos.searchPhotos('NEAR" (a OR b)')).not.toThrow()
    expect(photos.searchPhotos('NEAR" (a OR b)')).toEqual([])
    expect(photos.searchPhotos('a OR b)')).toEqual([])
    expect(photos.searchPhotos('%')).toEqual([])
    expect(photos.searchPhotos('   ')).toEqual([])
  })

  it('软删行不返回；清空回收站后 FTS 与磁盘一致（无僵尸命中）', () => {
    const p = photos.addPhoto('/mountain-view.jpg')
    expect(photos.searchPhotos('mountain').length).toBe(1)

    photos.deletePhotos([p.id])
    expect(photos.searchPhotos('mountain')).toEqual([])

    photos.clearRecycleBin()
    expect(photos.searchPhotos('mountain')).toEqual([])

    // 硬删后同路径重新入库：FTS delete 触发器保证没有僵尸索引行
    const p2 = photos.addPhoto('/mountain-view.jpg')
    const hit = photos.searchPhotos('mountain')
    expect(hit.map((x) => x.id)).toEqual([p2.id])
  })

  it('改名 / 更新描述后索引同步（触发器覆盖一切写入路径）', () => {
    const p = photos.addPhoto('/old-name.jpg')
    expect(photos.searchPhotos('old-name').length).toBe(1)

    db.prepare(`UPDATE photo_photos SET file_name = ? WHERE id = ?`).run('new-horizon.jpg', p.id)
    expect(photos.searchPhotos('old-name')).toEqual([])
    expect(photos.searchPhotos('new-horizon').map((x) => x.id)).toEqual([p.id])

    photos.updateOcrText(p.id, '识别文本内容示例')
    expect(photos.searchPhotos('识别文本').map((x) => x.id)).toEqual([p.id])
  })
})

/**
 * 高级语法下推回归（P0-1 修复后该分支才真正执行）：
 * AST 的 term/phrase 必须按「字面子串、大小写不敏感」匹配——与渲染层
 * useAdvancedSearch.evalNode 同构。旧实现把 %词% 交给 INSTR（不认 LIKE 通配）
 * → 谓词恒假 → 任何含引号/括号/OR/排除词的查询都返回 0 条。
 */
describe('buildSmartAlbumWhere · 高级语法 AST 下推', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let cat: { id: string }
  let dog: { id: string }
  let bird: { id: string }

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    cat = photos.addPhoto('/cat food.png')
    dog = photos.addPhoto('/dog.png')
    bird = photos.addPhoto('/bird.png')
    photos.setDescription(bird.id, '一只 CAT 在树上')
  })
  afterEach(() => closeTestDb(db))

  const searchIds = (rules: Parameters<typeof buildSmartAlbumWhere>[0]): string[] => {
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    return (
      db
        .prepare(
          `SELECT id FROM photo_photos WHERE deleted_at IS NULL AND ${whereSql} ORDER BY file_name`
        )
        .all(...(params as never[])) as Array<{ id: string }>
    ).map((r) => r.id)
  }

  it('term 命中字面子串（含大小写折叠），不是 0 条', () => {
    expect(
      searchIds({
        searchKeyword: 'cat',
        searchScopes: ['name'],
        advancedAst: { type: 'term', value: 'cat' }
      })
    ).toEqual([cat.id])
    // 描述里的大写 CAT 也要能命中（scope 列已 LOWER）
    expect(
      searchIds({
        searchKeyword: 'cat',
        searchScopes: ['note'],
        advancedAst: { type: 'term', value: 'cat' }
      })
    ).toEqual([bird.id])
    expect(
      searchIds({
        searchKeyword: 'fish',
        searchScopes: ['name'],
        advancedAst: { type: 'term', value: 'fish' }
      })
    ).toEqual([])
  })

  it('phrase / or / and / 排除词按客户端语义', () => {
    expect(
      searchIds({
        searchKeyword: '"cat food"',
        searchScopes: ['name'],
        advancedAst: { type: 'phrase', value: 'cat food' }
      })
    ).toEqual([cat.id])
    expect(
      searchIds({
        searchKeyword: 'cat OR dog',
        searchScopes: ['name'],
        advancedAst: {
          type: 'or',
          children: [
            { type: 'term', value: 'cat' },
            { type: 'term', value: 'dog' }
          ]
        }
      })
    ).toEqual([cat.id, dog.id])
    expect(
      searchIds({
        searchKeyword: 'png -cat',
        searchScopes: ['name'],
        advancedAst: {
          type: 'and',
          children: [
            { type: 'term', value: 'png' },
            { type: 'term', value: 'cat', exclude: true }
          ]
        }
      })
    ).toEqual([bird.id, dog.id])
  })

  it('OCR 文本作为独立范围项下推（勾 ocr 命中、只勾 note 不命中）', () => {
    const p = photos.addPhoto('/scan.png')
    photos.updateOcrText(p.id, '发票号码 88123')
    const idsFor = (scopes: SearchScopeId[]) => {
      const { whereSql, params } = buildSmartAlbumWhere({
        searchKeyword: '88123',
        searchScopes: scopes
      })
      return (
        db.prepare(`SELECT id FROM photo_photos WHERE deleted_at IS NULL AND ${whereSql}`).all(
          ...(params as never[])
        ) as Array<{ id: string }>
      ).map((r) => r.id)
    }
    expect(idsFor(['ocr'])).toEqual([p.id])
    expect(idsFor(['note'])).toEqual([])
    expect(idsFor(['name', 'note', 'ocr'])).toEqual([p.id])
  })

  it('文档正文独立下推；全范围勾选也必须命中（二十九轮：主进程漏配 docText）', () => {
    const p = photos.addPhoto('/a/report.docx')
    photos.updateDocText(p.id, '季度营收同比增长 18%')
    const idsFor = (scopes: SearchScopeId[]): string[] =>
      searchIds({ searchKeyword: '18%', searchScopes: scopes })
    expect(idsFor(['docText'])).toEqual([p.id])
    expect(idsFor(['ocr'])).toEqual([])
    // 漏配时主进程按 ?? 退回 file_name，勾「文档正文」实际在搜文件名；
    // 连全部范围一起勾也搜不到，因为 file_name 里没有这个词而 doc_text 被跳过了
    expect(idsFor([...SEARCH_SCOPE_IDS])).toEqual([p.id])
  })

  it('未知范围项丢掉后走 FTS 路径，而不是静默当成 file_name', () => {
    const { whereSql } = buildSmartAlbumWhere({
      searchKeyword: 'cat',
      searchScopes: ['notARealScope'] as unknown as SearchScopeId[]
    })
    expect(whereSql).toContain('photo_fts')
  })

  it('不变量：占位符数 == 绑定参数数', () => {
    const { whereSql, params } = buildSmartAlbumWhere({
      searchKeyword: 'cat -dog',
      searchScopes: ['name', 'tags', 'note', 'ext', 'link', 'folderName', 'folderDesc'],
      advancedAst: {
        type: 'and',
        children: [
          { type: 'term', value: 'cat' },
          { type: 'term', value: 'dog', exclude: true }
        ]
      },
      favorite: true,
      minRating: 2
    })
    expect((whereSql.match(/\?/g) ?? []).length).toBe(params.length)
  })
})

describe('中文分词下推（主搜索链）', () => {
  let db: ReturnType<typeof createTestDb>
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    photos.addPhoto('/红色系海报.png')
    photos.addPhoto('/蓝色背景.png')
  })
  afterEach(() => closeTestDb(db))

  const namesFor = (rules: Parameters<typeof buildSmartAlbumWhere>[0]): string[] => {
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    return (
      db
        .prepare(`SELECT file_name FROM photo_photos WHERE deleted_at IS NULL AND ${whereSql}`)
        .all(...(params as never[])) as Array<{ file_name: string }>
    ).map((r) => r.file_name)
  }

  it('连写的中文词能命中：「红色海报」搜得出「红色系海报.png」', () => {
    // 不切词时这是一个整词，要求原样子串存在 → 零命中，这条就会红
    expect(namesFor({ searchKeyword: '红色海报', searchScopes: ['name'] })).toEqual([
      '红色系海报.png'
    ])
    expect(namesFor({ searchKeyword: '红色海报' })).toEqual(['红色系海报.png'])
  })

  it('切出来的短词不会掉进 trigram 空集（2 字词退回 LIKE 而不是 MATCH）', () => {
    // 无 searchScopes 时走 FTS 兜底支；「红色」只有 2 字，喂 MATCH 必然空
    expect(namesFor({ searchKeyword: '红色' })).toEqual(['红色系海报.png'])
  })

  it('短词退回 LIKE 时覆盖面不能缩水：2 字词仍要搜得到文档正文', () => {
    // 分词后「季度」只有 2 字，喂不进 trigram，会走 LIKE 兜底支；
    // 那一支若只按 DEFAULT_SCOPES 切就丢掉 doc_text——e2e 抓到过一次
    const doc = photos.addPhoto('/报表.xlsx')
    photos.updateDocText(doc.id, '本季度营收同比增长 18%')
    expect(namesFor({ searchKeyword: '季度营收' })).toEqual(['报表.xlsx'])
    expect(namesFor({ searchKeyword: '营收' })).toEqual(['报表.xlsx'])
  })

  it('空格分词的既有语义不变：两词都要命中', () => {
    expect(namesFor({ searchKeyword: '红色 蓝色' })).toEqual([])
    expect(namesFor({ searchKeyword: '红色 海报' })).toEqual(['红色系海报.png'])
  })

  it('英文不受影响，且大小写折叠', () => {
    expect(namesFor({ searchKeyword: 'POSTER' })).toEqual([])
    expect(namesFor({ searchKeyword: '红色系' })).toEqual(['红色系海报.png'])
  })
})

describe('语义档 id 集下推（G1 文搜图）', () => {
  let db: ReturnType<typeof createTestDb>
  let photos: PhotoRepository
  let cat: { id: string }
  let dog: { id: string }

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    cat = photos.addPhoto('/cat.png')
    dog = photos.addPhoto('/dog.png')
  })
  afterEach(() => closeTestDb(db))

  const run = (rules: Parameters<typeof buildSmartAlbumWhere>[0]): string[] => {
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    return (
      db
        .prepare(`SELECT id FROM photo_photos WHERE deleted_at IS NULL AND ${whereSql}`)
        .all(...(params as never[])) as Array<{ id: string }>
    ).map((r) => r.id)
  }

  it('三态分开：非空=收窄、空集=无命中、不给=不加谓词', () => {
    expect(run({ semanticIds: [cat.id] })).toEqual([cat.id])
    // 空集若退化成"不加谓词"，AI 说没找到时界面会把整库端出来
    expect(run({ semanticIds: [] })).toEqual([])
    expect(run({}).sort()).toEqual([cat.id, dog.id].sort())
  })

  it('语义档与维度筛选相与（这才是它比"另开一个结果池"强的地方）', () => {
    photos.setDescription(dog.id, '看门狗')
    expect(run({ semanticIds: [cat.id, dog.id], descriptionKeyword: '狗' })).toEqual([dog.id])
    expect(run({ semanticIds: [cat.id], descriptionKeyword: '狗' })).toEqual([])
  })

  it('非 uuid 形状的 id 逐条丢弃，不拼进 IN', () => {
    const { whereSql, params } = buildSmartAlbumWhere({
      semanticIds: [cat.id, "1'; DROP TABLE photo_photos; --", '', 'not-a-uuid', dog.id]
    })
    expect(params).toEqual([cat.id, dog.id])
    expect(whereSql).toContain('IN (?,?)')
    expect(db.prepare('SELECT COUNT(*) AS n FROM photo_photos').get()).toEqual({ n: 2 })
  })

  it('封顶 500 条：给一万条也只留 500 个参数', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => 
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const { params } = buildSmartAlbumWhere({ semanticIds: many })
    expect(params.length).toBe(500)
  })
})

describe('符号查询不能让搜索谓词整个消失（P0 回归）', () => {
  let db: ReturnType<typeof createTestDb>
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    photos.addPhoto('/普通海报.png')
    photos.addPhoto('/设计——终稿.png')
  })
  afterEach(() => closeTestDb(db))

  const countFor = (rules: Parameters<typeof buildSmartAlbumWhere>[0]): number => {
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    return (
      db.prepare(`SELECT COUNT(*) AS n FROM photo_photos WHERE deleted_at IS NULL AND ${whereSql}`)
        .all(...(params as never[])) as Array<{ n: number }>
    )[0].n
  }

  it('搜「——」只该命中文件名里真有破折号的那张，不是全库', () => {
    expect(countFor({ searchKeyword: '——' })).toBe(1)
  })

  it('emoji 这类切不出词的查询同样收窄，不返回全部', () => {
    expect(countFor({ searchKeyword: '🐱' })).toBe(0)
  })
})

describe('空语义集在任何 match 模式下都必须整体不命中（P1）', () => {
  let db: ReturnType<typeof createTestDb>
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    const a = photos.addPhoto('/a.png')
    photos.addPhoto('/b.png')
    photos.toggleFavorite(a.id)
  })
  afterEach(() => closeTestDb(db))

  const countFor = (rules: Parameters<typeof buildSmartAlbumWhere>[0]): number => {
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    return (
      db.prepare(`SELECT COUNT(*) AS n FROM photo_photos WHERE deleted_at IS NULL AND ${whereSql}`)
        .all(...(params as never[])) as Array<{ n: number }>
    )[0].n
  }

  it('match:any 下 OR 不能把 1=0 吃掉', () => {
    // 「收藏 或 无命中」若退化成"所有收藏"，用户会以为那就是 AI 的结果
    expect(countFor({ match: 'any', favorite: true, semanticIds: [] })).toBe(0)
    expect(countFor({ match: 'all', favorite: true, semanticIds: [] })).toBe(0)
    // 判别性：没给语义档时同样的规则应该返回那张收藏
    expect(countFor({ match: 'any', favorite: true })).toBe(1)
  })
})
