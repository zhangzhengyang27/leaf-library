/**
 * 标注维下推回归（M4，023 photo_annotations 的筛选消费端）：
 * - buildSmartAlbumWhere 的 annotationFilter 'any'/'none' 谓词在真库上命中正确
 *   （三档标注形状 rect/atMs/纯文字都算「有」；删光标注后翻到「无」）
 * - 回收站视图语义与标签维同口径：软删素材的标注行保留，回收站里仍可按有/无筛；
 *   硬删（清空回收站）后标注行被连带清除
 * - match:'any' 的 OR 串接下标注谓词不丢；占位符与绑定参数数恒等
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { PhotoAnnotationRepository } from '../repos/PhotoAnnotationRepository'
import { buildSmartAlbumWhere } from '../smartAlbumRules'

describe('buildSmartAlbumWhere · 标注维（annotationFilter any/none）', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let annotations: PhotoAnnotationRepository
  let withRect: { id: string }
  let withAtMs: { id: string }
  let withText: { id: string }
  let bare: { id: string }

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    annotations = new PhotoAnnotationRepository(db)
    withRect = photos.addPhoto('/rect-marked.png')
    withAtMs = photos.addPhoto('/timed-note.mp4')
    withText = photos.addPhoto('/text-note.txt')
    bare = photos.addPhoto('/no-annotation.png')
    expect(
      annotations.create(withRect.id, { body: '这里要改', rect: { x: 0, y: 0, w: 40, h: 30 } }).ok
    ).toBe(true)
    expect(annotations.create(withAtMs.id, { body: '高潮在这', atMs: 12_500 }).ok).toBe(true)
    expect(annotations.create(withText.id, { body: '素材级批注' }).ok).toBe(true)
  })
  afterEach(() => closeTestDb(db))

  const run = (rules: Parameters<typeof buildSmartAlbumWhere>[0]): string[] => {
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    return (
      db
        .prepare(
          `SELECT id FROM photo_photos WHERE deleted_at IS NULL AND ${whereSql} ORDER BY file_name`
        )
        .all(...(params as never[])) as Array<{ id: string }>
    ).map((r) => r.id)
  }
  const runTrash = (rules: Parameters<typeof buildSmartAlbumWhere>[0]): string[] => {
    // photos:getPage trash 视图的合并形状：deleted_at IS NOT NULL AND (filters)
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    return (
      db
        .prepare(
          `SELECT id FROM photo_photos WHERE deleted_at IS NOT NULL AND (${whereSql}) ORDER BY file_name`
        )
        .all(...(params as never[])) as Array<{ id: string }>
    ).map((r) => r.id)
  }

  it("annotationFilter: 'any' 命中三档形状的带标注素材，'none' 只剩无标注的", () => {
    expect(run({ annotationFilter: 'any' }).sort()).toEqual(
      [withRect.id, withAtMs.id, withText.id].sort()
    )
    expect(run({ annotationFilter: 'none' })).toEqual([bare.id])
  })

  it('不设 annotationFilter 不加谓词（全量返回）', () => {
    expect(run({}).length).toBe(4)
    const { whereSql } = buildSmartAlbumWhere({})
    expect(whereSql).not.toContain('photo_annotations')
  })

  it('标注删光后素材从 any 翻到 none（EXISTS 实时反映表内容）', () => {
    const list = annotations.listByPhotoId(withText.id)
    for (const a of list) expect(annotations.remove(a.id).ok).toBe(true)
    expect(run({ annotationFilter: 'any' }).sort()).toEqual([withRect.id, withAtMs.id].sort())
    expect(run({ annotationFilter: 'none' }).sort()).toEqual([bare.id, withText.id].sort())
  })

  it('与其它维度相与：annotationFilter + descriptionKeyword', () => {
    photos.setDescription(withRect.id, '关键素材')
    expect(run({ annotationFilter: 'any', descriptionKeyword: '关键' })).toEqual([withRect.id])
    expect(run({ annotationFilter: 'none', descriptionKeyword: '关键' })).toEqual([])
  })

  it('回收站视图语义：软删带标注素材仍按「有标注」命中；硬删后标注行被清', () => {
    photos.deletePhotos([withRect.id])
    // 软删不清标注行（清理只发生在 clearRecycleBin），回收站里「有标注」仍能筛出它
    expect(runTrash({ annotationFilter: 'any' })).toEqual([withRect.id])
    expect(runTrash({ annotationFilter: 'none' })).toEqual([])

    photos.clearRecycleBin()
    expect(runTrash({ annotationFilter: 'any' })).toEqual([])
    const left = db
      .prepare('SELECT COUNT(*) AS n FROM photo_annotations WHERE photo_id = ?')
      .get(withRect.id) as { n: number }
    expect(left.n).toBe(0)
  })

  it("match:'any' 下 OR 串接不吞掉标注谓词", () => {
    // 「无标注 或 收藏」：收藏 bare 后应命中 bare；带标注的三张不在收藏、不命中
    photos.toggleFavorite(bare.id)
    expect(run({ match: 'any', annotationFilter: 'none', favorite: true })).toEqual([bare.id])
    // 全库都收藏的对照：OR 应把带标注的三张也捞回来
    photos.toggleFavorite(withRect.id)
    photos.toggleFavorite(withAtMs.id)
    photos.toggleFavorite(withText.id)
    expect(run({ match: 'any', annotationFilter: 'none', favorite: true }).sort()).toEqual(
      [withRect.id, withAtMs.id, withText.id, bare.id].sort()
    )
  })

  it('占位符数 == 绑定参数数（标注谓词各档）', () => {
    for (const f of ['any', 'none'] as const) {
      const { whereSql, params } = buildSmartAlbumWhere({ annotationFilter: f })
      expect(whereSql).toContain('photo_annotations')
      expect((whereSql.match(/\?/g) ?? []).length).toBe(params.length)
    }
  })
})
