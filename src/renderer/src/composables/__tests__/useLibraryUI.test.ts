// @vitest-environment happy-dom
/**
 * useLibraryUI · 筛选行可见性开关（D-012 修复轮）：
 * 筛选行默认隐藏（十八轮，对齐 Eagle 默认形态），但「固定维度」必须立即可见——
 * ensureFilterBarVisible 供固定/点行路径调用：隐藏时展开并持久化，已可见时幂等。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryUI } from '../useLibraryUI'

describe('useLibraryUI · ensureFilterBarVisible', () => {
  beforeEach(() => {
    localStorage.clear()
    // 模块单例 ref：每个用例前显式压回隐藏态（loadFlag 默认即 false）
    localStorage.setItem('leaf.filterbar-visible', '0')
    useLibraryUI().filterBarVisible.value = false
  })

  it('隐藏态调用 → 展开并持久化 "1"', () => {
    const ui = useLibraryUI()
    expect(ui.filterBarVisible.value).toBe(false)
    ui.ensureFilterBarVisible()
    expect(ui.filterBarVisible.value).toBe(true)
    expect(localStorage.getItem('leaf.filterbar-visible')).toBe('1')
  })

  it('已可见时调用 → 幂等不翻转', () => {
    const ui = useLibraryUI()
    ui.filterBarVisible.value = true
    ui.ensureFilterBarVisible()
    expect(ui.filterBarVisible.value).toBe(true)
  })
})
