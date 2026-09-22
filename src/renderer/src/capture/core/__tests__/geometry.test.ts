import { describe, expect, it } from 'vitest'
import {
  applyRatioLock,
  clampRect,
  hitHandle,
  moveRect,
  normalizeRect,
  ratioAnchor,
  resizeByHandle,
  resizeRect
} from '../geometry'

describe('normalizeRect', () => {
  it('任意方向拖拽归一为正矩形', () => {
    expect(normalizeRect(100, 100, 40, 60)).toEqual({ x: 40, y: 60, width: 60, height: 40 })
  })
})

describe('clampRect / moveRect / resizeRect', () => {
  const bounds = { width: 1000, height: 800 }
  it('clampRect 把越界区域收回屏内', () => {
    expect(clampRect({ x: 990, y: -10, width: 100, height: 100 }, bounds)).toEqual({
      x: 900,
      y: 0,
      width: 100,
      height: 100
    })
  })
  it('moveRect 不越界', () => {
    const r = { x: 950, y: 100, width: 50, height: 50 }
    expect(moveRect(r, 100, 0, bounds)).toMatchObject({ x: 950 })
    expect(moveRect(r, -1000, 0, bounds)).toMatchObject({ x: 0 })
  })
  it('resizeRect 尊重最小尺寸', () => {
    const r = { x: 100, y: 100, width: 50, height: 50 }
    expect(resizeRect(r, -100, -100, bounds)).toMatchObject({ width: 8, height: 8 })
  })
})

describe('applyRatioLock', () => {
  it('以右下角为锚点锁定 1:1', () => {
    const r = { x: 0, y: 0, width: 200, height: 100 }
    expect(applyRatioLock(r, 1, 'br')).toEqual({ x: 100, y: 0, width: 100, height: 100 })
  })
  it('以左上角为锚点锁定 16:9（高受限）', () => {
    const r = { x: 10, y: 10, width: 100, height: 54 }
    expect(applyRatioLock(r, 16 / 9, 'tl')).toEqual({ x: 10, y: 10, width: 96, height: 54 })
  })
  it('非法 ratio 原样返回', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 }
    expect(applyRatioLock(r, NaN, 'tl')).toBe(r)
    expect(applyRatioLock(r, 0, 'tl')).toBe(r)
  })
})

describe('ratioAnchor', () => {
  it('按拖拽方向给出固定角', () => {
    expect(ratioAnchor({ x: 10, y: 10 }, { x: 50, y: 50 })).toBe('tl')
    expect(ratioAnchor({ x: 10, y: 10 }, { x: 5, y: 50 })).toBe('tr')
    expect(ratioAnchor({ x: 10, y: 10 }, { x: 50, y: 5 })).toBe('bl')
    expect(ratioAnchor({ x: 10, y: 10 }, { x: 5, y: 5 })).toBe('br')
  })
})

describe('hitHandle / resizeByHandle', () => {
  const rect = { x: 100, y: 100, width: 100, height: 100 }
  it('命中四角与内部', () => {
    expect(hitHandle(100, 100, rect)).toBe('nw')
    expect(hitHandle(200, 200, rect)).toBe('se')
    expect(hitHandle(150, 150, rect)).toBe('move')
    expect(hitHandle(10, 10, rect)).toBeNull()
  })
  it('西手柄拖拽保持右边缘不动', () => {
    const next = resizeByHandle(rect, 'w', 130, 150, { width: 1000, height: 800 })
    expect(next).toEqual({ x: 130, y: 100, width: 70, height: 100 })
  })
  it('东手柄拖拽不越右边界', () => {
    const next = resizeByHandle(rect, 'e', 2000, 150, { width: 300, height: 800 })
    expect(next).toEqual({ x: 100, y: 100, width: 200, height: 100 })
  })
})
