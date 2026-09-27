// @vitest-environment happy-dom
/**
 * 文件夹拍平取数（特性：子文件夹卡片 + D-012「显示子文件夹内容」回归修复）
 *
 * 覆盖取数形状的全链：usePhotoFilters 的 scope 注入 watch（根 ∪ 后代 id 集）→
 * usePhotoData 两条取数路径的 IPC 载荷：
 * - 分页态（默认门控开）：开关开 = view:'all' + filters.folderIds IN 下推（可分页，大库安全）；
 *   开关关 = view:'folder' 的 folder_id = ?（直属语义保留）；
 * - 非分页回滚（leaf:use-paged-folder='0'）：开关开 = queryPhotosByRules 的 folderIds 下推，
 *   不再走 getFolderPhotos 逐夹取、也不再依赖主视图 allPhotos 分页累积池。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePhotoData } from '../usePhotoData'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoFilters } from '../usePhotoFilters'

const getPageMock = vi.fn()
const queryRulesMock = vi.fn()
const getFolderPhotosMock = vi.fn()

beforeAll(() => {
  setActivePinia(createPinia())
  ;(globalThis as Record<string, unknown>).window = globalThis.window ?? {}
  ;(window as unknown as Record<string, unknown>).api = {
    photos: {
      getPage: getPageMock,
      queryPhotosByRules: queryRulesMock,
      getFolderPhotos: getFolderPhotosMock
    }
  }
})

beforeEach(() => {
  localStorage.clear()
  useLibraryTabs().resetForTests()
  getPageMock.mockReset()
  queryRulesMock.mockReset()
  getFolderPhotosMock.mockReset()
  getPageMock.mockResolvedValue({ items: [], nextCursor: null })
  queryRulesMock.mockResolvedValue([])
  getFolderPhotosMock.mockResolvedValue([])
})

/** 文件夹树：root → { ka, kb }，ka → ka1（两代后代，验证递归收集） */
function seedFolders(): void {
  usePhotoData().folders.value = [
    { id: 'root', name: '根', parentId: null, photoCount: 0, createdAt: 0, updatedAt: 0 },
    { id: 'ka', name: 'A', parentId: 'root', photoCount: 0, createdAt: 0, updatedAt: 0 },
    { id: 'kb', name: 'B', parentId: 'root', photoCount: 0, createdAt: 0, updatedAt: 0 },
    { id: 'ka1', name: 'A1', parentId: 'ka', photoCount: 0, createdAt: 0, updatedAt: 0 }
  ]
}

/** 切到文件夹视图并开「显示子文件夹内容」，等 scope 注入 watch 跑完 */
async function openFlattened(rootId = 'root'): Promise<void> {
  const filters = usePhotoFilters()
  filters.tab.value.view = `folder:${rootId}`
  filters.tab.value.display.includeSubfolders = true
  await nextTick()
}

describe('usePhotoData · 文件夹拍平取数形状', () => {
  it('开关开 + 分页态：getPage 走 view:"all" + filters.folderIds（根 ∪ 全部后代）', async () => {
    seedFolders()
    await openFlattened()
    await usePhotoData().refreshFolderPhotos('root')
    expect(getPageMock).toHaveBeenCalledTimes(1)
    const req = getPageMock.mock.calls[0][0] as {
      view: string
      folderId?: string
      filters?: { folderIds?: string[] }
    }
    expect(req.view).toBe('all')
    expect(req.folderId).toBeUndefined()
    expect(req.filters?.folderIds).toBeDefined()
    // 根 ∪ 后代：两代后代都在集内，形状为 id 数组（主进程拼 IN，不收 SQL 片段）
    expect([...(req.filters?.folderIds ?? [])].sort()).toEqual(['ka', 'ka1', 'kb', 'root'])
  })

  it('开关关 + 分页态：保持直属语义（view:"folder" + folderId）', async () => {
    seedFolders()
    const filters = usePhotoFilters()
    filters.tab.value.view = 'folder:root'
    filters.tab.value.display.includeSubfolders = false
    await nextTick()
    await usePhotoData().refreshFolderPhotos('root')
    expect(getPageMock).toHaveBeenCalledTimes(1)
    const req = getPageMock.mock.calls[0][0] as { view: string; folderId?: string }
    expect(req.view).toBe('folder')
    expect(req.folderId).toBe('root')
  })

  it('维度 spec 与拍平 scope 同批下推（文件夹筛选同占 folderIds 字段时取交集）', async () => {
    seedFolders()
    await openFlattened()
    // 模拟维度筛选激活（usePhotoFilters 的 spec watch 会做同样的注入）
    usePhotoData().setPagedFilters({ kinds: ['image'], folderIds: ['ka'] })
    await usePhotoData().refreshFolderPhotos('root')
    const req = getPageMock.mock.calls[0][0] as { filters?: { folderIds?: string[] } }
    expect(req.filters?.folderIds).toEqual(['ka']) // scope ∩ 用户文件夹筛选
    expect(
      (getPageMock.mock.calls[0][0] as { filters?: { kinds?: string[] } }).filters?.kinds
    ).toEqual(['image'])
    usePhotoData().setPagedFilters(undefined)
  })

  it('非分页回滚 + 开关开：queryPhotosByRules 的 folderIds 下推，不走 getFolderPhotos', async () => {
    localStorage.setItem('leaf:use-paged-folder', '0')
    seedFolders()
    await openFlattened()
    await usePhotoData().refreshFolderPhotos('root')
    expect(queryRulesMock).toHaveBeenCalledTimes(1)
    expect(queryRulesMock.mock.calls[0][0]).toMatchObject({
      folderIds: expect.arrayContaining(['root', 'ka', 'kb', 'ka1'])
    })
    expect(getFolderPhotosMock).not.toHaveBeenCalled()
    expect(getPageMock).not.toHaveBeenCalled()
  })

  it('非分页回滚 + 开关关：直属取数不变（getFolderPhotos）', async () => {
    localStorage.setItem('leaf:use-paged-folder', '0')
    seedFolders()
    const filters = usePhotoFilters()
    filters.tab.value.view = 'folder:root'
    await nextTick()
    await usePhotoData().refreshFolderPhotos('root')
    expect(getFolderPhotosMock).toHaveBeenCalledWith('root')
    expect(queryRulesMock).not.toHaveBeenCalled()
  })

  it('开关原地翻转：在飞页请求落地后补一次重取（pendingReset 不丢翻转）', async () => {
    seedFolders()
    await openFlattened()
    const data = usePhotoData()
    // 第一次请求挂起不放行 → 期间翻转开关 → 旧响应落地后必须自动重取
    let release!: (v: { items: unknown[]; nextCursor: null }) => void
    getPageMock.mockImplementationOnce(() => new Promise((res) => (release = res)))
    const first = data.refreshFolderPhotos('root')
    const filters = usePhotoFilters()
    filters.tab.value.display.includeSubfolders = false
    await nextTick()
    release({ items: [], nextCursor: null })
    await first
    // 第二次调用是 pendingReset 触发的重取（直属形状）
    await vi.waitFor(() => expect(getPageMock).toHaveBeenCalledTimes(2))
    const second = getPageMock.mock.calls[1][0] as { view: string; folderId?: string }
    expect(second.view).toBe('folder')
    expect(second.folderId).toBe('root')
  })
})
