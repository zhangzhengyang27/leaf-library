/**
 * F1（⌘X/⌘V 剪切移动）单测：
 * - resolvePasteTarget：粘贴目标判定（folder:/unsorted/其余视图）
 * - usePhotoClipboard：剪切态设置、pasteMove 消费语义与目标 IPC 参数
 */
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const assignPhotosToFolder = vi.hoisted(() => vi.fn(async () => 2))

Object.defineProperty(window, 'api', {
  value: {
    photos: {
      assignPhotosToFolder
    }
  },
  writable: true
})

import { resolvePasteTarget, usePhotoClipboard } from '../usePhotoClipboard'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoSelection } from '../usePhotoSelection'

// 单例 composables 首次构建时捕获 store 实例——全文件共享同一 Pinia，
// 各用例直接改 tabs.tab.view（不重建 pinia，避免单例与测试各持一份）。
setActivePinia(createPinia())

describe('resolvePasteTarget（粘贴目标判定）', () => {
  it('folder: 视图解析为文件夹 id', () => {
    expect(resolvePasteTarget('folder:f1')).toBe('f1')
  })

  it('unsorted 解析为 null（移出分组）', () => {
    expect(resolvePasteTarget('unsorted')).toBeNull()
  })

  it('其余视图返回 blocked', () => {
    expect(resolvePasteTarget('all')).toBe('blocked')
    expect(resolvePasteTarget('recent')).toBe('blocked')
    expect(resolvePasteTarget('tag:t1')).toBe('blocked')
    expect(resolvePasteTarget('smart:s1')).toBe('blocked')
  })
})

describe('usePhotoClipboard（⌘X 剪切 / ⌘V 粘贴移动）', () => {
  beforeEach(() => {
    assignPhotosToFolder.mockClear()
    usePhotoClipboard().clearCut()
    usePhotoSelection().clearSelection()
  })

  it('cutSelection：无选中时不设置剪切态', () => {
    const clipboard = usePhotoClipboard()
    clipboard.cutSelection()
    expect(clipboard.cutPhotoIds.value).toEqual([])
  })

  it('cutSelection：显式 ids 进入剪切态；pasteMove 后清空', async () => {
    const clipboard = usePhotoClipboard()
    const tabs = useLibraryTabs()
    tabs.tab.view = 'folder:f1'

    clipboard.cutSelection(['a', 'b'])
    expect(clipboard.cutPhotoIds.value).toEqual(['a', 'b'])

    const consumed = await clipboard.pasteMove()
    expect(consumed).toBe(true)
    expect(assignPhotosToFolder).toHaveBeenCalledWith('f1', ['a', 'b'])
    expect(clipboard.cutPhotoIds.value).toEqual([])
  })

  it('unsorted 视图粘贴 = 移出分组（target null）', async () => {
    const clipboard = usePhotoClipboard()
    const tabs = useLibraryTabs()
    tabs.tab.view = 'unsorted'

    clipboard.cutSelection(['x'])
    await clipboard.pasteMove()
    expect(assignPhotosToFolder).toHaveBeenCalledWith(null, ['x'])
  })

  it('不可粘贴视图：消费事件、不调 IPC、保留剪切态', async () => {
    const clipboard = usePhotoClipboard()
    const tabs = useLibraryTabs()
    tabs.tab.view = 'all'

    clipboard.cutSelection(['a'])
    const consumed = await clipboard.pasteMove()
    expect(consumed).toBe(true)
    expect(assignPhotosToFolder).not.toHaveBeenCalled()
    expect(clipboard.cutPhotoIds.value).toEqual(['a'])
  })

  it('空剪切态：pasteMove 返回 false（不消费，回落文件导入）', async () => {
    const clipboard = usePhotoClipboard()
    const consumed = await clipboard.pasteMove()
    expect(consumed).toBe(false)
    expect(assignPhotosToFolder).not.toHaveBeenCalled()
  })
})
