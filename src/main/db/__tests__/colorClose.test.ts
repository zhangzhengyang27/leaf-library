/**
 * G3 · 颜色相似度下推（color_close UDF + CIEDE2000）
 *
 * 阈值档位不是随手挑的：先量出各测试色与目标色 #ff0000 的 ΔE2000
 * （#e8202a 7.04 / #d94b4b 11.74 / #ff8080 19.92 / #1a2bd4 52.26 / #00ff00 86.61），
 * 再按 accuracyToMaxDelta(a) = 45 − a 反推 accuracy，这样每一档断言都在检验
 * 「刚好跨过边界的一侧命中、另一侧不命中」，而不是笼统的像不像。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from './testDb'
import { PhotoRepository } from '../repos/PhotoRepository'
import { buildSmartAlbumWhere } from '../smartAlbumRules'

describe('buildSmartAlbumWhere · color_close', () => {
  let db: Database.Database
  let photos: PhotoRepository
  let red: { id: string }
  let nearRed: { id: string }
  let paleRed: { id: string }
  let blue: { id: string }

  beforeEach(() => {
    db = createTestDb()
    photos = new PhotoRepository(db)
    const seed = (name: string, hex: string): { id: string } => {
      const p = photos.addPhoto(`/${name}.png`)
      photos.updateBackfilledPalette(p.id, [hex])
      return p
    }
    red = seed('red', '#ff0000')
    nearRed = seed('near-red', '#e8202a')
    paleRed = seed('pale-red', '#ff8080')
    blue = seed('blue', '#1a2bd4')
  })
  afterEach(() => closeTestDb(db))

  const idsFor = (rules: Parameters<typeof buildSmartAlbumWhere>[0]): string[] => {
    const { whereSql, params } = buildSmartAlbumWhere(rules)
    return (
      db
        .prepare(
          `SELECT id FROM photo_photos WHERE deleted_at IS NULL AND ${whereSql} ORDER BY file_name`
        )
        .all(...(params as never[])) as Array<{ id: string }>
    ).map((r) => r.id)
  }

  const close = (accuracy: number): string[] => idsFor({ colorClose: { hex: '#ff0000', accuracy } })

  it('准确度 38（ΔE≤7）只收近乎同色的那张；放到 37（ΔE≤8）放进 #e8202a（ΔE 7.04）', () => {
    expect(close(38)).toEqual([red.id])
    const ids = close(37)
    expect(ids).toContain(nearRed.id)
    expect(ids).toContain(red.id)
    expect(ids).not.toContain(paleRed.id)
  })

  it('准确度 25（ΔE≤20）放进淡红，仍不收蓝', () => {
    const ids = close(25)
    expect(ids).toContain(red.id)
    expect(ids).toContain(paleRed.id)
    expect(ids).not.toContain(blue.id)
  })

  it('放到量程最宽（准确度 5 → ΔE≤40）也吃不到蓝（ΔE 52.3）', () => {
    expect(close(5)).not.toContain(blue.id)
    expect(close(5)).toHaveLength(3)
  })

  it('与色相桶档可以叠加（同维度两种取法不互斥）', () => {
    // 蓝的色相桶是 blue，红的偏红：两档 AND 起来只剩红本身
    const ids = idsFor({
      colorHue: 'red',
      colorClose: { hex: '#ff0000', accuracy: 25 }
    })
    expect(ids).toContain(red.id)
    expect(ids).not.toContain(blue.id)
  })

  it('色值格式不合法时整条谓词不成立也不报错（IPC 边界收窄）', () => {
    expect(() => idsFor({ colorClose: { hex: 'red', accuracy: 25 } })).not.toThrow()
    // hex 非法 → 谓词根本不注入，等价于「没设颜色条件」：返回全部
    expect(idsFor({ colorClose: { hex: 'red', accuracy: 25 } })).toHaveLength(4)
  })

  it('色板里任一色命中即可（Eagle 是多色板而非单主色）', () => {
    const p = photos.addPhoto('/mixed.png')
    photos.updateBackfilledPalette(p.id, ['#1a2bd4', '#0a0a0a', '#ff0000'])
    expect(idsFor({ colorClose: { hex: '#ff0000', accuracy: 40 } })).toContain(p.id)
  })
})
