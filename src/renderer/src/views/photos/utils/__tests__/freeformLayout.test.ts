/**
 * F10 自由网格布局纯函数单测：自动占位 / 吸附 / 缩放钳制。
 */
import { describe, expect, it } from 'vitest'
import { autoPlace, clampScale, snap, type FreeformRect } from '../freeformLayout'

describe('autoPlace', () => {
  it('空画布：首项落原点，后续项按列排布不重叠', () => {
    const out = autoPlace([200, 200, 200], [])
    expect(out[0]).toEqual({ x: 0, y: 0 })
    expect(out[1].x).toBeGreaterThan(0)
    // 三项各占一列，x 互不相同
    const xs = out.map((p) => p.x)
    expect(new Set(xs).size).toBe(3)
  })

  it('已有占用时避开现有矩形', () => {
    const existing: FreeformRect[] = [
      { x: 0, y: 0, w: 168, h: 200 },
      { x: 176, y: 0, w: 168, h: 200 }
    ]
    const [p] = autoPlace([200], existing)
    // 前两列被占，应放到第三列
    expect(p.x).toBe(352)
    expect(p.y).toBe(0)
  })

  it('一行放不下换行', () => {
    const narrow = 300 // 只容得下一列（168 + 8 步进下 176+168>300）
    const out = autoPlace([100, 100], [], 168, narrow)
    expect(out[0]).toEqual({ x: 0, y: 0 })
    expect(out[1].x).toBe(0)
    expect(out[1].y).toBeGreaterThan(0)
  })

  it('已占区域上方留空时补位到下方（不重叠即可）', () => {
    const existing: FreeformRect[] = [{ x: 0, y: 0, w: 168, h: 500 }]
    const [p] = autoPlace([100], existing)
    expect(p.x).toBe(176)
  })
})

describe('snap / clampScale', () => {
  it('snap 吸附到 8px 网格', () => {
    expect(snap(3)).toBe(0)
    expect(snap(5)).toBe(8)
    expect(snap(13)).toBe(16)
    expect(snap(-5)).toBe(-8)
  })

  it('clampScale 钳制范围', () => {
    expect(clampScale(0.05)).toBe(0.2)
    expect(clampScale(1.5)).toBe(1.5)
    expect(clampScale(99)).toBe(4)
  })
})
