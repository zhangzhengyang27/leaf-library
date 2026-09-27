// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoData } from '../usePhotoData'
import { usePhotoFilters, installSearchPools, descendantFolderIds } from '../usePhotoFilters'
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

  it('随机模式视图下关键词搜索接管（搜索覆盖随机池）', () => {
    const data = usePhotoData()
    const filters = usePhotoFilters()
    data.allPhotos.value = [
      makePhoto({ id: 'cat1', tags: ['猫'] }),
      makePhoto({ id: 'dog', tags: ['狗'] })
    ]
    filters.tab.value.view = 'random'
    // 无关键词：随机视图照旧显示整个池
    expect(filters.flatDisplayPhotos.value).toHaveLength(2)
    filters.tab.value.searchKeyword = '猫'
    expect(filters.isSearchMode.value).toBe(true)
    // 搜索接管：显示搜索结果，而不是随机池原样（回归：随机分支曾抢在搜索前且不含关键词）
    expect(filters.flatDisplayPhotos.value.map((p) => p.id)).toEqual(['cat1'])
    filters.tab.value.searchKeyword = ''
    expect(filters.flatDisplayPhotos.value).toHaveLength(2)
  })

  it('回收站视图支持关键词过滤', () => {
    const data = usePhotoData()
    const filters = usePhotoFilters()
    filters.tab.value.view = 'trash'
    data.recycleBinPhotos.value = [
      makePhoto({ id: 'cat-del', tags: ['猫'] }),
      makePhoto({ id: 'dog-del', tags: ['狗'] })
    ]
    expect(filters.flatDisplayPhotos.value).toHaveLength(2)
    filters.tab.value.searchKeyword = '猫'
    expect(filters.isTrashView.value).toBe(true)
    expect(filters.flatDisplayPhotos.value.map((p) => p.id)).toEqual(['cat-del'])
    filters.tab.value.searchKeyword = ''
    expect(filters.flatDisplayPhotos.value).toHaveLength(2)
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

  it('标注维映射：两档原样进 spec，空档（不限）不下发（M4）', () => {
    const filters = usePhotoFilters()
    filters.tab.value.view = 'all'
    expect(buildFiltersSpec().annotationFilter).toBeUndefined()

    filters.tab.value.annotationFilter = 'any'
    expect(buildFiltersSpec().annotationFilter).toBe('any')
    filters.tab.value.annotationFilter = 'none'
    expect(buildFiltersSpec().annotationFilter).toBe('none')
    filters.tab.value.annotationFilter = ''
    expect(buildFiltersSpec().annotationFilter).toBeUndefined()
  })
})

describe('descendantFolderIds · 根 ∪ 后代 id 集（「显示子文件夹内容」拍平 scope）', () => {
  const folders = [
    { id: 'root', parentId: null },
    { id: 'a', parentId: 'root' },
    { id: 'b', parentId: 'root' },
    { id: 'a1', parentId: 'a' },
    { id: 'a1x', parentId: 'a1' },
    { id: 'other', parentId: null }
  ]

  it('多级子树：包含根与全部后代，不含兄弟/外部文件夹', () => {
    const ids = descendantFolderIds(folders, 'root')
    expect(ids.has('root')).toBe(true)
    expect(ids.has('a')).toBe(true)
    expect(ids.has('b')).toBe(true)
    expect(ids.has('a1')).toBe(true)
    expect(ids.has('a1x')).toBe(true)
    expect(ids.has('other')).toBe(false)
    expect(ids.size).toBe(5)
  })

  it('中间节点：只含该节点及其以下（子树口径）', () => {
    const ids = descendantFolderIds(folders, 'a')
    expect([...ids].sort()).toEqual(['a', 'a1', 'a1x'])
  })

  it('叶子节点：只有自身', () => {
    expect([...descendantFolderIds(folders, 'a1x')]).toEqual(['a1x'])
  })

  it('脏数据（父级环链）：每个节点只挂一次，不死循环', () => {
    const cyclic = [
      { id: 'x', parentId: 'y' },
      { id: 'y', parentId: 'x' }
    ]
    // 从任一端进入都能终止且两节点齐全
    expect(descendantFolderIds(cyclic, 'x').size).toBe(2)
    expect(descendantFolderIds(cyclic, 'y').size).toBe(2)
  })
})

describe('usePhotoFilters · 文件夹视图「显示子文件夹内容」（回归）', () => {
  it('开关开启（分页态）：拍平池只认 folderPhotos，不再依赖 allPhotos 分页累积池', () => {
    const data = usePhotoData()
    const filters = usePhotoFilters()
    data.folderPhotos.value = [makePhoto({ id: 'in-root' }), makePhoto({ id: 'in-child' })]
    // 主视图分页池里只有池外素材——旧实现从这里 filter 后代集，结果必然缺员/过期
    data.allPhotos.value = [makePhoto({ id: 'main-pool-only' })]
    filters.tab.value.view = 'folder:root'
    filters.tab.value.display.includeSubfolders = true
    expect(filters.flatDisplayPhotos.value.map((p) => p.id)).toEqual(['in-root', 'in-child'])
  })

  it('开关关闭（分页态）：直属语义不变', () => {
    const data = usePhotoData()
    const filters = usePhotoFilters()
    data.folderPhotos.value = [makePhoto({ id: 'in-root' })]
    filters.tab.value.view = 'folder:root'
    filters.tab.value.display.includeSubfolders = false
    expect(filters.flatDisplayPhotos.value.map((p) => p.id)).toEqual(['in-root'])
  })
})
