// @vitest-environment happy-dom
/**
 * 预览持有的素材必须是「活对象」。
 *
 * 预览外框的评分/收藏/标签写库后，数据层走 replacePhotoLocal 整体替换对象；
 * 若 previewPhoto 存的是打开那一刻的引用，界面就永远停在旧值——
 * 库里已经是 5 星、图标却还是 0 星，用户读到的是「点了没反应」。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import type { Photo } from '@renderer/types/photo'
import { usePhotoData } from '../usePhotoData'
import { installSearchPools } from '../usePhotoFilters'
import { usePreview } from '../usePreview'

function makePhoto(overrides: Partial<Photo> & { id: string }): Photo {
  return {
    filePath: `/tmp/${overrides.id}.png`,
    fileName: `${overrides.id}.png`,
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
    kind: 'image',
    ...overrides
  }
}

beforeAll(() => {
  setActivePinia(createPinia())
})

beforeEach(() => {
  localStorage.clear()
  useLibraryTabs().resetForTests()
  installSearchPools().similarMatches.value = []
  usePreview().close()
})

describe('usePreview · 素材活绑定', () => {
  it('数据层替换对象后，预览立刻看到新的评分/收藏/标签', async () => {
    const data = usePhotoData()
    const preview = usePreview()
    const a = makePhoto({ id: 'a' })
    data.replacePhotoLocal(a)
    preview.openPhoto(a)
    expect(preview.previewPhoto.value?.rating).toBe(0)

    data.replacePhotoLocal({ ...a, rating: 5, isFavorite: true, tags: ['leaf'] })
    await nextTick()

    expect(preview.previewPhoto.value?.rating).toBe(5)
    expect(preview.previewPhoto.value?.isFavorite).toBe(true)
    expect(preview.previewPhoto.value?.tags).toEqual(['leaf'])
  })

  it('改名后 filePath 随活对象更新（预览图源与「设为壁纸」都吃这个值）', async () => {
    const data = usePhotoData()
    const preview = usePreview()
    const a = makePhoto({ id: 'a' })
    data.replacePhotoLocal(a)
    preview.openPhoto(a)

    data.replacePhotoLocal({ ...a, fileName: 'new.png', filePath: '/tmp/new.png' })
    await nextTick()

    expect(preview.previewPhoto.value?.filePath).toBe('/tmp/new.png')
  })

  it('素材不在数据层索引里时回落打开那一刻的快照，不闪成空白', () => {
    const preview = usePreview()
    const orphan = makePhoto({ id: 'gone', rating: 3 })
    preview.openPhoto(orphan)
    expect(preview.previewPhoto.value?.id).toBe('gone')
    expect(preview.previewPhoto.value?.rating).toBe(3)
  })

  it('close 之后不再持有任何素材', () => {
    const data = usePhotoData()
    const preview = usePreview()
    const a = makePhoto({ id: 'a' })
    data.replacePhotoLocal(a)
    preview.openPhoto(a)
    preview.close()
    expect(preview.previewPhoto.value).toBeNull()
  })
})
