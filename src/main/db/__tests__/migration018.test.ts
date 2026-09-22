import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../migrations'
import { PhotoRepository } from '../repos/PhotoRepository'

/**
 * 018 在"已有数据的库"上跑一次——现有 docTextIndex.test.ts 是空表起库，
 * 覆盖不到这个迁移真正的风险：删触发器 → 删外部内容 FTS 表 → 带新列重建 →
 * rebuild，全部发生在一堆存量行（含 ocr_text）之上。
 *
 * 断言的是升级后索引对**老数据**依然有效、三个触发器确实换成了带 doc_text 的版本。
 */
const UP_TO_17 = migrations.filter((m) => m.version < 18)
const M18 = migrations.find((m) => m.version === 18)

function dbAtV17(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE meta (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`)
  for (const m of UP_TO_17) {
    db.transaction(() => {
      m.up(db)
      db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(m.version, 1)
    })()
  }
  return db
}

describe('迁移 018（存量库升级）', () => {
  it('老数据的文件名/描述/OCR 命中在升级后仍然可搜，且新列可写可搜', () => {
    expect(M18).toBeTruthy()
    const db = dbAtV17()
    const photos = new PhotoRepository(db)
    const legacy = photos.addPhoto('/old/扫描件.pdf')
    photos.setDescription(legacy.id, '黄昏时分的城市天际线')
    photos.updateOcrText(legacy.id, '发票号码 12345')

    // 升级前不该有 doc_text 列
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) c FROM pragma_table_info('photo_photos') WHERE name='doc_text'`)
          .get() as { c: number }
      ).c
    ).toBe(0)

    db.transaction(() => {
      M18!.up(db)
      db.prepare('INSERT INTO meta (version, applied_at) VALUES (?, ?)').run(18, 2)
    })()

    // 1) 老行仍在索引里（rebuild 生效）
    expect(photos.searchPhotos('城市天际').map((p) => p.id)).toEqual([legacy.id])
    expect(photos.searchPhotos('发票号码').map((p) => p.id)).toEqual([legacy.id])
    // 2) 老行默认未抽取
    expect(photos.getPhotoById(legacy.id)?.docText).toBeUndefined()

    // 3) 重建后的 UPDATE 触发器要把 doc_text 同步进索引（漏改触发器时这里必红）
    photos.updateDocText(legacy.id, '季度营收同比增长 18%')
    expect(photos.searchPhotos('同比增长').map((p) => p.id)).toEqual([legacy.id])
    photos.updateDocText(legacy.id, '改成别的措辞')
    expect(photos.searchPhotos('同比增长')).toEqual([])
    expect(photos.searchPhotos('措辞').map((p) => p.id)).toEqual([legacy.id])

    // 4) 重建后的 DELETE 触发器仍工作：硬删行不留幽灵命中
    photos.deletePhotos([legacy.id])
    db.prepare('DELETE FROM photo_photos WHERE id = ?').run(legacy.id)
    expect(photos.searchPhotos('措辞')).toEqual([])
    db.close()
  })

  it('升级后新插入的行按新触发器入索引（含正文）', () => {
    const db = dbAtV17()
    db.transaction(() => {
      M18!.up(db)
    })()
    const photos = new PhotoRepository(db)
    const p = photos.addPhoto('/new/report.docx')
    photos.updateDocText(p.id, '产品路线图与里程碑')
    expect(photos.searchPhotos('路线图').map((x) => x.id)).toEqual([p.id])
    db.close()
  })
})
