// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoData } from '../usePhotoData'
import { usePhotoFilters, installSearchPools } from '../usePhotoFilters'
import { buildFiltersSpec } from '../usePhotoFilterSpec'
import type { Photo } from '@renderer/types/photo'

/**
 * D-008 视图模型测试：快筛叠加 / 关键词 / 排序 / 分组 / 翻页池。
 * 数据层直接写 usePhotoData 的 ref（不经过 IPC）。
 *
 * 注意：usePhotoFilters 是模块单例（构建时绑定 pinia 实例），
 * 因此整个文件共享一个 pinia，用 resetForTests() 做用例间隔离。
 */

function makePhoto(overrides: Partial<Photo> & { id: string }): Photo {
  return {
    filePath: `/tmp/${overrides.id}.png`,
    fileName: `${overrides.id}.png`,
    fileSize: 1000,
    createdAt: 0,
    importedAt: Date.now(),
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
})

describe('usePhotoFilters · 图库视图与快筛', () => {
  it('全部图片：按日期分组 + 类型筛选', () => {
    const data = usePhotoData()
    const filters = usePhotoFilters()
    data.allPhotos.value = [
      makePhoto({ id: 'a', kind: 'image' }),
      makePhoto({ id: 'b', kind: 'video' }),
      makePhoto({ id: 'c', kind: 'image' })
    ]
    expect(filters.displaySections.value[0]?.photos).toHaveLength(3)

    filters.tab.value.kindFilter = 'video'
    expect(filters.displaySections.value[0]?.photos.map((p) => p.id)).toEqual(['b'])
    filters.tab.value.kindFilter = null

    // 分辨率快筛
    data.allPhotos.value.push(makePhoto({ id: 'big', width: 3840, height: 2160 }))
    filters.tab.value.resolutionFilter = '2k'
    expect(filters.flatDisplayPhotos.value.map((p) => p.id)).toEqual(['big'])
    filters.tab.value.resolutionFilter = ''

    // 时间快筛（今天导入的都在池内 → 全保留；today 从 0 点起算）
    filters.tab.value.timeFilter = 'today'
    expect(filters.flatDisplayPhotos.value.length).toBe(4)
    filters.tab.value.timeFilter = ''
  })

  it('关键词搜索叠加快筛与组内排序', () => {
    const data = usePhotoData()
    const filters = usePhotoFilters()
    data.allPhotos.value = [
      makePhoto({ id: 'cat1', tags: ['猫'] }),
      makePhoto({ id: 'cat2', tags: ['猫'], rating: 3 }),
      makePhoto({ id: 'dog', tags: ['狗'] })
    ]
    filters.tab.value.searchKeyword = '猫'
    expect(filters.isSearchMode.value).toBe(true)
    expect(filters.totalCount.value).toBe(2)

    filters.tab.value.sortBy = 'rating'
    expect(filters.displaySections.value[0]?.photos[0]?.id).toBe('cat2')
    filters.tab.value.searchKeyword = ''
    expect(filters.isSearchMode.value).toBe(false)
  })

  it('收藏视图过滤 isFavorite；回收站视图展示回收站数据', () => {
    const data = usePhotoData()
    const filters = usePhotoFilters()
    // 分页化阶段 2：收藏视图默认走独立收藏池（use-paged-favorites 门控）
    data.favoritesPhotos.value = [makePhoto({ id: 'fav', isFavorite: true })]
    filters.tab.value.view = 'favorites'
    expect(filters.flatDisplayPhotos.value.map((p) => p.id)).toEqual(['fav'])

    // 回滚门控：关掉分页后回退主池就地过滤（localStorage 非响应式，
    // 视图往返一次强制 displaySections 重算——真实场景靠重载生效）
    localStorage.setItem('leaf:use-paged-favorites', '0')
    data.allPhotos.value = [makePhoto({ id: 'fav2', isFavorite: true })]
    filters.tab.value.view = 'all'
    filters.tab.value.view = 'favorites'
    expect(filters.flatDisplayPhotos.value.map((p) => p.id)).toEqual(['fav2'])
    localStorage.removeItem('leaf:use-paged-favorites')

    filters.tab.value.view = 'trash'
    data.recycleBinPhotos.value = [makePhoto({ id: 'dead' })]
    expect(filters.isTrashView.value).toBe(true)
    expect(filters.flatDisplayPhotos.value.map((p) => p.id)).toEqual(['dead'])
    expect(filters.showFilters.value).toBe(false)
  })

  it('相册视图使用相册内容池', () => {
    const data = usePhotoData()
    const filters = usePhotoFilters()
    data.allPhotos.value = [makePhoto({ id: 'x' })]
    data.albums.value = [
      {
        id: 'a1',
        name: '旅行',
        coverPhotoId: null,
        sortOrder: 0,
        photoCount: 1,
        createdAt: 0,
        updatedAt: 0
      }
    ]
    data.albumPhotos.value = [makePhoto({ id: 'in-album' })]
    filters.tab.value.view = 'album:a1'
    expect(filters.activeAlbum.value?.name).toBe('旅行')
    expect(filters.flatDisplayPhotos.value.map((p) => p.id)).toEqual(['in-album'])
  })

  it('格式筛选项随视图池收敛', () => {
    const data = usePhotoData()
    const filters = usePhotoFilters()
    data.allPhotos.value = [
      makePhoto({ id: 'a', fileName: 'a.png' }),
      makePhoto({ id: 'b', fileName: 'b.jpg' })
    ]
    expect(filters.availableFormats.value).toEqual(['jpg', 'png'])
  })

  it('「未标签」视图把谓词下推给分页路径，而不是只在 500 行窗口里本地筛', () => {
    const filters = usePhotoFilters()
    filters.tab.value.view = 'all'
    expect(buildFiltersSpec().untaggedOnly).toBeUndefined()
    filters.tab.value.view = 'untagged'
    expect(buildFiltersSpec().untaggedOnly).toBe(true)
  })
})
