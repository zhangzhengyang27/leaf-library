// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  clientToImagePoint,
  normalizeDragRect,
  isRectTooSmall,
  atMsToPercent
} from '../useAnnotationOverlay'
import { ANNOTATION_MIN_SIDE } from '@shared/annotations'

/**
 * M1 标注 overlay 的纯函数直打（实施计划 M1 纪律：坐标换算必须可单测）。
 * rect 存源图像素，显示层按 img 显示矩形比例换算——换算错了，阈值断言必红，
 * 所以这里把「任意 scale/pan 都成立」当成一等公民来测。
 */
describe('useAnnotationOverlay · 屏幕→源图像素换算（clientToImagePoint）', () => {
  const fitRect = { left: 100, top: 50, width: 500, height: 400 } // 适应窗口：源图 1000×800 → 一半

  it('适应窗口态：按显示矩形比例折算（比例 0.5）', () => {
    const p = clientToImagePoint(100 + 250, 50 + 200, fitRect, 1000, 800)
    expect(p.x).toBe(500)
    expect(p.y).toBe(400)
  })

  it('放大 + 平移后同样成立（100% 实际像素、显示矩形已平移出视口）', () => {
    // 源图 1000×800 以 1:1 显示、左上角平移到 (-300, -200)
    const rect = { left: -300, top: -200, width: 1000, height: 800 }
    const p = clientToImagePoint(0, 0, rect, 1000, 800) // 视口左上角落在图内 (300, 200)
    expect(p.x).toBe(300)
    expect(p.y).toBe(200)
  })

  it('出界钳回图内：拖出右边/上边不留负坐标与越界值', () => {
    const left = clientToImagePoint(fitRect.left - 50, fitRect.top + 100, fitRect, 1000, 800)
    expect(left.x).toBe(0)
    expect(left.y).toBe(200)
    const right = clientToImagePoint(fitRect.left + 900, fitRect.top + 9999, fitRect, 1000, 800)
    expect(right.x).toBe(1000)
    expect(right.y).toBe(800)
  })

  it('零尺寸不除零：显示矩形或自然尺寸不可用时退 0 点而不是 NaN', () => {
    expect(clientToImagePoint(10, 10, { left: 0, top: 0, width: 0, height: 0 }, 1000, 800)).toEqual(
      {
        x: 0,
        y: 0
      }
    )
    expect(clientToImagePoint(10, 10, fitRect, 0, 0)).toEqual({ x: 0, y: 0 })
  })
})

describe('useAnnotationOverlay · 拖拽矩形归一化（normalizeDragRect / isRectTooSmall）', () => {
  it('从右下往左上拖也归一化成 x/y 左上角、w/h 非负（任意方向圈注）', () => {
    expect(normalizeDragRect(800, 600, 200, 100)).toEqual({ x: 200, y: 100, w: 600, h: 500 })
    expect(normalizeDragRect(500, 500, 500, 500)).toEqual({ x: 500, y: 500, w: 0, h: 0 })
  })

  it('小于 ANNOTATION_MIN_SIDE（源图像素）的拖拽判小：点按与手抖不算框选', () => {
    expect(isRectTooSmall({ x: 0, y: 0, w: ANNOTATION_MIN_SIDE - 1, h: 300 })).toBe(true)
    expect(isRectTooSmall({ x: 0, y: 0, w: 300, h: ANNOTATION_MIN_SIDE - 1 })).toBe(true)
    expect(isRectTooSmall({ x: 10, y: 10, w: ANNOTATION_MIN_SIDE, h: ANNOTATION_MIN_SIDE })).toBe(
      false
    )
  })
})

describe('useAnnotationOverlay · 时间点→进度百分比（atMsToPercent）', () => {
  it('毫秒位置按秒折算成 0~100 的百分比', () => {
    expect(atMsToPercent(30_000, 120)).toBe(25)
    expect(atMsToPercent(0, 120)).toBe(0)
  })

  it('时长不可用（0 / NaN / 负）恒 0，由调用方决定不渲染刻度（对齐 09-26 NaN clamp 口径）', () => {
    expect(atMsToPercent(30_000, 0)).toBe(0)
    expect(atMsToPercent(30_000, Number.NaN)).toBe(0)
    expect(atMsToPercent(30_000, -5)).toBe(0)
  })

  it('越界值不硬造位置：负 atMs 与超时长都钳在 0~100', () => {
    expect(atMsToPercent(-100, 120)).toBe(0)
    expect(atMsToPercent(999_999, 120)).toBe(100)
  })
})
