// @vitest-environment happy-dom
/**
 * ensurePinned 纯函数：池弹层「点行 = 固定（如未固定）并打开面板」语义的
 * 追加去重逻辑。与 togglePin（图钉 = 纯开关）区分开——点行永不取消固定。
 */
import { describe, it, expect } from 'vitest'
import { ensurePinned, type DimensionId } from '../filterDimensions'

const ids = (...xs: string[]): DimensionId[] => xs as DimensionId[]

describe('filterDimensions · ensurePinned', () => {
  it('未固定 → 追加到末尾', () => {
    expect(ensurePinned(ids('color', 'tags'), 'shape')).toEqual(['color', 'tags', 'shape'])
  })

  it('已固定 → 原样返回（不重复、不取消）', () => {
    const arr = ids('color', 'tags')
    expect(ensurePinned(arr, 'tags')).toEqual(['color', 'tags'])
  })

  it('纯函数：不修改入参数组', () => {
    const arr = ids('color')
    ensurePinned(arr, 'tags')
    expect(arr).toEqual(['color'])
  })
})
