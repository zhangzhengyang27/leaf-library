// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defaultTitleForView, useLibraryTabs } from '../../stores/libraryTabs'

/**
 * D-011 单视图状态 + 视图历史栈测试。
 * （D-008 多标签机制已移除，见 DECISIONS.md）
 */

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('useLibraryTabs · 初始状态', () => {
  it('默认「全部」，历史栈只有 all', () => {
    const tabs = useLibraryTabs()
    expect(tabs.active.view).toBe('all')
    expect(tabs.active.title).toBe('全部')
    expect(tabs.history).toEqual(['all'])
    expect(tabs.canBack).toBe(false)
    expect(tabs.canForward).toBe(false)
  })
})

describe('useLibraryTabs · setView 与历史栈', () => {
  it('setView 压栈，back/forward 沿栈移动', () => {
    const tabs = useLibraryTabs()
    tabs.setView('favorites', '收藏')
    tabs.setView('folder:f1', '文件夹A')
    expect(tabs.activeView).toBe('folder:f1')
    expect(tabs.history).toEqual(['all', 'favorites', 'folder:f1'])

    tabs.back()
    expect(tabs.activeView).toBe('favorites')
    expect(tabs.active.title).toBe('收藏') // 标题回退为默认兜底
    expect(tabs.canBack).toBe(true)
    expect(tabs.canForward).toBe(true)

    tabs.back()
    expect(tabs.activeView).toBe('all')
    tabs.forward()
    tabs.forward()
    expect(tabs.activeView).toBe('folder:f1')
    expect(tabs.canForward).toBe(false)
  })

  it('回退后 setView 截断前进分支', () => {
    const tabs = useLibraryTabs()
    tabs.setView('favorites', '收藏')
    tabs.setView('map', '地图')
    tabs.back()
    expect(tabs.history).toEqual(['all', 'favorites', 'map'])
    tabs.setView('trash', '回收站')
    expect(tabs.history).toEqual(['all', 'favorites', 'trash'])
    expect(tabs.canForward).toBe(false)
  })

  it('同视图连续 setView 不重复入栈（但筛选更新生效）', () => {
    const tabs = useLibraryTabs()
    tabs.setView('folder:f1', '文件夹A')
    tabs.active.kindFilter = 'image'
    tabs.setView('folder:f1', '文件夹A')
    expect(tabs.history).toEqual(['all', 'folder:f1'])
    expect(tabs.active.kindFilter).toBe('image')
  })

  it('openView 是 setView 的别名', () => {
    const tabs = useLibraryTabs()
    tabs.openView('favorites', '收藏')
    expect(tabs.activeView).toBe('favorites')
    expect(tabs.history).toEqual(['all', 'favorites'])
  })
})

describe('useLibraryTabs · 标题与失效', () => {
  it('syncTitle 修正当前视图标题', () => {
    const tabs = useLibraryTabs()
    tabs.setView('folder:f1', '文件夹')
    tabs.syncTitle('真名')
    expect(tabs.active.title).toBe('真名')
  })

  it('retitleByViewPrefix 只改匹配视图', () => {
    const tabs = useLibraryTabs()
    tabs.setView('folder:f1', '旧名')
    tabs.retitleByViewPrefix('folder:', 'f1', '改名了')
    expect(tabs.active.title).toBe('改名了')
    tabs.setView('all', '全部')
    tabs.retitleByViewPrefix('folder:', 'f1', '再改')
    expect(tabs.active.title).toBe('全部')
  })

  it('invalidateViews 当前视图回退图库，历史剔除失效视图', () => {
    const tabs = useLibraryTabs()
    tabs.setView('folder:gone', '失效')
    tabs.setView('folder:ok', '保留')
    tabs.back() // 回到 folder:gone
    expect(tabs.activeView).toBe('folder:gone')
    tabs.invalidateViews((v) => v === 'folder:gone')
    expect(tabs.active.view).toBe('all')
    expect(tabs.history).not.toContain('folder:gone')
    expect(tabs.history).toContain('folder:ok')
    // 栈指针落在合法位置
    expect(tabs.history[tabs.histIdx]).toBe(tabs.activeView)
  })

  it('defaultTitleForView 覆盖各视角', () => {
    expect(defaultTitleForView('trash')).toBe('回收站')
    expect(defaultTitleForView('unsorted')).toBe('未分类')
    expect(defaultTitleForView('recent')).toBe('最近添加')
    expect(defaultTitleForView('recents')).toBe('最近查看')
    expect(defaultTitleForView('similar:p1')).toBe('相似图片')
    expect(defaultTitleForView('smart:x')).toBe('智能文件夹')
    expect(defaultTitleForView('folder:x')).toBe('文件夹')
    expect(defaultTitleForView('whatever')).toBe('图库')
  })
})

describe('useLibraryTabs · 持久化', () => {
  it('状态写入新 key 且新 store 恢复（含历史栈）', () => {
    const tabs = useLibraryTabs()
    tabs.setView('folder:keep', '我的文件夹')
    expect(localStorage.getItem('library.tab.v2')).toBeTruthy()

    setActivePinia(createPinia())
    const restored = useLibraryTabs()
    expect(restored.activeView).toBe('folder:keep')
    expect(restored.active.title).toBe('我的文件夹')
    expect(restored.history).toEqual(['all', 'folder:keep'])
    expect(restored.canBack).toBe(true)
  })

  it('损坏的持久化数据回退默认', () => {
    localStorage.setItem('library.tab.v2', '{broken json')
    const tabs = useLibraryTabs()
    expect(tabs.active.view).toBe('all')
    expect(tabs.history).toEqual(['all'])
  })

  it('旧版 tabs.v1 数据不再读取', () => {
    localStorage.setItem('library.tabs.v1', JSON.stringify({ tabs: [], activeId: 'x' }))
    const tabs = useLibraryTabs()
    expect(tabs.active.view).toBe('all')
  })
})
