/**
 * Leaf 素材库 · 图库数据层（D-008 重构）
 *
 * 模块级单例：photo 视图、LibraryPanel、右键菜单等共享同一份数据。
 * 原 index.vue 的加载/刷新逻辑整体迁入；视图特定的池子（相册/文件夹/
 * 智能夹内容）随 activeView 切换按需刷新。
 */
import { computed, ref, watch } from 'vue'
import type {
  Album,
  Photo,
  PhotoFolder,
  PhotoSection,
  ProcessingProgress,
  SmartAlbum,
  TagSummary
} from '@renderer/types/photo'
import { useToast } from '@composables/useToast'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'

const toast = useToast()

const loading = ref(false)
const sections = ref<PhotoSection[]>([])
const allPhotos = ref<Photo[]>([])
const smartAlbums = ref<SmartAlbum[]>([])
const albums = ref<Album[]>([])
const folders = ref<PhotoFolder[]>([])
const dictionaryTags = ref<TagSummary[]>([])
const recycleBinPhotos = ref<Photo[]>([])
const recycleCount = ref(0)
const processing = ref<ProcessingProgress | null>(null)

/**
 * 代码审查 P0-11：Photo id → Photo 的 O(1) 索引。
 * 旧实现多处 `ids.map(id => allPhotos.find(...))` 是 O(N×M)，5 万库下
 * 右键菜单/批量重命名/检查器每操作一次都是数亿次比较。此 Map 非响应式，
 * 仅在 loadPhotos / replacePhotoLocal 时同步维护，不参与 Vue 响应系统。
 */
const photoIndex = new Map<string, Photo>()
/** 索引代次：Map 原地增删不换引用，读侧靠这个计数建立依赖 */
const photoRev = ref(0)

/** O(1) 批量按 id 查素材（顺序稳定，缺失项跳过） */
/** 取「当下活着」的那份素材对象：读 photoRev 建依赖，就地替换后能重渲染 */
function livePhoto(id: string): Photo | undefined {
  void photoRev.value
  return photoIndex.get(id)
}

function byIds(ids: string[]): Photo[] {
  const out: Photo[] = []
  for (const id of ids) {
    const p = photoIndex.get(id)
    if (p) out.push(p)
  }
  return out
}

/** 视图特定内容池 */
const albumPhotos = ref<Photo[]>([])
import type { SmartAlbumRules } from '@shared/smartAlbumRules'

const folderPhotos = ref<Photo[]>([])
/** 分页化阶段 2：收藏视图窗口池（use-paged-favorites 门控） */
const favoritesPhotos = ref<Photo[]>([])
const smartAlbumPhotos = ref<Photo[]>([])
/** §3 L4 / §2.B 固定入口池：未分类 / 最近添加 / 最近查看 */
const unsortedPhotos = ref<Photo[]>([])
const recentPhotos = ref<Photo[]>([])
/** 未加标签（本地派生：无任何标签的非删除素材） */
const untaggedPhotos = computed<Photo[]>(() => allPhotos.value.filter((p) => p.tags.length === 0))
/**
 * 最近查看：直接由全量库 allPhotos 派生（按 lastViewedAt 降序），
 * 避免每次预览都走整池 IPC 重拉。setLastViewed 时仅 bump lastViewedTick 触发重算。
 */
const lastViewedTick = ref(0)
const RECENTS_LIMIT = 200
const recentViewedPhotos = computed<Photo[]>(() => {
  void lastViewedTick.value // 依赖：lastViewedAt 变化时触发重算
  return allPhotos.value
    .filter((p) => (p.lastViewedAt ?? 0) > 0)
    .sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0))
    .slice(0, RECENTS_LIMIT)
})

// ── 分页化阶段 2：主视图窗口取数（docs/PAGINATION_DESIGN.md）──
// 门控混合：仅当「无任何维度筛选 + 非搜索/地图/查重/相似/随机视图」时走
// keyset 分页（imported_at DESC，与旧 getAll 流序一致 → 分组/组内排序语义不变）。
// 门控由 usePhotoFilters 注册（反向依赖，避免循环 import）；任一筛选激活时
// watch 触发 loadPhotos() 切回全量路径——两种池的输出与现状逐字节一致。
// FilterBar 快筛的 SQL 下推在「带筛选分页」真正需要时再做（阶段 2b，可选）。
const sidebarCounts = ref({ all: 0, untagged: 0, recentViewed: 0 })
const loadSidebarCounts = async (): Promise<void> => {
  try {
    sidebarCounts.value = await window.api.photos.getSidebarCounts()
  } catch (error) {
    console.error('加载侧栏计数失败:', error)
  }
}

const MAIN_PAGE_SIZE = 500
const mainCursor = ref<string | null>(null)
const mainHasMore = ref(false)
let mainPageInFlight = false
let mainPendingReset = false
let mainPageGate: (() => boolean) | null = null
/** 阶段 3：维度筛选 spec（usePhotoFilters 注入，下推 WHERE） */
let pagedFilters: SmartAlbumRules | undefined = undefined
/** 主视图当前是否走分页窗口路径（displaySections 据此跳过窗口内 matchAll） */
const mainPagedActive = ref(false)
function setPagedFilters(spec: SmartAlbumRules | undefined): void {
  pagedFilters = spec
}

function registerMainPageGate(fn: () => boolean): void {
  mainPageGate = fn
}

/** 与主进程 getPhotosByDateSection 相同的分组语义：按流序首次出现排列，组内保持流序 */
function groupSectionsInOrder(items: Photo[]): PhotoSection[] {
  const map = new Map<string, Photo[]>()
  const out: PhotoSection[] = []
  for (const p of items) {
    const list = map.get(p.dateSection)
    if (list) list.push(p)
    else map.set(p.dateSection, [p])
  }
  for (const [dateSection, photos] of map) out.push({ dateSection, photos })
  return out
}

const loadMainPage = async (reset: boolean): Promise<void> => {
  if (mainPageInFlight) {
    // 在飞期间又来了 reset（切筛选/导入完成）：记下待重置，本轮响应落地后重取。
    // 直接 return 会把新筛选条件下的第一页丢掉。
    if (reset) mainPendingReset = true
    return
  }
  if (!reset && !mainHasMore.value) return
  mainPageInFlight = true
  try {
    let doReset = reset
    for (;;) {
      mainPendingReset = false
      const page = await window.api.photos.getPage({
        view: 'all',
        filters: pagedFilters,
        sort: 'imported_at',
        desc: true,
        cursor: doReset ? undefined : (mainCursor.value ?? undefined),
        limit: MAIN_PAGE_SIZE
      })
      if (mainPendingReset) {
        doReset = true
        continue
      }
      allPhotos.value = doReset ? page.items : [...allPhotos.value, ...page.items]
      photoIndex.clear()
      for (const p of allPhotos.value) photoIndex.set(p.id, p)
      photoRev.value++
      sections.value = groupSectionsInOrder(allPhotos.value)
      mainCursor.value = page.nextCursor
      mainHasMore.value = page.nextCursor !== null
      mainPagedActive.value = true
      // M3：本页落地即刷新该页标注数（≤500 条恰为一内片）
      void refreshAnnotationCounts(page.items.map((p) => p.id))
      break
    }
  } catch (error) {
    console.error('加载图片失败:', error)
    toast.error('加载图片失败', { description: (error as Error).message })
  } finally {
    mainPageInFlight = false
  }
}
const loadMoreMain = (): void => {
  void loadMainPage(false)
}

const loadPhotos = async (): Promise<void> => {
  try {
    loading.value = true
    // 分页化阶段 2：门控放行 → 主视图窗口取数（流序/分组/组内排序与全量路径一致，
    // 见上方门控注释）；筛选激活时门控为假，走原有全量路径
    if (mainPageGate?.()) {
      await loadMainPage(true)
      // 顺带刷新侧栏固定项计数池（未分类/最近添加），避免导入/删除后计数陈旧
      void loadUnsorted()
      void loadRecent()
      void loadSidebarCounts()
      return
    }
    mainHasMore.value = false
    mainPagedActive.value = false
    const data = await window.api.photos.getByDateSection()
    sections.value = data
    allPhotos.value = []
    photoIndex.clear()
    for (const section of data) {
      for (const p of section.photos) photoIndex.set(p.id, p)
      allPhotos.value.push(...section.photos)
    }
    // 顺带刷新侧栏固定项计数池（未分类/最近添加），避免导入/删除后计数陈旧
    void loadUnsorted()
    void loadRecent()
    // M3：全量路径整库落地后刷标注数（内部有 2000 上限与分片，不放大成本）
    void refreshAnnotationCounts(allPhotos.value.map((p) => p.id))
  } catch (error) {
    console.error('加载图片失败:', error)
    toast.error('加载图片失败', { description: (error as Error).message })
  } finally {
    loading.value = false
  }
}

const loadAlbums = async (): Promise<void> => {
  try {
    albums.value = await window.api.photos.listAlbums()
  } catch (error) {
    console.error('加载相册失败:', error)
  }
}

const loadFolders = async (): Promise<void> => {
  try {
    folders.value = await window.api.photos.listPhotoFolders()
  } catch (error) {
    console.error('加载文件夹失败:', error)
  }
}

const loadSmartAlbums = async (): Promise<void> => {
  try {
    smartAlbums.value = await window.api.photos.listSmartAlbums()
    await loadDictionaryTags()
  } catch (error) {
    console.error('加载智能文件夹失败:', error)
  }
}

const loadDictionaryTags = async (): Promise<void> => {
  try {
    dictionaryTags.value = (await window.api.tag.getTags()) as TagSummary[]
  } catch {
    dictionaryTags.value = []
  }
}

// ── 分页化阶段 1：回收站窗口取数（docs/PAGINATION_DESIGN.md 阶段 1）──
// 回滚开关：localStorage 置 'leaf:use-paged-trash' = '0' 即恢复全量路径。
// recycleBinPhotos 语义不变（仍是「已加载的回收站素材」），展示管线零改动；
// 差别只在它是「前 N 页累积」而非整表。
const PAGED_TRASH_KEY = 'leaf:use-paged-trash'
const TRASH_PAGE_SIZE = 200
const trashCursor = ref<string | null>(null)
const trashHasMore = ref(false)
let trashPageInFlight = false

function usePagedTrash(): boolean {
  try {
    return localStorage.getItem(PAGED_TRASH_KEY) !== '0'
  } catch {
    return true
  }
}

const loadTrashPage = async (reset: boolean): Promise<void> => {
  if (trashPageInFlight) return
  if (!reset && !trashHasMore.value) return
  trashPageInFlight = true
  try {
    const page = await window.api.photos.getPage({
      view: 'trash',
      sort: 'deleted_at',
      desc: true,
      cursor: reset ? undefined : (trashCursor.value ?? undefined),
      limit: TRASH_PAGE_SIZE
    })
    recycleBinPhotos.value = reset ? page.items : [...recycleBinPhotos.value, ...page.items]
    recycleCount.value = page.total
    trashCursor.value = page.nextCursor
    trashHasMore.value = page.nextCursor !== null
    // M3：回收站窗口落地即刷新标注数
    void refreshAnnotationCounts(page.items.map((p) => p.id))
  } catch (error) {
    console.error('加载回收站失败:', error)
  } finally {
    trashPageInFlight = false
  }
}

const loadMoreTrash = (): void => {
  void loadTrashPage(false)
}

// ── 分页化阶段 2：收藏 / 文件夹视图窗口取数（与回收站试点同模式）──
// 回滚开关：localStorage 置 'leaf:use-paged-favorites' / 'leaf:use-paged-folder'
// = '0' 即恢复全量路径。folderPhotos/favoritesPhotos 语义不变（已加载窗口）。
const PAGED_FAVORITES_KEY = 'leaf:use-paged-favorites'
const PAGED_FOLDER_KEY = 'leaf:use-paged-folder'
const FAVORITES_PAGE_SIZE = 200
const FOLDER_PAGE_SIZE = 200
const favoritesCursor = ref<string | null>(null)
const favoritesHasMore = ref(false)
let favoritesPageInFlight = false
const folderCursor = ref<string | null>(null)
const folderHasMore = ref(false)
let folderPageInFlight = false
/** 当前分页文件夹（refreshFolderPhotos 记录；loadMore 复用） */
let pagedFolderId: string | null = null

function usePagedFavorites(): boolean {
  try {
    return localStorage.getItem(PAGED_FAVORITES_KEY) !== '0'
  } catch {
    return true
  }
}

function usePagedFolder(): boolean {
  try {
    return localStorage.getItem(PAGED_FOLDER_KEY) !== '0'
  } catch {
    return true
  }
}

const loadFavoritesPage = async (reset: boolean): Promise<void> => {
  if (favoritesPageInFlight) return
  if (!reset && !favoritesHasMore.value) return
  favoritesPageInFlight = true
  try {
    const page = await window.api.photos.getPage({
      view: 'favorites',
      sort: 'imported_at',
      desc: true,
      cursor: reset ? undefined : (favoritesCursor.value ?? undefined),
      limit: FAVORITES_PAGE_SIZE
    })
    favoritesPhotos.value = reset ? page.items : [...favoritesPhotos.value, ...page.items]
    favoritesCursor.value = page.nextCursor
    favoritesHasMore.value = page.nextCursor !== null
    // M3：收藏窗口落地即刷新标注数
    void refreshAnnotationCounts(page.items.map((p) => p.id))
  } catch (error) {
    console.error('加载收藏失败:', error)
  } finally {
    favoritesPageInFlight = false
  }
}

const loadMoreFavorites = (): void => {
  void loadFavoritesPage(false)
}

const loadFolderPage = async (reset: boolean): Promise<void> => {
  if (folderPageInFlight) return
  if (!pagedFolderId) return
  if (!reset && !folderHasMore.value) return
  folderPageInFlight = true
  try {
    const page = await window.api.photos.getPage({
      view: 'folder',
      folderId: pagedFolderId,
      sort: 'imported_at',
      desc: true,
      cursor: reset ? undefined : (folderCursor.value ?? undefined),
      limit: FOLDER_PAGE_SIZE
    })
    folderPhotos.value = reset ? page.items : [...folderPhotos.value, ...page.items]
    folderCursor.value = page.nextCursor
    folderHasMore.value = page.nextCursor !== null
    // M3：文件夹窗口落地即刷新标注数
    void refreshAnnotationCounts(page.items.map((p) => p.id))
  } catch (error) {
    console.error('加载文件夹失败:', error)
  } finally {
    folderPageInFlight = false
  }
}

const loadMoreFolder = (): void => {
  void loadFolderPage(false)
}

// ── 分页化阶段 3：全局搜索池（FTS/scope 下推；关键词搜索的全局语义）──
// 回滚开关：localStorage 置 'leaf:use-paged-search' = '0' 即回退客户端窗口过滤。
const PAGED_SEARCH_KEY = 'leaf:use-paged-search'
const SEARCH_PAGE_SIZE = 200
const searchPoolPhotos = ref<Photo[]>([])
const searchCursor = ref<string | null>(null)
const searchHasMore = ref(false)
let searchPageInFlight = false
/** 当前池对应的搜索词（displaySections 校验池与关键词一致才走服务端池） */
const searchPoolQuery = ref('')

function usePagedSearch(): boolean {
  try {
    return localStorage.getItem(PAGED_SEARCH_KEY) !== '0'
  } catch {
    return true
  }
}

/** 全局搜索分页：filters 为维度 spec（不含 keyword），query 单独传递 */
const loadSearchPage = async (
  reset: boolean,
  query: string,
  filters?: SmartAlbumRules,
  scopes?: string[]
): Promise<void> => {
  if (searchPageInFlight) return
  if (!reset && !searchHasMore.value) return
  searchPageInFlight = true
  try {
    const page = await window.api.photos.getPage({
      view: 'search',
      query,
      filters: filters as never,
      sort: 'imported',
      desc: true,
      cursor: reset ? undefined : (searchCursor.value ?? undefined),
      limit: SEARCH_PAGE_SIZE
    })
    searchPoolPhotos.value = reset ? page.items : [...searchPoolPhotos.value, ...page.items]
    searchCursor.value = page.nextCursor
    searchHasMore.value = page.nextCursor !== null
    searchPoolQuery.value = query
    // M3：搜索窗口落地即刷新标注数
    void refreshAnnotationCounts(page.items.map((p) => p.id))
  } catch (error) {
    console.error('搜索失败:', error)
  } finally {
    searchPageInFlight = false
  }
}

const loadMoreSearch = (): void => {
  void loadSearchPage(false, searchPoolQuery.value)
}

const loadRecycleBin = async (): Promise<void> => {
  try {
    if (usePagedTrash()) {
      await loadTrashPage(true)
      return
    }
    recycleBinPhotos.value = await window.api.photos.getRecycleBin()
    recycleCount.value = recycleBinPhotos.value.length
  } catch (error) {
    console.error('加载回收站失败:', error)
  }
}

const refreshAlbumPhotos = async (albumId: string | null): Promise<void> => {
  if (!albumId) return
  try {
    albumPhotos.value = await window.api.photos.getAlbumPhotos(albumId)
    // M3：相册池落地即刷新标注数
    void refreshAnnotationCounts(albumPhotos.value.map((p) => p.id))
  } catch (error) {
    console.error('加载相册内容失败:', error)
  }
}

const refreshFolderPhotos = async (folderId: string | null): Promise<void> => {
  if (!folderId) return
  pagedFolderId = folderId
  if (usePagedFolder()) {
    await loadFolderPage(true)
    return
  }
  try {
    folderPhotos.value = await window.api.photos.getFolderPhotos(folderId)
    // M3：文件夹池（非分页回滚路径）落地即刷新标注数
    void refreshAnnotationCounts(folderPhotos.value.map((p) => p.id))
  } catch (error) {
    console.error('加载文件夹内容失败:', error)
  }
}

const refreshSmartAlbumPhotos = async (smartId: string | null): Promise<void> => {
  if (!smartId) return
  try {
    smartAlbumPhotos.value = await window.api.photos.getSmartAlbumPhotos(smartId)
    // M3：智能夹池落地即刷新标注数
    void refreshAnnotationCounts(smartAlbumPhotos.value.map((p) => p.id))
  } catch (error) {
    console.error('加载智能文件夹失败:', error)
  }
}

const loadUnsorted = async (): Promise<void> => {
  try {
    unsortedPhotos.value = await window.api.photos.getUnsorted()
    // M3：未分类池落地即刷新标注数
    void refreshAnnotationCounts(unsortedPhotos.value.map((p) => p.id))
  } catch (error) {
    console.error('加载未分类失败:', error)
  }
}

const loadRecent = async (): Promise<void> => {
  try {
    recentPhotos.value = await window.api.photos.getRecent()
    // M3：最近添加池落地即刷新标注数
    void refreshAnnotationCounts(recentPhotos.value.map((p) => p.id))
  } catch (error) {
    console.error('加载最近添加失败:', error)
  }
}

/** 并发刷新全库相关池（导入/批量操作后避免多次串行整库拉取）。
 *  含标签字典：截图导入等场景会给素材打上新标签（如首张「截图」），
 *  不刷新字典的话过滤面板/标签管理看不到新标签。 */
const refreshAllPools = async (): Promise<void> => {
  await Promise.all([
    loadPhotos(),
    loadUnsorted(),
    loadRecent(),
    loadDictionaryTags(),
    // 分页池保活：对应视图激活过就刷新其窗口（导入/删除后内容不陈旧）
    ...(usePagedFavorites() ? [loadFavoritesPage(true)] : []),
    ...(pagedFolderId && usePagedFolder() ? [loadFolderPage(true)] : []),
    // 全局搜索池：有活动搜索词时重刷（导入/删除后结果不陈旧）
    ...(searchPoolQuery.value ? [loadSearchPage(true, searchPoolQuery.value)] : [])
  ])
}

/** §3 L4 / §2.B 打开素材/视图时记录查看时间，驱动「最近查看」 */
const setLastViewed = async (id: string): Promise<void> => {
  try {
    await window.api.photos.setLastViewed(id)
    // 同步本地缓存并触发「最近查看」派生重算（无需重新拉取整池）
    const p = allPhotos.value.find((x) => x.id === id)
    if (p) p.lastViewedAt = Date.now()
    lastViewedTick.value++
  } catch (error) {
    console.error('记录查看时间失败:', error)
  }
}

/** 单张就地替换（缩略图/EXIF 回填、收藏/评分/标签等增量更新） */
function replacePhotoLocal(updated: Photo): void {
  photoIndex.set(updated.id, updated)
  const replaceIn = (list: Photo[]): void => {
    const i = list.findIndex((p) => p.id === updated.id)
    if (i >= 0) list.splice(i, 1, updated)
  }
  replaceIn(allPhotos.value)
  replaceIn(albumPhotos.value)
  replaceIn(folderPhotos.value)
  replaceIn(smartAlbumPhotos.value)
  replaceIn(recycleBinPhotos.value)
  replaceIn(favoritesPhotos.value)
  replaceIn(searchPoolPhotos.value)
  replaceIn(unsortedPhotos.value)
  replaceIn(recentPhotos.value)
  for (const section of sections.value) replaceIn(section.photos)
  photoRev.value++
}

// ── M3 · 卡片标注数徽标（photoId → 条数）──
// 开关 display.showAnnotationCount（默认关，Eagle 同款默认）关闭时零 IPC；
// 打开瞬间由 watch 补拉最近一次加载池的 id。计数与列表本体解耦：
// 查询失败静默清空（徽标当作无数据），不弹错、绝不影响照片列表。
const annotationCounts = ref(new Map<string, number>())
/** 最近一次请求计数的 id 集合（非响应式，仅供开关打开瞬间补拉） */
let lastCountIds: string[] = []
/** 请求序号守卫：分页/切视图快速连续加载时只有最新一次调用可写结果，
 *  过期响应整体丢弃（与 useVideoSubtitles 的「序号丢过期」同思路） */
let annotationCountSeq = 0
/** repo 一次 IN 查询至多吃 500 个 id（超出部分静默截断）→ 渲染层自行分片调用；
 *  单次刷新再配 2000 总量上限，兜住「筛选激活走全量路径」时整库级别的 id 列表 */
const COUNT_CHUNK_SIZE = 500
const COUNT_FETCH_LIMIT = 2000

/** 开关读取（惰性取 store：模块加载时 Pinia 尚未激活，不能顶层 useLibraryTabs） */
function annotationBadgeEnabled(): boolean {
  try {
    return useLibraryTabs().active.display.showAnnotationCount
  } catch {
    return false
  }
}

let offAnnotationCountToggle: (() => void) | null = null
/** 开关打开瞬间补拉（幂等安装；模块级单例与 bindViewWatcher 同范式） */
function ensureAnnotationCountToggleWatch(): void {
  if (offAnnotationCountToggle) return
  offAnnotationCountToggle = watch(
    () => useLibraryTabs().active.display.showAnnotationCount,
    (on) => {
      if (on) void refreshAnnotationCounts(lastCountIds)
    }
  )
}

/**
 * 拉取给定 id 的标注数并**合并**进缓存（不清掉其它池已取到的条目）。
 * 各内容池加载落地后各调一次（loadMainPage/loadPhotos/各视图窗口…），
 * 「页面数据就绪 → 取当前页 id 刷计数」的时机由这些调用点单源维护。
 */
const refreshAnnotationCounts = async (ids: readonly string[]): Promise<void> => {
  ensureAnnotationCountToggleWatch()
  const seq = ++annotationCountSeq
  const target = Array.from(new Set(ids)).slice(0, COUNT_FETCH_LIMIT)
  lastCountIds = target
  if (!annotationBadgeEnabled()) return
  try {
    const merged = new Map(annotationCounts.value)
    for (let i = 0; i < target.length; i += COUNT_CHUNK_SIZE) {
      const rec = await window.api.annotations.count(target.slice(i, i + COUNT_CHUNK_SIZE))
      if (seq !== annotationCountSeq) return // 期间已发起更新的一次调用，过期响应丢弃
      for (const [id, n] of Object.entries(rec)) merged.set(id, n)
    }
    if (seq !== annotationCountSeq) return
    annotationCounts.value = merged
  } catch {
    // 静默失败：本次当无数据（清空徽标缓存），不影响列表
    if (seq === annotationCountSeq) annotationCounts.value = new Map()
  }
}

export function usePhotoData(): {
  loading: typeof loading
  sections: typeof sections
  allPhotos: typeof allPhotos
  smartAlbums: typeof smartAlbums
  albums: typeof albums
  folders: typeof folders
  dictionaryTags: typeof dictionaryTags
  recycleBinPhotos: typeof recycleBinPhotos
  recycleCount: typeof recycleCount
  processing: typeof processing
  albumPhotos: typeof albumPhotos
  folderPhotos: typeof folderPhotos
  smartAlbumPhotos: typeof smartAlbumPhotos
  unsortedPhotos: typeof unsortedPhotos
  recentPhotos: typeof recentPhotos
  recentViewedPhotos: typeof recentViewedPhotos
  sidebarCounts: typeof sidebarCounts
  annotationCounts: typeof annotationCounts
  refreshAnnotationCounts: typeof refreshAnnotationCounts
  loadPhotos: typeof loadPhotos
  loadAlbums: typeof loadAlbums
  loadFolders: typeof loadFolders
  loadSmartAlbums: typeof loadSmartAlbums
  loadDictionaryTags: typeof loadDictionaryTags
  loadRecycleBin: typeof loadRecycleBin
  loadMoreTrash: typeof loadMoreTrash
  trashHasMore: typeof trashHasMore
  favoritesPhotos: typeof favoritesPhotos
  favoritesHasMore: typeof favoritesHasMore
  loadMoreFavorites: typeof loadMoreFavorites
  loadFavoritesPage: typeof loadFavoritesPage
  usePagedFavorites: typeof usePagedFavorites
  folderHasMore: typeof folderHasMore
  loadMoreFolder: typeof loadMoreFolder
  loadFolderPage: typeof loadFolderPage
  usePagedFolder: typeof usePagedFolder
  searchPoolPhotos: typeof searchPoolPhotos
  searchHasMore: typeof searchHasMore
  searchPoolQuery: typeof searchPoolQuery
  loadSearchPage: typeof loadSearchPage
  loadMoreSearch: typeof loadMoreSearch
  usePagedSearch: typeof usePagedSearch
  loadMoreMain: typeof loadMoreMain
  mainHasMore: typeof mainHasMore
  registerMainPageGate: typeof registerMainPageGate
  setPagedFilters: typeof setPagedFilters
  mainPagedActive: typeof mainPagedActive
  refreshAlbumPhotos: typeof refreshAlbumPhotos
  refreshFolderPhotos: typeof refreshFolderPhotos
  refreshSmartAlbumPhotos: typeof refreshSmartAlbumPhotos
  loadUnsorted: typeof loadUnsorted
  loadRecent: typeof loadRecent
  refreshAllPools: typeof refreshAllPools
  setLastViewed: typeof setLastViewed
  replacePhotoLocal: typeof replacePhotoLocal
  byIds: typeof byIds
  livePhoto: typeof livePhoto
} {
  return {
    loading,
    sections,
    allPhotos,
    smartAlbums,
    albums,
    folders,
    dictionaryTags,
    recycleBinPhotos,
    recycleCount,
    processing,
    albumPhotos,
    folderPhotos,
    smartAlbumPhotos,
    unsortedPhotos,
    recentPhotos,
    recentViewedPhotos,
    sidebarCounts,
    annotationCounts,
    refreshAnnotationCounts,
    loadPhotos,
    loadAlbums,
    loadFolders,
    loadSmartAlbums,
    loadDictionaryTags,
    loadRecycleBin,
    loadMoreTrash,
    trashHasMore,
    favoritesPhotos,
    favoritesHasMore,
    loadMoreFavorites,
    loadFavoritesPage,
    usePagedFavorites,
    folderHasMore,
    loadMoreFolder,
    loadFolderPage,
    usePagedFolder,
    searchPoolPhotos,
    searchHasMore,
    searchPoolQuery,
    loadSearchPage,
    loadMoreSearch,
    usePagedSearch,
    loadMoreMain,
    mainHasMore,
    registerMainPageGate,
    setPagedFilters,
    mainPagedActive,
    refreshAlbumPhotos,
    refreshFolderPhotos,
    refreshSmartAlbumPhotos,
    loadUnsorted,
    loadRecent,
    refreshAllPools,
    setLastViewed,
    replacePhotoLocal,
    byIds,
    livePhoto,
  }
}
/**
 * 后台处理进度订阅（幂等：仅首次调用时挂监听，返回解绑函数）。
 * 模块单例下多次组件挂载不会重复注册。
 */
let offProcessing: (() => void) | null = null
let processingResetTimer: number | undefined

export function bindProcessingProgress(): () => void {
  if (offProcessing) return offProcessing
  offProcessing = window.api.photos.onProcessing((progress) => {
    processing.value = progress
    if (progress.status === 'done') {
      void window.api.photos.getById(progress.photoId).then((updated) => {
        if (updated) replacePhotoLocal(updated)
      })
    }
    if (progress.done >= progress.total) {
      window.clearTimeout(processingResetTimer)
      processingResetTimer = window.setTimeout(() => {
        processing.value = null
      }, 1500)
    }
  })
  return () => {
    offProcessing?.()
    offProcessing = null
  }
}

/** 视图切换 → 按需刷新内容池（幂等安装，返回解绑函数） */
let offViewWatcher: (() => void) | null = null
export function bindViewWatcher(): () => void {
  // 代码审查 P1：幂等守卫——旧实现注释写「幂等」但无 guard，
  // 多次组件挂载/HMR 会重复新建 watch，重复触发 IPC 刷新
  if (offViewWatcher) return offViewWatcher
  const tabs = useLibraryTabs()
  const stop = watch(
    () => tabs.activeView,
    (view) => {
      if (view === 'trash') {
        void loadRecycleBin()
      } else if (view === 'favorites') {
        if (usePagedFavorites()) void loadFavoritesPage(true)
      } else if (view.startsWith('smart:')) {
        void refreshSmartAlbumPhotos(view.slice(6))
      } else if (view.startsWith('album:')) {
        void refreshAlbumPhotos(view.slice(6))
      } else if (view.startsWith('folder:')) {
        void refreshFolderPhotos(view.slice(7))
      } else if (view === 'unsorted') {
        void loadUnsorted()
      } else if (view === 'recent') {
        void loadRecent()
      }
    },
    { immediate: true }
  )
  offViewWatcher = stop
  return stop
}

