// @vitest-environment happy-dom
/**
 * 筛选预设的存储语义：重名覆盖、坏数据不入队、空条件不静默存、上限守住。
 * 每条都对应一个"存进去之后应用才发现不对"的场景，宁可在保存时就拒掉。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  addSavedFilter,
  loadSavedFilters,
  removeSavedFilter,
  summarizeFilter
} from '../savedFilters'

beforeEach(() => {
  localStorage.clear()
})

describe('savedFilters · 增删', () => {
  it('空条件拒收，空名拒收', () => {
    expect(addSavedFilter('空的', {}).error).toBe('当前没有可保存的筛选条件')
    expect(addSavedFilter('   ', { favorite: true }).error).toBe('预设名不能为空')
    expect(loadSavedFilters()).toHaveLength(0)
  })

  it('同名是覆盖而不是多出一条', () => {
    addSavedFilter('红图', { colorHue: 'red' })
    const { error, list } = addSavedFilter('红图', { colorClose: { hex: '#FF0000', accuracy: 20 } })
    expect(error).toBeUndefined()
    expect(list).toHaveLength(1)
    expect(list[0].rules).toHaveProperty('colorClose')
  })

  it('删除只影响那一条', () => {
    const a = addSavedFilter('A', { favorite: true }).list
    addSavedFilter('B', { untaggedOnly: true })
    expect(loadSavedFilters()).toHaveLength(2)
    removeSavedFilter(a[0].id)
    expect(loadSavedFilters().map((f) => f.name)).toEqual(['B'])
  })
})

describe('savedFilters · 读取容错', () => {
  it('坏 JSON / 非数组 / 缺字段都不炸也不入队', () => {
    localStorage.setItem('leaf.saved-filters', '{oops')
    expect(loadSavedFilters()).toEqual([])
    localStorage.setItem('leaf.saved-filters', '{"not":"array"}')
    expect(loadSavedFilters()).toEqual([])
    localStorage.setItem(
      'leaf.saved-filters',
      JSON.stringify([{ id: 'ok', name: '好', rules: {}, createdAt: 1 }, { id: 'x' }, null, 7])
    )
    expect(loadSavedFilters().map((f) => f.id)).toEqual(['ok'])
  })
})

describe('savedFilters · 摘要', () => {
  it('把规则念成人话（列表上要看得出这条预设是什么条件）', () => {
    expect(
      summarizeFilter({
        tagNamesAny: ['叶子', '植物'],
        folderIds: ['f1', 'none'],
        colorClose: { hex: '#FF0000', accuracy: 25 },
        ratioWidth: 16,
        ratioHeight: 9,
        match: 'any'
      })
    ).toBe('标签 2 · 文件夹 2 · 近似色 #FF0000（准确度 25） · 比例 16:9 · 任一条件')
  })

  it('空规则也有可读文案', () => {
    expect(summarizeFilter({})).toBe('（无可见条件）')
  })
})
