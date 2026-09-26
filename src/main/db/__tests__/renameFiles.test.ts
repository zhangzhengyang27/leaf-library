// @vitest-environment node
/**
 * PhotoRepository.renameFiles · 批量重命名求值链单测（P2 token 扩容）。
 *
 * 范式照 photoDeletePaths.test.ts（testDb 内存库 + 真磁盘 tmp 文件）：
 * - pattern 路径现在走 shared evaluateRenameTokens 展开全部 token（Eagle 可行子集），
 *   这里钉「DB 上下文 → 求值 → 消毒 → 落盘改名」的整条链，逐 token 抽查
 * - {id, name} 直传路径（弹窗主路径）不回归
 * - 序号占号语义不回归：冲突跳过的条目也占号
 * - D-020「先收库再改名」的守卫在 PhotoDataStore（stores/__tests__/d020TrashGuard.test.ts），
 *   repository 保持纯数据层，不在此重复
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'

describe('PhotoRepository · renameFiles pattern 求值链（P2 token 扩容）', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let root: string
  const ts = new Date(2026, 8, 1, 10, 0, 0).getTime()

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    root = mkdtempSync(join(tmpdir(), 'leaf-rename-'))
  })
  afterEach(() => {
    closeTestDb(db)
    rmSync(root, { recursive: true, force: true })
  })

  /** 落一个真实文件并入库；metadata 控制求值上下文里的可选字段 */
  function seed(
    rel: string,
    metadata?: {
      width?: number
      height?: number
      fileSize?: number
      fsCreatedAt?: number
      createdAt?: number // → taken_at（EXIF 拍摄时间）
    }
  ): string {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, 'x')
    return photos.addPhoto(p, metadata).id
  }

  /** 给素材挂两个标签（{tags} 用）；排序期望：宠物 < 风（UTF-16 码点序） */
  function attachTags(photoId: string, names: [string, string]): void {
    const ids = names.map((name, i) => {
      const id = `tag-${i}`
      db.prepare(
        `INSERT INTO tag_tags (id, name, usage_count, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`
      ).run(id, name, ts, ts)
      return id
    })
    const insert = db.prepare(
      `INSERT INTO photo_tags (photo_id, tag_id, created_at) VALUES (?, ?, ?)`
    )
    for (const id of ids) insert.run(photoId, id, ts)
  }

  function fileNameOf(id: string): string {
    return (
      db.prepare(`SELECT file_name FROM photo_photos WHERE id = ?`).get(id) as { file_name: string }
    ).file_name
  }

  it('{id, name} 直传路径不回归：改名落盘 + DB 同步 + 扩展名保留', () => {
    const id = seed('a/IMG_1234.jpg')
    const r = photos.renameFiles([{ id, name: '旅行-新名' }])
    expect(r.renamed).toHaveLength(1)
    expect(r.renamed[0].fileName).toBe('旅行-新名.jpg')
    expect(existsSync(r.renamed[0].filePath)).toBe(true)
    expect(existsSync(join(root, 'a/IMG_1234.jpg'))).toBe(false)
    expect(fileNameOf(id)).toBe('旅行-新名.jpg')
  })

  it('pattern 路径展开属性族：{parent}/{rating}/{width}/{height}/{id}/{tags}/{library}', () => {
    const id = seed('a/photo.png', { width: 1920, height: 1080 })
    attachTags(id, ['风景', '宠物'])
    db.prepare(
      `INSERT INTO photo_folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
    ).run('f1', '旅行', ts, ts)
    db.prepare(`UPDATE photo_photos SET folder_id = 'f1' WHERE id = ?`).run(id)
    photos.setRating(id, 4)

    const r = photos.renameFiles([{ id, pattern: '{parent}-{rating}-{width}x{height}-{tags}' }], {
      libraryName: '测试库'
    })
    expect(r.renamed[0].fileName).toBe('旅行-4-1920x1080-宠物-风景.png')
  })

  it('pattern 路径展开日期族：{add date}/{create date}/{modified date}/{taken date}', () => {
    // fsCreated 2026_01_02 / EXIF 拍摄 2025_12_31；fsModified 与 imported_at 由 addPhoto
    // 落真实值（stat mtime / now()），用正则与动态当天断言，不把测试钉死在运行日期上
    const id = seed('b/vacation.jpg', {
      fsCreatedAt: new Date(2026, 0, 2, 8, 0, 0).getTime(),
      createdAt: new Date(2025, 11, 31, 23, 0, 0).getTime()
    })
    const r = photos.renameFiles([
      { id, pattern: '{add date} {create date} {modified date} {taken date}' }
    ])
    expect(r.renamed[0].fileName).toMatch(
      /^\d{4}-\d\d-\d\d 2026_01_02 \d{4}_\d\d_\d\d 2025_12_31\.jpg$/
    )
  })

  it('{taken date} 缺失展开空串、{today} 展开当天（本地时区）', () => {
    const id = seed('c/shot.png') // 无 EXIF：taken_at 落 now()，这里 UPDATE 清掉验证空串语义
    db.prepare(`UPDATE photo_photos SET taken_at = NULL WHERE id = ?`).run(id)
    const today = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    const r = photos.renameFiles([{ id, pattern: '{taken date}~{today}' }])
    expect(r.renamed[0].fileName).toBe(`~${today}.png`)
  })

  it('{size}/{duration}/{n} 与未知 token 字面保留 + 消毒', () => {
    const id = seed('d/big.mp4', { fileSize: 5 * 1024 * 1024 })
    db.prepare(`UPDATE photo_photos SET duration_ms = 185000 WHERE id = ?`).run(id)
    const r = photos.renameFiles([{ id, pattern: '{size}-{duration}-{nope}{n}', start: 2 }])
    // 未知 {nope} 按约定落成字面量（安全闸拦的是模型产出，用户手输以预览所见为准）
    expect(r.renamed[0].fileName).toBe('5MB-3m05s-{nope}2.mp4')
  })

  it('序号占号语义不回归：冲突跳过的条目也占号', () => {
    const a = seed('e/one.jpg')
    const b = seed('e/two.jpg')
    // 预先占住目标名 1.jpg：第一条冲突
    writeFileSync(join(root, 'e/1.jpg'), 'x')
    const r = photos.renameFiles([
      { id: a, pattern: '{n}', start: 1 },
      { id: b, pattern: '{n}', start: 1 }
    ])
    expect(r.conflicts.map((c) => c.fileName)).toEqual(['1.jpg'])
    expect(r.renamed.map((x) => x.fileName)).toEqual(['2.jpg'])
    expect(fileNameOf(b)).toBe('2.jpg')
  })

  it('空 pattern / 空结果回退：base 为空时用扩展名主干兜底（既有语义）', () => {
    const id = seed('f/only.png')
    const r = photos.renameFiles([{ id, pattern: '' }])
    // 既有实现：base 为空 → extname 去点作主干 → 'png' + 原扩展名
    expect(r.renamed[0].fileName).toBe('png.png')
  })
})
