/**
 * 刻度 hover 浮层定位纯函数单测：水平收进 / 贴顶翻转 / 默认值。
 * DOM 测量在 AnnotationTickRail 组件层，这里只打换算。
 */
import { describe, expect, it } from 'vitest'
import { fmtMsPosition, placeTickTooltip } from '../tickTooltip'

describe('placeTickTooltip · 水平定位', () => {
  it('刻度居中且浮层不越界：水平居中，浮在刻度上方', () => {
    // rail 600 宽，刻度在 300，浮层 120×24 → 理想 left = 300 - 60 = 240
    const p = placeTickTooltip({
      tickX: 300,
      tickY: 6,
      railWidth: 600,
      tooltipWidth: 120,
      tooltipHeight: 24,
      spaceAbove: 500,
      spaceBelow: 500
    })
    expect(p.align).toBe('center')
    expect(p.left).toBe(240)
    // 上方：tickY - gap - h = 6 - 6 - 24
    expect(p.top).toBe(-24)
    expect(p.flipVertical).toBe(false)
  })

  it('刻度贴近左缘（0%）：浮层整体收进，左缘钳到 margin', () => {
    const p = placeTickTooltip({
      tickX: 0,
      tickY: 6,
      railWidth: 600,
      tooltipWidth: 120,
      tooltipHeight: 24,
      spaceAbove: 500,
      spaceBelow: 500
    })
    expect(p.align).toBe('start')
    expect(p.left).toBe(4) // margin 默认 4
    expect(p.left).toBeGreaterThanOrEqual(0)
  })

  it('刻度贴近右缘（100%）：浮层右缘钳到 railWidth - margin，不出右界', () => {
    const p = placeTickTooltip({
      tickX: 598,
      tickY: 6,
      railWidth: 600,
      tooltipWidth: 120,
      tooltipHeight: 24,
      spaceAbove: 500,
      spaceBelow: 500
    })
    expect(p.align).toBe('end')
    expect(p.left).toBe(600 - 4 - 120)
    expect(p.left + 120).toBeLessThanOrEqual(600)
  })

  it('浮层比 rail 还宽：钳到左 margin，不出左界（病态输入兜底）', () => {
    const p = placeTickTooltip({
      tickX: 100,
      tickY: 6,
      railWidth: 80,
      tooltipWidth: 200,
      tooltipHeight: 24,
      spaceAbove: 500,
      spaceBelow: 500
    })
    expect(p.align).toBe('start')
    expect(p.left).toBe(4)
  })

  it('自定义 gap / margin 生效', () => {
    const p = placeTickTooltip({
      tickX: 300,
      tickY: 8,
      railWidth: 600,
      tooltipWidth: 100,
      tooltipHeight: 20,
      spaceAbove: 500,
      spaceBelow: 500,
      gap: 10,
      margin: 8
    })
    expect(p.top).toBe(8 - 10 - 20)
    expect(p.left).toBe(300 - 50)
    // margin=8 影响收进阈值：刻度在 12 时居中 left = 12-50 = -38 < 8 → 收进
    const near = placeTickTooltip({
      tickX: 12,
      tickY: 8,
      railWidth: 600,
      tooltipWidth: 100,
      tooltipHeight: 20,
      spaceAbove: 500,
      spaceBelow: 500,
      gap: 10,
      margin: 8
    })
    expect(near.align).toBe('start')
    expect(near.left).toBe(8)
  })
})

describe('placeTickTooltip · 垂直翻转', () => {
  it('上方空间不足且下方够放：翻到刻度下方（flipVertical）', () => {
    const p = placeTickTooltip({
      tickX: 300,
      tickY: 6,
      railWidth: 600,
      tooltipWidth: 120,
      tooltipHeight: 24,
      spaceAbove: 30, // 需要 h + gap + margin = 34，不够
      spaceBelow: 200
    })
    expect(p.flipVertical).toBe(true)
    expect(p.top).toBe(6 + 6) // tickY + gap
  })

  it('上下都不足：保持上方兜底（叠着也比截断强）', () => {
    const p = placeTickTooltip({
      tickX: 300,
      tickY: 6,
      railWidth: 600,
      tooltipWidth: 120,
      tooltipHeight: 24,
      spaceAbove: 10,
      spaceBelow: 10
    })
    expect(p.flipVertical).toBe(false)
    expect(p.top).toBe(6 - 6 - 24)
  })

  it('无边界（Infinity，happy-dom 等找不到裁剪容器时）：不翻转', () => {
    const p = placeTickTooltip({
      tickX: 300,
      tickY: 6,
      railWidth: 600,
      tooltipWidth: 120,
      tooltipHeight: 24,
      spaceAbove: Number.POSITIVE_INFINITY,
      spaceBelow: Number.POSITIVE_INFINITY
    })
    expect(p.flipVertical).toBe(false)
  })
})

describe('fmtMsPosition', () => {
  it('毫秒 → m:ss（与检查器 annotationStamp 同口径）', () => {
    expect(fmtMsPosition(0)).toBe('0:00')
    expect(fmtMsPosition(5_000)).toBe('0:05')
    expect(fmtMsPosition(65_000)).toBe('1:05')
    // 四舍五入：1199ms 记 1s
    expect(fmtMsPosition(1_199)).toBe('0:01')
    expect(fmtMsPosition(3_600_000)).toBe('60:00')
  })
})
