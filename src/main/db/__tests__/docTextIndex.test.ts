/**
 * doc_text 正文索引链路回归（迁移 018 + PhotoRepository 新接口）：
 * - 待抽取清单按 file_ext 命中，抽取后不再出现，清回 null 又出现
 * - 正文经 photo_fts 可搜（CJK ≥3 走 FTS，1-2 字走 LIKE 回退）
 * - 软删行不参与检索
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'

describe('doc_text 正文索引', () => {
  let db: Database.Database
  let photos: PhotoRepository

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
  })
  afterEach(() => closeTestDb(db))

  it('待抽取清单按扩展名命中（docx/pdf/txt 进，jpg 不进）', () => {
    const docx = photos.addPhoto('/a/report.docx')
    const pdf = photos.addPhoto('/scan.pdf')
    const txt = photos.addPhoto('/notes.md')
    photos.addPhoto('/photo.jpg')

    const pending = new Set(photos.listDocTextPending(50).map((x) => x.id))
    expect(pending.has(docx.id)).toBe(true)
    expect(pending.has(pdf.id)).toBe(true)
    expect(pending.has(txt.id)).toBe(true)
    expect(pending.size).toBe(3)
  })

  it('正文写入后可全文检索，且不再算待抽取', () => {
    const p = photos.addPhoto('/a/report.docx')
    photos.updateDocText(p.id, '季度营收同比增长 18%，明细见附表')
    expect(photos.listDocTextPending(50).map((x) => x.id)).not.toContain(p.id)

    expect(photos.searchPhotos('同比增长').map((x) => x.id)).toEqual([p.id]) // 4 字 → FTS
    expect(photos.searchPhotos('增长').map((x) => x.id)).toEqual([p.id]) // 2 字 → LIKE 回退
    expect(photos.getPhotoById(p.id)?.docText).toContain('18%')
  })

  it('清回 null 重新计入待抽取，索引同步为空', () => {
    const p = photos.addPhoto('/b/deck.pptx')
    photos.updateDocText(p.id, '产品路线图与里程碑')
    expect(photos.searchPhotos('路线图')).toHaveLength(1)
    photos.updateDocText(p.id, null)
    expect(photos.searchPhotos('路线图')).toEqual([])
    expect(photos.listDocTextPending(50).map((x) => x.id)).toContain(p.id)
  })

  it('软删行的正文命中不再返回', () => {
    const p = photos.addPhoto('/c/spec.pdf')
    photos.updateDocText(p.id, '接口契约与错误码定义')
    expect(photos.searchPhotos('错误码')).toHaveLength(1)
    photos.deletePhotos([p.id])
    expect(photos.searchPhotos('错误码')).toEqual([])
  })
})
