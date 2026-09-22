// @vitest-environment happy-dom
/**
 * 空格 QuickLook 的锚点必须跟着「刚点的那一行」。
 *
 * 旧实现只认 preview.lastViewedId（仅由 openPhoto 写入），从网格/列表点选后
 * 它仍是 null → 回落到 pool[0]，于是「点第 7 行按空格，弹出来的是第 1 个素材」。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import type { Photo } from '@renderer/types/photo'
import { usePhotoData } from '../usePhotoData'
import { usePhotoSelection } from '../usePhotoSelection'
import { installSearchPools } from '../usePhotoFilters'
import { usePreview } from '../usePreview'
import { usePhotoKeyboard } from '../usePhotoKeyboard'

function makePhoto(id: string): Photo {
  return {
    id,
    filePath: `/tmp/${id}.png`,
    fileName: `${id}.png`,
    fileSize: 1000,
    createdAt: 0,
    importedAt: 0,
    modifiedAt: 0,
    tags: [],
    isFavorite: false,
    dateSection: '2026-09-01',
    rating: 0,
    source: 'manual',
    thumbStatus: 1,
    kind: 'image'
  } as unknown as Photo
}

let unbind: (() => void) | null = null

beforeAll(() => {
  setActivePinia(createPinia())
})

beforeEach(() => {
  localStorage.clear()
  useLibraryTabs().resetForTests()
  installSearchPools().similarMatches.value = []
  const data = usePhotoData()
  data.allPhotos.value = ['a', 'b', 'c', 'd'].map(makePhoto)
  usePreview().close()
  usePhotoSelection().clearSelection()
  const keyboard = usePhotoKeyboard()
  const sel = usePhotoSelection()
  keyboard.navActiveId.value = null
  // 锚点链是「选中 → 高亮 → 最近查看 → 池首」，前一条用例会把最近查看项留给下一条
  usePreview().lastViewedId.value = null
  // 键盘层的选中项来自 index.vue 注入的 ctx，测试里按同一契约喂进去
  keyboard.bind({
    selectedIds: sel.selectedIds,
    isSelectionMode: sel.isSelectionMode,
    anyModalOpen: () => false,
    focusSearch: () => {},
    scrollToPhoto: () => {},
    selectMaybeAll: () => {}
  })
  unbind = keyboard.bindWindow()
})

afterEach(() => {
  unbind?.()
  unbind = null
  usePreview().close()
})

function pressSpace(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
}

describe('空格 QuickLook 锚点', () => {
  it('对照：什么都没选时仍回落到池首（证明监听器在本环境生效）', () => {
    pressSpace()
    expect(usePreview().previewPhoto.value?.id).toBe('a')
  })

  it('唯一选中项优先于池首——点第 3 行按空格就该预览第 3 行', () => {
    const sel = usePhotoSelection()
    sel.handleSelectPhoto('c', true)
    pressSpace()
    expect(usePreview().previewPhoto.value?.id).toBe('c')
  })

  it('键盘高亮项次之（无选中时跟随 ↑↓←→ 的落点）', () => {
    usePhotoKeyboard().navActiveId.value = 'd'
    pressSpace()
    expect(usePreview().previewPhoto.value?.id).toBe('d')
  })

  it('多选时不猜某一条，回落到池首而不是随机一项', () => {
    const sel = usePhotoSelection()
    sel.handleSelectPhoto('b', true)
    sel.handleSelectPhoto('c', true)
    pressSpace()
    expect(usePreview().previewPhoto.value?.id).toBe('a')
  })
})
