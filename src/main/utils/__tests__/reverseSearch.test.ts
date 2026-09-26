import { describe, expect, it, vi } from 'vitest'
import {
  REVERSE_SEARCH_ENGINES,
  getReverseSearchEngine,
  openReverseSearchEngine
} from '../reverseSearch'

describe('REVERSE_SEARCH_ENGINES', () => {
  it('包含五个引擎且 id 唯一（id 兼作菜单子项 key，重复会串键）', () => {
    expect(REVERSE_SEARCH_ENGINES).toHaveLength(5)
    const ids = REVERSE_SEARCH_ENGINES.map((e) => e.id)
    expect(new Set(ids).size).toBe(5)
  })

  it('每个引擎都有非空名称与 https URL', () => {
    for (const e of REVERSE_SEARCH_ENGINES) {
      expect(e.name.trim()).not.toBe('')
      expect(e.url).toMatch(/^https:\/\//)
    }
  })

  it('五个引擎的 URL 与约定一致（改地址要有意识地同步测试）', () => {
    expect(getReverseSearchEngine('google-lens')?.url).toBe('https://lens.google.com/')
    expect(getReverseSearchEngine('bing-visual')?.url).toBe('https://www.bing.com/visualsearch')
    expect(getReverseSearchEngine('yandex')?.url).toBe('https://yandex.com/images/search')
    expect(getReverseSearchEngine('saucenao')?.url).toBe('https://saucenao.com/')
    expect(getReverseSearchEngine('tineye')?.url).toBe('https://tineye.com/')
  })
})

describe('getReverseSearchEngine', () => {
  it('未知 id 返回 null', () => {
    expect(getReverseSearchEngine('nope')).toBeNull()
  })

  it('非字符串输入一律拒绝（IPC 参数不可信）', () => {
    expect(getReverseSearchEngine(undefined)).toBeNull()
    expect(getReverseSearchEngine(42)).toBeNull()
    expect(getReverseSearchEngine(null)).toBeNull()
  })
})

describe('openReverseSearchEngine', () => {
  it('用注入的 openExternal 打开对应引擎 URL', () => {
    const openExternal = vi.fn()
    const engine = openReverseSearchEngine('saucenao', openExternal)
    expect(engine?.url).toBe('https://saucenao.com/')
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith('https://saucenao.com/')
  })

  it('未知引擎不打开任何页面', () => {
    const openExternal = vi.fn()
    expect(openReverseSearchEngine('bad-id', openExternal)).toBeNull()
    expect(openExternal).not.toHaveBeenCalled()
  })
})
