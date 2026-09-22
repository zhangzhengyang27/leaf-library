// @vitest-environment happy-dom
/**
 * 波形纯计算的边界（画布画得好不好看测不了，但这两处是会静默坏掉的算术）
 */
import { describe, expect, it } from 'vitest'
import { columnPeaks, seekRatioFromPointer } from '../audioWaveform'

describe('seekRatioFromPointer', () => {
  it('中点 0.5，两端钳在 [0,1]', () => {
    expect(seekRatioFromPointer(100, 200, 200)).toBe(0.5)
    expect(seekRatioFromPointer(100, 200, -50)).toBe(0)
    expect(seekRatioFromPointer(100, 200, 9999)).toBe(1)
  })

  it('宽度 0（折叠/未布局）返回 0 而不是 NaN', () => {
    const r = seekRatioFromPointer(100, 0, 150)
    expect(r).toBe(0)
    expect(Number.isNaN(r)).toBe(false)
  })
})

describe('columnPeaks', () => {
  const p = (arr: number[]): number[] => columnPeaks(arr, arr.length)

  it('归一化到 0–1', () => {
    expect(p([0, 255, 51])).toEqual([0, 1, 0.2])
  })

  it('降采样取区间最大值：单点峰不会被平均抹掉', () => {
    // 4 峰 → 1 列：均值是 50/255≈0.196，取最大才是 0.784
    expect(columnPeaks([0, 200, 0, 0], 1)).toEqual([200 / 255])
    // 8 → 4：每列是相邻两峰的最大
    expect(columnPeaks([0, 100, 0, 200, 0, 0, 50, 0], 4)).toEqual([
      100 / 255,
      200 / 255,
      0,
      50 / 255
    ])
  })

  it('升采样复制最近列（没有信息可插）', () => {
    expect(columnPeaks([100, 200], 4)).toEqual([100 / 255, 100 / 255, 200 / 255, 200 / 255])
  })

  it('空峰值 / 空列 / null 都给空数组，不抛', () => {
    expect(columnPeaks(null, 10)).toEqual([])
    expect(columnPeaks([], 10)).toEqual([])
    expect(columnPeaks([10, 20], 0)).toEqual([])
  })
})
