import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { DocTextService } from '../DocTextService'
import { PhotoRepository } from '../../db/repos/PhotoRepository'
import { createTestDb, closeTestDb } from '../../db/__tests__/testDb'

/**
 * 队列语义单测（审查点名的零覆盖区）：
 * - 开关关掉时 enqueue 必须完全不动
 * - 读不到文件（ENOENT/EACCES…）留 NULL，下次批量回填还会重试
 * - 解析器确定性失败落 ''，从「待抽取」清单消失（不反复撞同一个坏文件）
 * 这两条分支的区别就是"扫描件库外挂了网盘盘符"与"文档本身坏了"的差别，
 * 写错任何一条都会静默毁掉检索面。
 */
let db: Database.Database
let photos: PhotoRepository
let dir: string
let prefs: { v: string }
let svc: DocTextService

beforeEach(() => {
  db = createTestDb()
  photos = new PhotoRepository(db)
  dir = mkdtempSync(join(tmpdir(), 'leaf-doctext-'))
  prefs = { v: '1' }
  svc = new DocTextService(
    { get: () => prefs.v, set: (_k: string, val: string) => void (prefs.v = val) },
    photos
  )
})

afterEach(() => {
  closeTestDb(db)
  rmSync(dir, { recursive: true, force: true })
})

/** 队列是 fire-and-forget：轮询等 doc_text 离开 NULL，超时则把当前值交回断言 */
async function docTextOf(id: string): Promise<string | null> {
  const deadline = Date.now() + 5000
  for (;;) {
    const row = db.prepare('SELECT doc_text FROM photo_photos WHERE id = ?').get(id) as {
      doc_text: string | null
    }
    if (row.doc_text !== null || Date.now() > deadline) return row.doc_text
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe('DocTextService 队列语义', () => {
  it('开关关闭时 enqueue 什么都不做', async () => {
    prefs.v = '0'
    const p = photos.addPhoto(join(dir, 'a.md'))
    svc.enqueue(p.id)
    expect(svc.status()).toEqual({ enabled: false, pending: 0 })
    expect(svc.runPending()).toBe(0)
    expect(photos.listDocTextPending(50).map((x) => x.id)).toContain(p.id)
  })

  it('正常抽取：md 正文进 doc_text 并可全文搜索', async () => {
    const file = join(dir, 'note.md')
    writeFileSync(file, '# 记账\n\n发票号码 99001，金额 800 元\n')
    const p = photos.addPhoto(file)
    svc.enqueue(p.id)
    expect(await docTextOf(p.id)).toContain('99001')
    expect(photos.searchPhotos('99001').map((x) => x.id)).toEqual([p.id])
    expect(photos.listDocTextPending(50).map((x) => x.id)).not.toContain(p.id)
  })

  it('文件读不到（ENOENT）→ 留 NULL，仍算待抽取', async () => {
    const missing = join(dir, 'gone.docx')
    const p = photos.addPhoto(missing)
    expect(existsSync(missing)).toBe(false)
    svc.enqueue(p.id)
    await new Promise((r) => setTimeout(r, 600))
    const row = db.prepare('SELECT doc_text FROM photo_photos WHERE id = ?').get(p.id) as {
      doc_text: string | null
    }
    expect(row.doc_text).toBeNull()
    expect(photos.listDocTextPending(50).map((x) => x.id)).toContain(p.id)
  })

  it('解析器确定性失败 → 落空串（认账），不再反复重试', async () => {
    const broken = join(dir, 'broken.docx')
    writeFileSync(broken, '这根本不是 zip 也不是 OOXML')
    const p = photos.addPhoto(broken)
    svc.enqueue(p.id)
    expect(await docTextOf(p.id)).toBe('')
    expect(photos.listDocTextPending(50).map((x) => x.id)).not.toContain(p.id)
  })
})
