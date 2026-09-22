import { describe, it, expect } from 'vitest'
import {
  accuracyToMaxDelta,
  colorListCloseTo,
  deltaE2000,
  hexToLab,
  parseColorList,
  type Lab
} from '../colorMatch'

const lab = (L: number, a: number, b: number): Lab => ({ L, a, b })

/**
 * 数值锚点取参考实现 delta-e@0.0.8 的 getDeltaE00 实测输出（本机 npm pack 跑出来的）。
 * 不是"背出来的论文表格"——本轮最初那版测试就是照记忆写期望值，四条里三条是我记错了配对
 * （ΔE2000 对两色对称，不存在"交换得另一个值"那行）。
 * 已知分叉：两色色相角恰好相差 180° 的边界样本上本实现与 0.0.8 不同（58.3 vs 65.0），
 * 该形态在 ΔE≤40 的筛选阈值里取不到，故不列进锚定集，只在此记下。
 */
describe('deltaE2000 · 与参考实现交叉锚定', () => {
  const golden: Array<[Lab, Lab, number]> = [
    [lab(50, 2.6772, -79.7751), lab(50, 0, -69.2333), 1.435987],
    [lab(50, -1.1848, -84.8006), lab(50, 0, -69.2333), 3.987362],
    [lab(62.8187, -29.7946, -4.086), lab(63.0109, -31.0961, -5.8663), 1.263205]
  ]

  golden.forEach(([a, b, expected], i) => {
    it(`第 ${i + 1} 组与参考实现一致（±0.01）`, () => {
      expect(deltaE2000(a, b)).toBeCloseTo(expected, 2)
    })
  })
})

describe('deltaE2000 · 不变量', () => {
  it('同色差为 0', () => {
    expect(deltaE2000(lab(55, 12, -30), lab(55, 12, -30))).toBe(0)
  })

  it('两色交换结果不变（该度量是对称的）', () => {
    const a = lab(60, -30, 40)
    const b = lab(62, -28, 35)
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 9)
  })

  it('一侧为中性灰时不凭空造出色相差', () => {
    // C₁'=0 → Δh' 取 0；若按 atan2 出来的 ~190° 夹角算，这里会多出一项
    const neutral = lab(50, 0, 0)
    const near = lab(50, -1.2734, -0.3572)
    expect(deltaE2000(neutral, near)).toBeLessThan(2)
    expect(deltaE2000(neutral, near)).toBeGreaterThan(1.5)
  })

  it('明度差主导：同色相、只差 L 时随差值单调上升', () => {
    const base = lab(60, 20, 20)
    const d1 = deltaE2000(base, lab(58, 20, 20))
    const d2 = deltaE2000(base, lab(54, 20, 20))
    const d3 = deltaE2000(base, lab(46, 20, 20))
    expect(d1).toBeLessThan(d2)
    expect(d2).toBeLessThan(d3)
  })
})

describe('hexToLab', () => {
  it('黑/白锚定 L 通道', () => {
    expect(hexToLab('#000000')).toMatchObject({ L: 0 })
    const white = hexToLab('#ffffff')
    expect(white?.L).toBeCloseTo(100, 0)
    expect(white?.a).toBeCloseTo(0, 0)
  })

  it('非法值返回 null 而不是 NaN Lab', () => {
    expect(hexToLab('nope')).toBeNull()
    expect(hexToLab(undefined)).toBeNull()
  })
})

describe('accuracyToMaxDelta', () => {
  it('准确度越大越严（ΔE 上限越小），并钳在 5–40 量程', () => {
    expect(accuracyToMaxDelta(40)).toBe(5)
    expect(accuracyToMaxDelta(5)).toBe(40)
    expect(accuracyToMaxDelta(999)).toBe(5)
    expect(accuracyToMaxDelta(0)).toBe(40)
  })
})

describe('colorListCloseTo / parseColorList', () => {
  it('palette JSON 与裸 hex 两种形态都吃得下', () => {
    expect(parseColorList('["#ff0000","#00ff00"]')).toEqual(['#ff0000', '#00ff00'])
    expect(parseColorList('#ff0000')).toEqual(['#ff0000'])
    expect(parseColorList(null)).toEqual([])
    expect(parseColorList('[oops')).toEqual([])
  })

  it('同色命中、互补色不命中；目标色非法时不放宽', () => {
    expect(colorListCloseTo(['#ff0000'], '#fe0500', 5)).toBe(true)
    expect(colorListCloseTo(['#ff0000'], '#0000ff', 40)).toBe(false)
    expect(colorListCloseTo(['#ff0000', '#0000ff'], '#0000fe', 5)).toBe(true)
    expect(colorListCloseTo(['#ff0000'], 'garbage', 40)).toBe(false)
    expect(colorListCloseTo([], '#ff0000', 40)).toBe(false)
  })
})
