/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import { ref, watch } from "vue";
import { useToast } from "/src/composables/useToast.ts";
import { useLibraryTabs } from "/src/stores/libraryTabs.ts?t=1789887624211";
const toast = useToast();
const loading = ref(false);
const sections = ref([]);
const allPhotos = ref([]);
const smartAlbums = ref([]);
const albums = ref([]);
const folders = ref([]);
const dictionaryTags = ref([]);
const recycleBinPhotos = ref([]);
const recycleCount = ref(0);
const processing = ref(null);
const photoIndex = /* @__PURE__ */ new Map();
const photoRev = ref(0);
function livePhoto(id) {
  void photoRev.value;
  return photoIndex.get(id);
}
function byIds(ids) {
  const out = [];
  let missing = false;
  for (const id of ids) {
    const p = photoIndex.get(id);
    if (p) out.push(p);
    else missing = true;
  }
  if (!missing) return out;
  const byId = /* @__PURE__ */ new Map();
  for (const p of [
    ...recycleBinPhotos.value,
    ...favoritesPhotos.value,
    ...folderPhotos.value,
    ...searchPoolPhotos.value,
    ...unsortedPhotos.value,
    ...recentPhotos.value,
    ...albumPhotos.value,
    ...smartAlbumPhotos.value
  ]) {
    if (!photoIndex.has(p.id)) byId.set(p.id, p);
  }
  const out2 = [];
  for (const id of ids) {
    const p = photoIndex.get(id) ?? byId.get(id);
    if (p) out2.push(p);
  }
  return out2;
}
const albumPhotos = ref([]);
const folderPhotos = ref([]);
const favoritesPhotos = ref([]);
const smartAlbumPhotos = ref([]);
const unsortedPhotos = ref([]);
const recentPhotos = ref([]);
const RECENTS_LIMIT = 200;
const recentViewedPhotos = ref([]);
const loadRecentViewed = async () => {
  try {
    recentViewedPhotos.value = await window.api.photos.getRecentViewed(RECENTS_LIMIT);
  } catch (error) {
    console.error("加载最近查看失败:", error);
  }
};
const sidebarCounts = ref({ all: 0, untagged: 0, recentViewed: 0 });
const loadSidebarCounts = async () => {
  try {
    sidebarCounts.value = await window.api.photos.getSidebarCounts();
  } catch (error) {
    console.error("加载侧栏计数失败:", error);
  }
};
const MAIN_PAGE_SIZE = 500;
const mainCursor = ref(null);
const mainHasMore = ref(false);
let mainPageInFlight = false;
let mainPendingReset = false;
let mainPageGate = null;
let pagedFilters = void 0;
const mainPagedActive = ref(false);
function setPagedFilters(spec) {
  pagedFilters = spec;
}
function registerMainPageGate(fn) {
  mainPageGate = fn;
}
function groupSectionsInOrder(items) {
  const map = /* @__PURE__ */ new Map();
  const out = [];
  for (const p of items) {
    const list = map.get(p.dateSection);
    if (list) list.push(p);
    else map.set(p.dateSection, [p]);
  }
  for (const [dateSection, photos] of map) out.push({ dateSection, photos });
  return out;
}
const loadMainPage = async (reset) => {
  if (mainPageInFlight) {
    if (reset) mainPendingReset = true;
    return;
  }
  if (!reset && !mainHasMore.value) return;
  mainPageInFlight = true;
  try {
    let doReset = reset;
    while (true) {
      mainPendingReset = false;
      const page = await window.api.photos.getPage({
        view: "all",
        filters: pagedFilters,
        sort: "imported_at",
        desc: true,
        cursor: doReset ? void 0 : mainCursor.value ?? void 0,
        limit: MAIN_PAGE_SIZE
      });
      if (mainPendingReset) {
        doReset = true;
        continue;
      }
      allPhotos.value = doReset ? page.items : [...allPhotos.value, ...page.items];
      photoIndex.clear();
      for (const p of allPhotos.value) photoIndex.set(p.id, p);
      photoRev.value++;
      sections.value = groupSectionsInOrder(allPhotos.value);
      mainCursor.value = page.nextCursor;
      mainHasMore.value = page.nextCursor !== null;
      mainPagedActive.value = true;
      break;
    }
  } catch (error) {
    console.error("加载图片失败:", error);
    toast.error("加载图片失败", { description: error.message });
  } finally {
    mainPageInFlight = false;
  }
};
const loadMoreMain = () => {
  void loadMainPage(false);
};
const loadPhotos = async () => {
  const seq = ++loadFullSeq;
  try {
    loading.value = true;
    if (mainPageGate?.()) {
      await loadMainPage(true);
      void loadUnsorted();
      void loadRecent();
      void loadSidebarCounts();
      return;
    }
    mainHasMore.value = false;
    mainPagedActive.value = false;
    const data = await window.api.photos.getByDateSection();
    if (seq !== loadFullSeq) return;
    sections.value = data;
    allPhotos.value = [];
    photoIndex.clear();
    for (const section of data) {
      for (const p of section.photos) photoIndex.set(p.id, p);
      allPhotos.value.push(...section.photos);
    }
    photoRev.value++;
    void loadUnsorted();
    void loadRecent();
    void loadSidebarCounts();
  } catch (error) {
    console.error("加载图片失败:", error);
    toast.error("加载图片失败", { description: error.message });
  } finally {
    loading.value = false;
  }
};
let loadFullSeq = 0;
const loadAlbums = async () => {
  try {
    albums.value = await window.api.photos.listAlbums();
  } catch (error) {
    console.error("加载相册失败:", error);
  }
};
const loadFolders = async () => {
  try {
    folders.value = await window.api.photos.listPhotoFolders();
  } catch (error) {
    console.error("加载文件夹失败:", error);
  }
};
const loadSmartAlbums = async () => {
  try {
    smartAlbums.value = await window.api.photos.listSmartAlbums();
    await loadDictionaryTags();
  } catch (error) {
    console.error("加载智能文件夹失败:", error);
  }
};
const loadDictionaryTags = async () => {
  try {
    dictionaryTags.value = await window.api.tag.getTags();
  } catch {
    dictionaryTags.value = [];
  }
};
const PAGED_TRASH_KEY = "leaf:use-paged-trash";
const TRASH_PAGE_SIZE = 200;
const trashCursor = ref(null);
const trashHasMore = ref(false);
let trashPageInFlight = false;
let trashPendingReset = false;
function usePagedTrash() {
  try {
    return localStorage.getItem(PAGED_TRASH_KEY) !== "0";
  } catch {
    return true;
  }
}
const loadTrashPage = async (reset) => {
  if (trashPageInFlight) {
    if (reset) trashPendingReset = true;
    return;
  }
  if (!reset && !trashHasMore.value) return;
  trashPageInFlight = true;
  try {
    let doReset = reset;
    while (true) {
      trashPendingReset = false;
      const page = await window.api.photos.getPage({
        view: "trash",
        sort: "deleted_at",
        desc: true,
        cursor: doReset ? void 0 : trashCursor.value ?? void 0,
        limit: TRASH_PAGE_SIZE
      });
      if (trashPendingReset) {
        doReset = true;
        continue;
      }
      recycleBinPhotos.value = doReset ? page.items : [...recycleBinPhotos.value, ...page.items];
      recycleCount.value = page.total;
      trashCursor.value = page.nextCursor;
      trashHasMore.value = page.nextCursor !== null;
      break;
    }
  } catch (error) {
    console.error("加载回收站失败:", error);
  } finally {
    trashPageInFlight = false;
  }
};
const loadMoreTrash = () => {
  void loadTrashPage(false);
};
const PAGED_FAVORITES_KEY = "leaf:use-paged-favorites";
const PAGED_FOLDER_KEY = "leaf:use-paged-folder";
const FAVORITES_PAGE_SIZE = 200;
const FOLDER_PAGE_SIZE = 200;
const favoritesCursor = ref(null);
const favoritesHasMore = ref(false);
let favoritesPageInFlight = false;
let favoritesPendingReset = false;
const folderCursor = ref(null);
const folderHasMore = ref(false);
let folderPageInFlight = false;
let folderPendingReset = false;
let pagedFolderId = null;
function usePagedFavorites() {
  try {
    return localStorage.getItem(PAGED_FAVORITES_KEY) !== "0";
  } catch {
    return true;
  }
}
function usePagedFolder() {
  try {
    return localStorage.getItem(PAGED_FOLDER_KEY) !== "0";
  } catch {
    return true;
  }
}
const loadFavoritesPage = async (reset) => {
  if (favoritesPageInFlight) {
    if (reset) favoritesPendingReset = true;
    return;
  }
  if (!reset && !favoritesHasMore.value) return;
  favoritesPageInFlight = true;
  try {
    let doReset = reset;
    while (true) {
      favoritesPendingReset = false;
      const page = await window.api.photos.getPage({
        view: "favorites",
        filters: pagedFilters,
        sort: "imported_at",
        desc: true,
        cursor: doReset ? void 0 : favoritesCursor.value ?? void 0,
        limit: FAVORITES_PAGE_SIZE
      });
      if (favoritesPendingReset) {
        doReset = true;
        continue;
      }
      favoritesPhotos.value = doReset ? page.items : [...favoritesPhotos.value, ...page.items];
      favoritesCursor.value = page.nextCursor;
      favoritesHasMore.value = page.nextCursor !== null;
      break;
    }
  } catch (error) {
    console.error("加载收藏失败:", error);
  } finally {
    favoritesPageInFlight = false;
  }
};
const loadMoreFavorites = () => {
  void loadFavoritesPage(false);
};
const loadFolderPage = async (reset) => {
  if (folderPageInFlight) {
    if (reset) folderPendingReset = true;
    return;
  }
  if (!pagedFolderId) return;
  if (!reset && !folderHasMore.value) return;
  folderPageInFlight = true;
  try {
    let doReset = reset;
    while (true) {
      folderPendingReset = false;
      const page = await window.api.photos.getPage({
        view: "folder",
        folderId: pagedFolderId,
        filters: pagedFilters,
        sort: "imported_at",
        desc: true,
        cursor: doReset ? void 0 : folderCursor.value ?? void 0,
        limit: FOLDER_PAGE_SIZE
      });
      if (folderPendingReset) {
        doReset = true;
        continue;
      }
      folderPhotos.value = doReset ? page.items : [...folderPhotos.value, ...page.items];
      folderCursor.value = page.nextCursor;
      folderHasMore.value = page.nextCursor !== null;
      break;
    }
  } catch (error) {
    console.error("加载文件夹失败:", error);
  } finally {
    folderPageInFlight = false;
  }
};
const loadMoreFolder = () => {
  void loadFolderPage(false);
};
const PAGED_SEARCH_KEY = "leaf:use-paged-search";
const SEARCH_PAGE_SIZE = 200;
const searchPoolPhotos = ref([]);
const searchCursor = ref(null);
const searchHasMore = ref(false);
let searchPageInFlight = false;
let searchPendingReset = false;
const searchPoolQuery = ref("");
let lastSearchSpec;
let lastSearchQuery = "";
function usePagedSearch() {
  try {
    return localStorage.getItem(PAGED_SEARCH_KEY) !== "0";
  } catch {
    return true;
  }
}
const loadSearchPage = async (reset, query, filters) => {
  lastSearchQuery = query;
  if (filters) lastSearchSpec = filters;
  if (searchPageInFlight) {
    if (reset) searchPendingReset = true;
    return;
  }
  if (!reset && !searchHasMore.value) return;
  searchPageInFlight = true;
  try {
    let doReset = reset;
    while (true) {
      searchPendingReset = false;
      const page = await window.api.photos.getPage({
        view: "search",
        query: lastSearchQuery,
        filters: lastSearchSpec,
        sort: "imported",
        desc: true,
        cursor: doReset ? void 0 : searchCursor.value ?? void 0,
        limit: SEARCH_PAGE_SIZE
      });
      if (searchPendingReset) {
        doReset = true;
        continue;
      }
      searchPoolPhotos.value = doReset ? page.items : [...searchPoolPhotos.value, ...page.items];
      searchCursor.value = page.nextCursor;
      searchHasMore.value = page.nextCursor !== null;
      searchPoolQuery.value = lastSearchQuery;
      break;
    }
  } catch (error) {
    console.error("搜索失败:", error);
  } finally {
    searchPageInFlight = false;
  }
};
const loadMoreSearch = () => {
  void loadSearchPage(false, searchPoolQuery.value);
};
const loadRecycleBin = async () => {
  try {
    if (usePagedTrash()) {
      await loadTrashPage(true);
      return;
    }
    recycleBinPhotos.value = await window.api.photos.getRecycleBin();
    recycleCount.value = recycleBinPhotos.value.length;
  } catch (error) {
    console.error("加载回收站失败:", error);
  }
};
const refreshAlbumPhotos = async (albumId) => {
  if (!albumId) return;
  try {
    albumPhotos.value = await window.api.photos.getAlbumPhotos(albumId);
  } catch (error) {
    console.error("加载相册内容失败:", error);
  }
};
const refreshFolderPhotos = async (folderId) => {
  if (!folderId) return;
  pagedFolderId = folderId;
  if (usePagedFolder()) {
    await loadFolderPage(true);
    return;
  }
  try {
    folderPhotos.value = await window.api.photos.getFolderPhotos(folderId);
  } catch (error) {
    console.error("加载文件夹内容失败:", error);
  }
};
const refreshSmartAlbumPhotos = async (smartId) => {
  if (!smartId) return;
  try {
    smartAlbumPhotos.value = await window.api.photos.getSmartAlbumPhotos(smartId);
  } catch (error) {
    console.error("加载智能文件夹内容失败:", error);
  }
};
const loadUnsorted = async () => {
  try {
    unsortedPhotos.value = await window.api.photos.getUnsorted();
  } catch (error) {
    console.error("加载未分类失败:", error);
  }
};
const loadRecent = async () => {
  try {
    recentPhotos.value = await window.api.photos.getRecent();
  } catch (error) {
    console.error("加载最近添加失败:", error);
  }
};
const refreshAllPools = async () => {
  await Promise.all([
    loadPhotos(),
    loadUnsorted(),
    loadRecent(),
    loadRecentViewed(),
    loadDictionaryTags(),
    // 分页池保活：对应视图激活过就刷新其窗口（导入/删除后内容不陈旧）
    ...usePagedFavorites() ? [loadFavoritesPage(true)] : [],
    ...pagedFolderId && usePagedFolder() ? [loadFolderPage(true)] : [],
    // 全局搜索池：有活动搜索词时重刷（导入/删除后结果不陈旧）
    ...searchPoolQuery.value ? [loadSearchPage(true, searchPoolQuery.value)] : []
  ]);
};
const setLastViewed = async (id) => {
  try {
    await window.api.photos.setLastViewed(id);
    const p = allPhotos.value.find((x) => x.id === id);
    if (p) p.lastViewedAt = Date.now();
    void loadRecentViewed();
  } catch (error) {
    console.error("记录查看时间失败:", error);
  }
};
function replacePhotoLocal(updated) {
  photoIndex.set(updated.id, updated);
  const replaceIn = (list) => {
    const i = list.findIndex((p) => p.id === updated.id);
    if (i >= 0) list.splice(i, 1, updated);
  };
  replaceIn(allPhotos.value);
  replaceIn(albumPhotos.value);
  replaceIn(folderPhotos.value);
  replaceIn(smartAlbumPhotos.value);
  replaceIn(recycleBinPhotos.value);
  replaceIn(favoritesPhotos.value);
  replaceIn(searchPoolPhotos.value);
  replaceIn(unsortedPhotos.value);
  replaceIn(recentPhotos.value);
  for (const section of sections.value) replaceIn(section.photos);
  photoRev.value++;
}
export function usePhotoData() {
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
    livePhoto
  };
}
let offProcessing = null;
let processingResetTimer;
export function bindProcessingProgress() {
  if (offProcessing) return offProcessing;
  offProcessing = window.api.photos.onProcessing((progress) => {
    processing.value = progress;
    if (progress.status === "done") {
      void window.api.photos.getById(progress.photoId).then((updated) => {
        if (updated) replacePhotoLocal(updated);
      });
    }
    if (progress.done >= progress.total) {
      window.clearTimeout(processingResetTimer);
      processingResetTimer = window.setTimeout(() => {
        processing.value = null;
      }, 1500);
    }
  });
  return () => {
    offProcessing?.();
    offProcessing = null;
  };
}
let offViewWatcher = null;
export function bindViewWatcher() {
  if (offViewWatcher) return offViewWatcher;
  const tabs = useLibraryTabs();
  const stop = watch(
    () => tabs.activeView,
    (view) => {
      if (view === "trash") {
        void loadRecycleBin();
      } else if (view === "favorites") {
        if (usePagedFavorites()) void loadFavoritesPage(true);
      } else if (view.startsWith("smart:")) {
        void refreshSmartAlbumPhotos(view.slice(6));
      } else if (view.startsWith("album:")) {
        void refreshAlbumPhotos(view.slice(6));
      } else if (view.startsWith("folder:")) {
        void refreshFolderPhotos(view.slice(7));
      } else if (view === "unsorted") {
        void loadUnsorted();
      } else if (view === "recent") {
        void loadRecent();
      } else if (view === "recents") {
        void loadRecentViewed();
      }
    },
    { immediate: true }
  );
  offViewWatcher = stop;
  return () => {
    stop();
    offViewWatcher = null;
  };
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZVBob3RvRGF0YS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIExlYWYg57Sg5p2Q5bqTIMK3IOWbvuW6k+aVsOaNruWxgu+8iEQtMDA4IOmHjeaehO+8iVxuICpcbiAqIOaooeWdl+e6p+WNleS+i++8mnBob3RvIOinhuWbvuOAgUxpYnJhcnlQYW5lbOOAgeWPs+mUruiPnOWNleetieWFseS6q+WQjOS4gOS7veaVsOaNruOAglxuICog5Y6fIGluZGV4LnZ1ZSDnmoTliqDovb0v5Yi35paw6YC76L6R5pW05L2T6L+B5YWl77yb6KeG5Zu+54m55a6a55qE5rGg5a2Q77yI55u45YaML+aWh+S7tuWkuS9cbiAqIOaZuuiDveWkueWGheWuue+8iemajyBhY3RpdmVWaWV3IOWIh+aNouaMiemcgOWIt+aWsOOAglxuICovXG5pbXBvcnQgeyByZWYsIHdhdGNoIH0gZnJvbSAndnVlJ1xuaW1wb3J0IHR5cGUge1xuICBBbGJ1bSxcbiAgUGhvdG8sXG4gIFBob3RvRm9sZGVyLFxuICBQaG90b1NlY3Rpb24sXG4gIFByb2Nlc3NpbmdQcm9ncmVzcyxcbiAgU21hcnRBbGJ1bSxcbiAgVGFnU3VtbWFyeVxufSBmcm9tICdAcmVuZGVyZXIvdHlwZXMvcGhvdG8nXG5pbXBvcnQgeyB1c2VUb2FzdCB9IGZyb20gJ0Bjb21wb3NhYmxlcy91c2VUb2FzdCdcbmltcG9ydCB7IHVzZUxpYnJhcnlUYWJzIH0gZnJvbSAnQHJlbmRlcmVyL3N0b3Jlcy9saWJyYXJ5VGFicydcblxuY29uc3QgdG9hc3QgPSB1c2VUb2FzdCgpXG5cbmNvbnN0IGxvYWRpbmcgPSByZWYoZmFsc2UpXG5jb25zdCBzZWN0aW9ucyA9IHJlZjxQaG90b1NlY3Rpb25bXT4oW10pXG5jb25zdCBhbGxQaG90b3MgPSByZWY8UGhvdG9bXT4oW10pXG5jb25zdCBzbWFydEFsYnVtcyA9IHJlZjxTbWFydEFsYnVtW10+KFtdKVxuY29uc3QgYWxidW1zID0gcmVmPEFsYnVtW10+KFtdKVxuY29uc3QgZm9sZGVycyA9IHJlZjxQaG90b0ZvbGRlcltdPihbXSlcbmNvbnN0IGRpY3Rpb25hcnlUYWdzID0gcmVmPFRhZ1N1bW1hcnlbXT4oW10pXG5jb25zdCByZWN5Y2xlQmluUGhvdG9zID0gcmVmPFBob3RvW10+KFtdKVxuY29uc3QgcmVjeWNsZUNvdW50ID0gcmVmKDApXG5jb25zdCBwcm9jZXNzaW5nID0gcmVmPFByb2Nlc3NpbmdQcm9ncmVzcyB8IG51bGw+KG51bGwpXG5cbi8qKlxuICog5Luj56CB5a6h5p+lIFAwLTEx77yaUGhvdG8gaWQg4oaSIFBob3RvIOeahCBPKDEpIOe0ouW8leOAglxuICog5pen5a6e546w5aSa5aSEIGBpZHMubWFwKGlkID0+IGFsbFBob3Rvcy5maW5kKC4uLikpYCDmmK8gTyhOw5dNKe+8jDUg5LiH5bqT5LiLXG4gKiDlj7PplK7oj5zljZUv5om56YeP6YeN5ZG95ZCNL+ajgOafpeWZqOavj+aTjeS9nOS4gOasoemDveaYr+aVsOS6v+asoeavlOi+g+OAguatpCBNYXAg6Z2e5ZON5bqU5byP77yMXG4gKiDku4XlnKggbG9hZFBob3RvcyAvIHJlcGxhY2VQaG90b0xvY2FsIOaXtuWQjOatpee7tOaKpO+8jOS4jeWPguS4jiBWdWUg5ZON5bqU57O757uf44CCXG4gKi9cbmNvbnN0IHBob3RvSW5kZXggPSBuZXcgTWFwPHN0cmluZywgUGhvdG8+KClcblxuLyoqXG4gKiBwaG90b0luZGV4IOWIu+aEj+S4jeWBmuWTjeW6lOW8j++8jOS9humihOiniOi/meexu+OAjOmVv+acn+aMgeacieWNleadoee0oOadkOOAjeeahOinhuWbvumcgOimgeaEn+efpVxuICog5pW05L2T5pu/5o2i77yIcmVwbGFjZVBob3RvTG9jYWwg5o2i5paw5a+56LGh77yM5pen5byV55So5LiN5Lya6Ieq5bex5Y+Y77yJ44CCYnVtcCDkuIDmrKHorqHmlbDvvIxcbiAqIGxpdmVQaG90byDnmoTor7vlj5bmlrnlsLHog73lnKjor4TliIYv5pS26JePL+agh+etvi/mlLnlkI3lkI7mi7/liLDmtLvlr7nosaHjgIJcbiAqL1xuY29uc3QgcGhvdG9SZXYgPSByZWYoMClcblxuLyoqIOaMiSBpZCDlj5blvZPliY3mnIDmlrDnmoTntKDmnZDlr7nosaHvvIjlk43lupTlvI/vvJvkuI3lrZjlnKjov5Tlm54gdW5kZWZpbmVk77yJICovXG5mdW5jdGlvbiBsaXZlUGhvdG8oaWQ6IHN0cmluZyk6IFBob3RvIHwgdW5kZWZpbmVkIHtcbiAgdm9pZCBwaG90b1Jldi52YWx1ZVxuICByZXR1cm4gcGhvdG9JbmRleC5nZXQoaWQpXG59XG5cbi8qKiBPKDEpIOaJuemHj+aMiSBpZCDmn6XntKDmnZDvvIjpobrluo/nqLPlrprvvIznvLrlpLHpobnot7Pov4fvvIkgKi9cbmZ1bmN0aW9uIGJ5SWRzKGlkczogc3RyaW5nW10pOiBQaG90b1tdIHtcbiAgY29uc3Qgb3V0OiBQaG90b1tdID0gW11cbiAgbGV0IG1pc3NpbmcgPSBmYWxzZVxuICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgIGNvbnN0IHAgPSBwaG90b0luZGV4LmdldChpZClcbiAgICBpZiAocCkgb3V0LnB1c2gocClcbiAgICBlbHNlIG1pc3NpbmcgPSB0cnVlXG4gIH1cbiAgaWYgKCFtaXNzaW5nKSByZXR1cm4gb3V0XG4gIC8vIOe0ouW8leWPquimhuebluS4u+axoO+8muWbnuaUtuermS/mlLbol48v5paH5Lu25aS5L+aQnOe0ouetieaxoOeahOe0oOadkOWbnumAgOe6v+aAp+afpeaJvu+8iOWuoeafpSBQMS0577yJ77yMXG4gIC8vIOWQpuWImeWbnuaUtuermeOAjOWcqOiuv+i+vuS4reaJk+W8gOOAjeOAgeWIhumhteeql+WPo+WklueahOWIhuS6qy/lpI3liLbkvJrpnZnpu5jnqbrovaxcbiAgY29uc3QgYnlJZCA9IG5ldyBNYXA8UGhvdG9bJ2lkJ10sIFBob3RvPigpXG4gIGZvciAoY29uc3QgcCBvZiBbXG4gICAgLi4ucmVjeWNsZUJpblBob3Rvcy52YWx1ZSxcbiAgICAuLi5mYXZvcml0ZXNQaG90b3MudmFsdWUsXG4gICAgLi4uZm9sZGVyUGhvdG9zLnZhbHVlLFxuICAgIC4uLnNlYXJjaFBvb2xQaG90b3MudmFsdWUsXG4gICAgLi4udW5zb3J0ZWRQaG90b3MudmFsdWUsXG4gICAgLi4ucmVjZW50UGhvdG9zLnZhbHVlLFxuICAgIC4uLmFsYnVtUGhvdG9zLnZhbHVlLFxuICAgIC4uLnNtYXJ0QWxidW1QaG90b3MudmFsdWVcbiAgXSkge1xuICAgIGlmICghcGhvdG9JbmRleC5oYXMocC5pZCkpIGJ5SWQuc2V0KHAuaWQsIHApXG4gIH1cbiAgY29uc3Qgb3V0MjogUGhvdG9bXSA9IFtdXG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgcCA9IHBob3RvSW5kZXguZ2V0KGlkKSA/PyBieUlkLmdldChpZClcbiAgICBpZiAocCkgb3V0Mi5wdXNoKHApXG4gIH1cbiAgcmV0dXJuIG91dDJcbn1cblxuLyoqIOinhuWbvueJueWumuWGheWuueaxoCAqL1xuY29uc3QgYWxidW1QaG90b3MgPSByZWY8UGhvdG9bXT4oW10pXG5pbXBvcnQgdHlwZSB7IFNtYXJ0QWxidW1SdWxlcyB9IGZyb20gJ0BzaGFyZWQvc21hcnRBbGJ1bVJ1bGVzJ1xuXG5jb25zdCBmb2xkZXJQaG90b3MgPSByZWY8UGhvdG9bXT4oW10pXG4vKiog5YiG6aG15YyW6Zi25q61IDLvvJrmlLbol4/op4blm77nqpflj6PmsaDvvIh1c2UtcGFnZWQtZmF2b3JpdGVzIOmXqOaOp++8iSAqL1xuY29uc3QgZmF2b3JpdGVzUGhvdG9zID0gcmVmPFBob3RvW10+KFtdKVxuY29uc3Qgc21hcnRBbGJ1bVBob3RvcyA9IHJlZjxQaG90b1tdPihbXSlcbi8qKiDCpzMgTDQgLyDCpzIuQiDlm7rlrprlhaXlj6PmsaDvvJrmnKrliIbnsbsgLyDmnIDov5Hmt7vliqAgLyDmnIDov5Hmn6XnnIsgKi9cbmNvbnN0IHVuc29ydGVkUGhvdG9zID0gcmVmPFBob3RvW10+KFtdKVxuY29uc3QgcmVjZW50UGhvdG9zID0gcmVmPFBob3RvW10+KFtdKVxuLyoqXG4gKiDmnIDov5Hmn6XnnIvvvJrotbAgcGhvdG9zOmdldFJlY2VudFZpZXdlZO+8iGxhc3Rfdmlld2VkX2F0IERFU0PvvIzkuIrpmZAgMjAw77yJ44CCXG4gKiDmraTliY3ku44gYWxsUGhvdG9zIOacrOWcsOa0vueUn+KAlOKAlOWIhumhteaAgeS4iyBhbGxQaG90b3Mg5Y+q5pivIDUwMCDooYznqpflj6PvvIxcbiAqIOeql+WPo+WklueahOafpeeci+WOhuWPsuS4gOW+i+eci+S4jeWIsO+8jOS+p+agj+W+veeroOS5n+awuOi/nOS4jei2hei/h+eql+WPo+Wkp+Wwj+OAglxuICovXG5jb25zdCBSRUNFTlRTX0xJTUlUID0gMjAwXG5jb25zdCByZWNlbnRWaWV3ZWRQaG90b3MgPSByZWY8UGhvdG9bXT4oW10pXG5jb25zdCBsb2FkUmVjZW50Vmlld2VkID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICB0cnkge1xuICAgIHJlY2VudFZpZXdlZFBob3Rvcy52YWx1ZSA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmdldFJlY2VudFZpZXdlZChSRUNFTlRTX0xJTUlUKVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+WKoOi9veacgOi/keafpeeci+Wksei0pTonLCBlcnJvcilcbiAgfVxufVxuXG4vKiog5L6n5qCP5Zu65a6a6aG56K6h5pWw77yI5YWo6YOoIC8g5pyq5qCH562+IC8g5pyA6L+R5p+l55yL77yJ77yaU1FMIOiBmuWQiO+8jOS4jeWQg+WIhumhteeql+WPoyAqL1xuY29uc3Qgc2lkZWJhckNvdW50cyA9IHJlZih7IGFsbDogMCwgdW50YWdnZWQ6IDAsIHJlY2VudFZpZXdlZDogMCB9KVxuY29uc3QgbG9hZFNpZGViYXJDb3VudHMgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIHRyeSB7XG4gICAgc2lkZWJhckNvdW50cy52YWx1ZSA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmdldFNpZGViYXJDb3VudHMoKVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+WKoOi9veS+p+agj+iuoeaVsOWksei0pTonLCBlcnJvcilcbiAgfVxufVxuXG4vLyDilIDilIAg5YiG6aG15YyW6Zi25q61IDLvvJrkuLvop4blm77nqpflj6Plj5bmlbDvvIhkb2NzL1BBR0lOQVRJT05fREVTSUdOLm1k77yJ4pSA4pSAXG4vLyDpl6jmjqfmt7flkIjvvJrku4XlvZPjgIzml6Dku7vkvZXnu7TluqbnrZvpgIkgKyDpnZ7mkJzntKIv5Zyw5Zu+L+afpemHjS/nm7jkvLwv6ZqP5py66KeG5Zu+44CN5pe26LWwXG4vLyBrZXlzZXQg5YiG6aG177yIaW1wb3J0ZWRfYXQgREVTQ++8jOS4juaXpyBnZXRBbGwg5rWB5bqP5LiA6Ie0IOKGkiDliIbnu4Qv57uE5YaF5o6S5bqP6K+t5LmJ5LiN5Y+Y77yJ44CCXG4vLyDpl6jmjqfnlLEgdXNlUGhvdG9GaWx0ZXJzIOazqOWGjO+8iOWPjeWQkeS+nei1lu+8jOmBv+WFjeW+queOryBpbXBvcnTvvInvvJvku7vkuIDnrZvpgInmv4DmtLvml7Zcbi8vIHdhdGNoIOinpuWPkSBsb2FkUGhvdG9zKCkg5YiH5Zue5YWo6YeP6Lev5b6E4oCU4oCU5Lik56eN5rGg55qE6L6T5Ye65LiO546w54q26YCQ5a2X6IqC5LiA6Ie044CCXG4vLyBGaWx0ZXJCYXIg5b+r562b55qEIFNRTCDkuIvmjqjlnKjjgIzluKbnrZvpgInliIbpobXjgI3nnJ/mraPpnIDopoHml7blho3lgZrvvIjpmLbmrrUgMmLvvIzlj6/pgInvvInjgIJcbmNvbnN0IE1BSU5fUEFHRV9TSVpFID0gNTAwXG5jb25zdCBtYWluQ3Vyc29yID0gcmVmPHN0cmluZyB8IG51bGw+KG51bGwpXG5jb25zdCBtYWluSGFzTW9yZSA9IHJlZihmYWxzZSlcbmxldCBtYWluUGFnZUluRmxpZ2h0ID0gZmFsc2VcbmxldCBtYWluUGVuZGluZ1Jlc2V0ID0gZmFsc2VcbmxldCBtYWluUGFnZUdhdGU6ICgoKSA9PiBib29sZWFuKSB8IG51bGwgPSBudWxsXG4vKiog6Zi25q61IDPvvJrnu7TluqbnrZvpgIkgc3BlY++8iHVzZVBob3RvRmlsdGVycyDms6jlhaXvvIzkuIvmjqggV0hFUkXvvInjgIJcbiAqICDkuLsv5pS26JePL+aWh+S7tuWkuS/mkJzntKLlm5vkuKrliIbpobXmsaDlhbHnlKjlkIzkuIDku73igJTigJTmvI/kvKDku7vkuIDmsaDljbPjgIxjaGlwIOS6rui1t+OAgee9keagvOS4jeWKqOOAjSAqL1xubGV0IHBhZ2VkRmlsdGVyczogU21hcnRBbGJ1bVJ1bGVzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkXG4vKiog5Li76KeG5Zu+5b2T5YmN5piv5ZCm6LWw5YiG6aG156qX5Y+j6Lev5b6E77yIZGlzcGxheVNlY3Rpb25zIOaNruatpOi3s+i/h+eql+WPo+WGhSBtYXRjaEFsbO+8iSAqL1xuY29uc3QgbWFpblBhZ2VkQWN0aXZlID0gcmVmKGZhbHNlKVxuZnVuY3Rpb24gc2V0UGFnZWRGaWx0ZXJzKHNwZWM6IFNtYXJ0QWxidW1SdWxlcyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuICBwYWdlZEZpbHRlcnMgPSBzcGVjXG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyTWFpblBhZ2VHYXRlKGZuOiAoKSA9PiBib29sZWFuKTogdm9pZCB7XG4gIG1haW5QYWdlR2F0ZSA9IGZuXG59XG5cbi8qKiDkuI7kuLvov5vnqIsgZ2V0UGhvdG9zQnlEYXRlU2VjdGlvbiDnm7jlkIznmoTliIbnu4Tor63kuYnvvJrmjInmtYHluo/pppbmrKHlh7rnjrDmjpLliJfvvIznu4TlhoXkv53mjIHmtYHluo8gKi9cbmZ1bmN0aW9uIGdyb3VwU2VjdGlvbnNJbk9yZGVyKGl0ZW1zOiBQaG90b1tdKTogUGhvdG9TZWN0aW9uW10ge1xuICBjb25zdCBtYXAgPSBuZXcgTWFwPHN0cmluZywgUGhvdG9bXT4oKVxuICBjb25zdCBvdXQ6IFBob3RvU2VjdGlvbltdID0gW11cbiAgZm9yIChjb25zdCBwIG9mIGl0ZW1zKSB7XG4gICAgY29uc3QgbGlzdCA9IG1hcC5nZXQocC5kYXRlU2VjdGlvbilcbiAgICBpZiAobGlzdCkgbGlzdC5wdXNoKHApXG4gICAgZWxzZSBtYXAuc2V0KHAuZGF0ZVNlY3Rpb24sIFtwXSlcbiAgfVxuICBmb3IgKGNvbnN0IFtkYXRlU2VjdGlvbiwgcGhvdG9zXSBvZiBtYXApIG91dC5wdXNoKHsgZGF0ZVNlY3Rpb24sIHBob3RvcyB9KVxuICByZXR1cm4gb3V0XG59XG5cbmNvbnN0IGxvYWRNYWluUGFnZSA9IGFzeW5jIChyZXNldDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBpZiAobWFpblBhZ2VJbkZsaWdodCkge1xuICAgIC8vIOWcqOmjnuacn+mXtOaUtuWIsCByZXNldO+8muiusOW9leW+hemHjee9ruW5tuWcqOW9k+WJjeWTjeW6lOiQveWcsOWQjumHjei3ke+8jOS4jeWGjemdmem7mOS4ouW8g++8iOWuoeafpSBQMS0377yJXG4gICAgaWYgKHJlc2V0KSBtYWluUGVuZGluZ1Jlc2V0ID0gdHJ1ZVxuICAgIHJldHVyblxuICB9XG4gIGlmICghcmVzZXQgJiYgIW1haW5IYXNNb3JlLnZhbHVlKSByZXR1cm5cbiAgbWFpblBhZ2VJbkZsaWdodCA9IHRydWVcbiAgdHJ5IHtcbiAgICBsZXQgZG9SZXNldCA9IHJlc2V0XG4gICAgLy8g5Zyo6aOe5pyf6Ze055qEIHJlc2V0IOivt+axguS8mue9riBtYWluUGVuZGluZ1Jlc2V077ya5Lii5byD6L+H5pyf5ZON5bqU5bm25LulIHJlc2V0IOivreS5iemHjei3ke+8jFxuICAgIC8vIOS/neivgeacgOe7iOiQveWcsOeahOS4gOWumuaYr+acgOWQjuS4gOasoeivt+axgueahOinhuWbvueKtuaAgVxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBtYWluUGVuZGluZ1Jlc2V0ID0gZmFsc2VcbiAgICAgIGNvbnN0IHBhZ2UgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5nZXRQYWdlKHtcbiAgICAgICAgdmlldzogJ2FsbCcsXG4gICAgICAgIGZpbHRlcnM6IHBhZ2VkRmlsdGVycyxcbiAgICAgICAgc29ydDogJ2ltcG9ydGVkX2F0JyxcbiAgICAgICAgZGVzYzogdHJ1ZSxcbiAgICAgICAgY3Vyc29yOiBkb1Jlc2V0ID8gdW5kZWZpbmVkIDogKG1haW5DdXJzb3IudmFsdWUgPz8gdW5kZWZpbmVkKSxcbiAgICAgICAgbGltaXQ6IE1BSU5fUEFHRV9TSVpFXG4gICAgICB9KVxuICAgICAgaWYgKG1haW5QZW5kaW5nUmVzZXQpIHtcbiAgICAgICAgZG9SZXNldCA9IHRydWVcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGFsbFBob3Rvcy52YWx1ZSA9IGRvUmVzZXQgPyBwYWdlLml0ZW1zIDogWy4uLmFsbFBob3Rvcy52YWx1ZSwgLi4ucGFnZS5pdGVtc11cbiAgICAgIHBob3RvSW5kZXguY2xlYXIoKVxuICAgICAgZm9yIChjb25zdCBwIG9mIGFsbFBob3Rvcy52YWx1ZSkgcGhvdG9JbmRleC5zZXQocC5pZCwgcClcbiAgICAgIHBob3RvUmV2LnZhbHVlKytcbiAgICAgIHNlY3Rpb25zLnZhbHVlID0gZ3JvdXBTZWN0aW9uc0luT3JkZXIoYWxsUGhvdG9zLnZhbHVlKVxuICAgICAgbWFpbkN1cnNvci52YWx1ZSA9IHBhZ2UubmV4dEN1cnNvclxuICAgICAgbWFpbkhhc01vcmUudmFsdWUgPSBwYWdlLm5leHRDdXJzb3IgIT09IG51bGxcbiAgICAgIG1haW5QYWdlZEFjdGl2ZS52YWx1ZSA9IHRydWVcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+WKoOi9veWbvueJh+Wksei0pTonLCBlcnJvcilcbiAgICB0b2FzdC5lcnJvcign5Yqg6L295Zu+54mH5aSx6LSlJywgeyBkZXNjcmlwdGlvbjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0pXG4gIH0gZmluYWxseSB7XG4gICAgbWFpblBhZ2VJbkZsaWdodCA9IGZhbHNlXG4gIH1cbn1cblxuY29uc3QgbG9hZE1vcmVNYWluID0gKCk6IHZvaWQgPT4ge1xuICB2b2lkIGxvYWRNYWluUGFnZShmYWxzZSlcbn1cblxuY29uc3QgbG9hZFBob3RvcyA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3Qgc2VxID0gKytsb2FkRnVsbFNlcVxuICB0cnkge1xuICAgIGxvYWRpbmcudmFsdWUgPSB0cnVlXG4gICAgLy8g5YiG6aG15YyW6Zi25q61IDLvvJrpl6jmjqfmlL7ooYwg4oaSIOS4u+inhuWbvueql+WPo+WPluaVsO+8iOa1geW6jy/liIbnu4Qv57uE5YaF5o6S5bqP5LiO5YWo6YeP6Lev5b6E5LiA6Ie077yMXG4gICAgLy8g6KeB5LiK5pa56Zeo5o6n5rOo6YeK77yJ77yb562b6YCJ5r+A5rS75pe26Zeo5o6n5Li65YGH77yM6LWw5Y6f5pyJ5YWo6YeP6Lev5b6EXG4gICAgaWYgKG1haW5QYWdlR2F0ZT8uKCkpIHtcbiAgICAgIGF3YWl0IGxvYWRNYWluUGFnZSh0cnVlKVxuICAgICAgLy8g6aG65bim5Yi35paw5L6n5qCP5Zu65a6a6aG55rGg5LiO5b6956ug6K6h5pWw77yI5pyq5YiG57G7L+acgOi/kea3u+WKoC/lhajpg6jCt+acquagh+etvsK35pyA6L+R5p+l55yL77yJ44CCXG4gICAgICAvLyDov5nmnaHliIbpobXliIbmlK/mmK/pu5jorqTot6/lvoTvvIzlhajph4/liIbmlK/pgqPku73liLfmlrDliLDkuI3kuobov5nph4zigJTigJTmvI/kuIDlpITlvr3nq6DlsLHmgZLkuLogMFxuICAgICAgdm9pZCBsb2FkVW5zb3J0ZWQoKVxuICAgICAgdm9pZCBsb2FkUmVjZW50KClcbiAgICAgIHZvaWQgbG9hZFNpZGViYXJDb3VudHMoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIG1haW5IYXNNb3JlLnZhbHVlID0gZmFsc2VcbiAgICBtYWluUGFnZWRBY3RpdmUudmFsdWUgPSBmYWxzZVxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5nZXRCeURhdGVTZWN0aW9uKClcbiAgICAvLyDlhajph4/ot6/lvoTml6DlnKjpo57moIforrDvvIznlKjluo/lj7fpmLLov4fmnJ/lk43lupTopobnm5bmlrDlk43lupTvvIjlrqHmn6UgUDEtN++8iVxuICAgIGlmIChzZXEgIT09IGxvYWRGdWxsU2VxKSByZXR1cm5cbiAgICBzZWN0aW9ucy52YWx1ZSA9IGRhdGFcbiAgICBhbGxQaG90b3MudmFsdWUgPSBbXVxuICAgIHBob3RvSW5kZXguY2xlYXIoKVxuICAgIGZvciAoY29uc3Qgc2VjdGlvbiBvZiBkYXRhKSB7XG4gICAgICBmb3IgKGNvbnN0IHAgb2Ygc2VjdGlvbi5waG90b3MpIHBob3RvSW5kZXguc2V0KHAuaWQsIHApXG4gICAgICBhbGxQaG90b3MudmFsdWUucHVzaCguLi5zZWN0aW9uLnBob3RvcylcbiAgICB9XG4gICAgcGhvdG9SZXYudmFsdWUrK1xuICAgIC8vIOmhuuW4puWIt+aWsOS+p+agj+WbuuWumumhueaxoOS4juW+veeroOiuoeaVsO+8iOacquWIhuexuy/mnIDov5Hmt7vliqAv5YWo6YOowrfmnKrmoIfnrb7Ct+acgOi/keafpeeci++8ie+8jFxuICAgIC8vIOmBv+WFjeWvvOWFpS/liKDpmaTlkI7orqHmlbDpmYjml6dcbiAgICB2b2lkIGxvYWRVbnNvcnRlZCgpXG4gICAgdm9pZCBsb2FkUmVjZW50KClcbiAgICB2b2lkIGxvYWRTaWRlYmFyQ291bnRzKClcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfliqDovb3lm77niYflpLHotKU6JywgZXJyb3IpXG4gICAgdG9hc3QuZXJyb3IoJ+WKoOi9veWbvueJh+Wksei0pScsIHsgZGVzY3JpcHRpb246IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSB9KVxuICB9IGZpbmFsbHkge1xuICAgIGxvYWRpbmcudmFsdWUgPSBmYWxzZVxuICB9XG59XG5cbi8qKiDlhajph4/ot6/lvoTor7fmsYLluo/lj7fvvIhsb2FkUGhvdG9zIOaXoOWcqOmjnuagh+iusO+8jOmYsui/h+acn+WTjeW6lOimhueblu+8iSAqL1xubGV0IGxvYWRGdWxsU2VxID0gMFxuXG5jb25zdCBsb2FkQWxidW1zID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGFsYnVtcy52YWx1ZSA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmxpc3RBbGJ1bXMoKVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+WKoOi9veebuOWGjOWksei0pTonLCBlcnJvcilcbiAgfVxufVxuXG5jb25zdCBsb2FkRm9sZGVycyA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBmb2xkZXJzLnZhbHVlID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MubGlzdFBob3RvRm9sZGVycygpXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign5Yqg6L295paH5Lu25aS55aSx6LSlOicsIGVycm9yKVxuICB9XG59XG5cbmNvbnN0IGxvYWRTbWFydEFsYnVtcyA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBzbWFydEFsYnVtcy52YWx1ZSA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmxpc3RTbWFydEFsYnVtcygpXG4gICAgYXdhaXQgbG9hZERpY3Rpb25hcnlUYWdzKClcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfliqDovb3mmbrog73mlofku7blpLnlpLHotKU6JywgZXJyb3IpXG4gIH1cbn1cblxuY29uc3QgbG9hZERpY3Rpb25hcnlUYWdzID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGRpY3Rpb25hcnlUYWdzLnZhbHVlID0gKGF3YWl0IHdpbmRvdy5hcGkudGFnLmdldFRhZ3MoKSkgYXMgVGFnU3VtbWFyeVtdXG4gIH0gY2F0Y2gge1xuICAgIGRpY3Rpb25hcnlUYWdzLnZhbHVlID0gW11cbiAgfVxufVxuXG4vLyDilIDilIAg5YiG6aG15YyW6Zi25q61IDHvvJrlm57mlLbnq5nnqpflj6Plj5bmlbDvvIhkb2NzL1BBR0lOQVRJT05fREVTSUdOLm1kIOmYtuautSAx77yJ4pSA4pSAXG4vLyDlm57mu5rlvIDlhbPvvJpsb2NhbFN0b3JhZ2Ug572uICdsZWFmOnVzZS1wYWdlZC10cmFzaCcgPSAnMCcg5Y2z5oGi5aSN5YWo6YeP6Lev5b6E44CCXG4vLyByZWN5Y2xlQmluUGhvdG9zIOivreS5ieS4jeWPmO+8iOS7jeaYr+OAjOW3suWKoOi9veeahOWbnuaUtuermee0oOadkOOAje+8ie+8jOWxleekuueuoee6v+mbtuaUueWKqO+8m1xuLy8g5beu5Yir5Y+q5Zyo5a6D5piv44CM5YmNIE4g6aG157Sv56ev44CN6ICM6Z2e5pW06KGo44CCXG5jb25zdCBQQUdFRF9UUkFTSF9LRVkgPSAnbGVhZjp1c2UtcGFnZWQtdHJhc2gnXG5jb25zdCBUUkFTSF9QQUdFX1NJWkUgPSAyMDBcbmNvbnN0IHRyYXNoQ3Vyc29yID0gcmVmPHN0cmluZyB8IG51bGw+KG51bGwpXG5jb25zdCB0cmFzaEhhc01vcmUgPSByZWYoZmFsc2UpXG5sZXQgdHJhc2hQYWdlSW5GbGlnaHQgPSBmYWxzZVxubGV0IHRyYXNoUGVuZGluZ1Jlc2V0ID0gZmFsc2VcblxuZnVuY3Rpb24gdXNlUGFnZWRUcmFzaCgpOiBib29sZWFuIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0oUEFHRURfVFJBU0hfS0VZKSAhPT0gJzAnXG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB0cnVlXG4gIH1cbn1cblxuY29uc3QgbG9hZFRyYXNoUGFnZSA9IGFzeW5jIChyZXNldDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBpZiAodHJhc2hQYWdlSW5GbGlnaHQpIHtcbiAgICBpZiAocmVzZXQpIHRyYXNoUGVuZGluZ1Jlc2V0ID0gdHJ1ZVxuICAgIHJldHVyblxuICB9XG4gIGlmICghcmVzZXQgJiYgIXRyYXNoSGFzTW9yZS52YWx1ZSkgcmV0dXJuXG4gIHRyYXNoUGFnZUluRmxpZ2h0ID0gdHJ1ZVxuICB0cnkge1xuICAgIGxldCBkb1Jlc2V0ID0gcmVzZXRcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgdHJhc2hQZW5kaW5nUmVzZXQgPSBmYWxzZVxuICAgICAgY29uc3QgcGFnZSA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmdldFBhZ2Uoe1xuICAgICAgICB2aWV3OiAndHJhc2gnLFxuICAgICAgICBzb3J0OiAnZGVsZXRlZF9hdCcsXG4gICAgICAgIGRlc2M6IHRydWUsXG4gICAgICAgIGN1cnNvcjogZG9SZXNldCA/IHVuZGVmaW5lZCA6ICh0cmFzaEN1cnNvci52YWx1ZSA/PyB1bmRlZmluZWQpLFxuICAgICAgICBsaW1pdDogVFJBU0hfUEFHRV9TSVpFXG4gICAgICB9KVxuICAgICAgaWYgKHRyYXNoUGVuZGluZ1Jlc2V0KSB7XG4gICAgICAgIGRvUmVzZXQgPSB0cnVlXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICByZWN5Y2xlQmluUGhvdG9zLnZhbHVlID0gZG9SZXNldCA/IHBhZ2UuaXRlbXMgOiBbLi4ucmVjeWNsZUJpblBob3Rvcy52YWx1ZSwgLi4ucGFnZS5pdGVtc11cbiAgICAgIHJlY3ljbGVDb3VudC52YWx1ZSA9IHBhZ2UudG90YWxcbiAgICAgIHRyYXNoQ3Vyc29yLnZhbHVlID0gcGFnZS5uZXh0Q3Vyc29yXG4gICAgICB0cmFzaEhhc01vcmUudmFsdWUgPSBwYWdlLm5leHRDdXJzb3IgIT09IG51bGxcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+WKoOi9veWbnuaUtuermeWksei0pTonLCBlcnJvcilcbiAgfSBmaW5hbGx5IHtcbiAgICB0cmFzaFBhZ2VJbkZsaWdodCA9IGZhbHNlXG4gIH1cbn1cblxuY29uc3QgbG9hZE1vcmVUcmFzaCA9ICgpOiB2b2lkID0+IHtcbiAgdm9pZCBsb2FkVHJhc2hQYWdlKGZhbHNlKVxufVxuXG4vLyDilIDilIAg5YiG6aG15YyW6Zi25q61IDLvvJrmlLbol48gLyDmlofku7blpLnop4blm77nqpflj6Plj5bmlbDvvIjkuI7lm57mlLbnq5nor5XngrnlkIzmqKHlvI/vvInilIDilIBcbi8vIOWbnua7muW8gOWFs++8mmxvY2FsU3RvcmFnZSDnva4gJ2xlYWY6dXNlLXBhZ2VkLWZhdm9yaXRlcycgLyAnbGVhZjp1c2UtcGFnZWQtZm9sZGVyJ1xuLy8gPSAnMCcg5Y2z5oGi5aSN5YWo6YeP6Lev5b6E44CCZm9sZGVyUGhvdG9zL2Zhdm9yaXRlc1Bob3RvcyDor63kuYnkuI3lj5jvvIjlt7LliqDovb3nqpflj6PvvInjgIJcbmNvbnN0IFBBR0VEX0ZBVk9SSVRFU19LRVkgPSAnbGVhZjp1c2UtcGFnZWQtZmF2b3JpdGVzJ1xuY29uc3QgUEFHRURfRk9MREVSX0tFWSA9ICdsZWFmOnVzZS1wYWdlZC1mb2xkZXInXG5jb25zdCBGQVZPUklURVNfUEFHRV9TSVpFID0gMjAwXG5jb25zdCBGT0xERVJfUEFHRV9TSVpFID0gMjAwXG5jb25zdCBmYXZvcml0ZXNDdXJzb3IgPSByZWY8c3RyaW5nIHwgbnVsbD4obnVsbClcbmNvbnN0IGZhdm9yaXRlc0hhc01vcmUgPSByZWYoZmFsc2UpXG5sZXQgZmF2b3JpdGVzUGFnZUluRmxpZ2h0ID0gZmFsc2VcbmxldCBmYXZvcml0ZXNQZW5kaW5nUmVzZXQgPSBmYWxzZVxuY29uc3QgZm9sZGVyQ3Vyc29yID0gcmVmPHN0cmluZyB8IG51bGw+KG51bGwpXG5jb25zdCBmb2xkZXJIYXNNb3JlID0gcmVmKGZhbHNlKVxubGV0IGZvbGRlclBhZ2VJbkZsaWdodCA9IGZhbHNlXG5sZXQgZm9sZGVyUGVuZGluZ1Jlc2V0ID0gZmFsc2Vcbi8qKiDlvZPliY3liIbpobXmlofku7blpLnvvIhyZWZyZXNoRm9sZGVyUGhvdG9zIOiusOW9le+8m2xvYWRNb3JlIOWkjeeUqO+8iSAqL1xubGV0IHBhZ2VkRm9sZGVySWQ6IHN0cmluZyB8IG51bGwgPSBudWxsXG5cbmZ1bmN0aW9uIHVzZVBhZ2VkRmF2b3JpdGVzKCk6IGJvb2xlYW4ge1xuICB0cnkge1xuICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShQQUdFRF9GQVZPUklURVNfS0VZKSAhPT0gJzAnXG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB0cnVlXG4gIH1cbn1cblxuZnVuY3Rpb24gdXNlUGFnZWRGb2xkZXIoKTogYm9vbGVhbiB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFBBR0VEX0ZPTERFUl9LRVkpICE9PSAnMCdcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHRydWVcbiAgfVxufVxuXG5jb25zdCBsb2FkRmF2b3JpdGVzUGFnZSA9IGFzeW5jIChyZXNldDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBpZiAoZmF2b3JpdGVzUGFnZUluRmxpZ2h0KSB7XG4gICAgaWYgKHJlc2V0KSBmYXZvcml0ZXNQZW5kaW5nUmVzZXQgPSB0cnVlXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKCFyZXNldCAmJiAhZmF2b3JpdGVzSGFzTW9yZS52YWx1ZSkgcmV0dXJuXG4gIGZhdm9yaXRlc1BhZ2VJbkZsaWdodCA9IHRydWVcbiAgdHJ5IHtcbiAgICBsZXQgZG9SZXNldCA9IHJlc2V0XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGZhdm9yaXRlc1BlbmRpbmdSZXNldCA9IGZhbHNlXG4gICAgICBjb25zdCBwYWdlID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MuZ2V0UGFnZSh7XG4gICAgICAgIHZpZXc6ICdmYXZvcml0ZXMnLFxuICAgICAgICBmaWx0ZXJzOiBwYWdlZEZpbHRlcnMsXG4gICAgICAgIHNvcnQ6ICdpbXBvcnRlZF9hdCcsXG4gICAgICAgIGRlc2M6IHRydWUsXG4gICAgICAgIGN1cnNvcjogZG9SZXNldCA/IHVuZGVmaW5lZCA6IChmYXZvcml0ZXNDdXJzb3IudmFsdWUgPz8gdW5kZWZpbmVkKSxcbiAgICAgICAgbGltaXQ6IEZBVk9SSVRFU19QQUdFX1NJWkVcbiAgICAgIH0pXG4gICAgICBpZiAoZmF2b3JpdGVzUGVuZGluZ1Jlc2V0KSB7XG4gICAgICAgIGRvUmVzZXQgPSB0cnVlXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBmYXZvcml0ZXNQaG90b3MudmFsdWUgPSBkb1Jlc2V0ID8gcGFnZS5pdGVtcyA6IFsuLi5mYXZvcml0ZXNQaG90b3MudmFsdWUsIC4uLnBhZ2UuaXRlbXNdXG4gICAgICBmYXZvcml0ZXNDdXJzb3IudmFsdWUgPSBwYWdlLm5leHRDdXJzb3JcbiAgICAgIGZhdm9yaXRlc0hhc01vcmUudmFsdWUgPSBwYWdlLm5leHRDdXJzb3IgIT09IG51bGxcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+WKoOi9veaUtuiXj+Wksei0pTonLCBlcnJvcilcbiAgfSBmaW5hbGx5IHtcbiAgICBmYXZvcml0ZXNQYWdlSW5GbGlnaHQgPSBmYWxzZVxuICB9XG59XG5cbmNvbnN0IGxvYWRNb3JlRmF2b3JpdGVzID0gKCk6IHZvaWQgPT4ge1xuICB2b2lkIGxvYWRGYXZvcml0ZXNQYWdlKGZhbHNlKVxufVxuXG5jb25zdCBsb2FkRm9sZGVyUGFnZSA9IGFzeW5jIChyZXNldDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBpZiAoZm9sZGVyUGFnZUluRmxpZ2h0KSB7XG4gICAgaWYgKHJlc2V0KSBmb2xkZXJQZW5kaW5nUmVzZXQgPSB0cnVlXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKCFwYWdlZEZvbGRlcklkKSByZXR1cm5cbiAgaWYgKCFyZXNldCAmJiAhZm9sZGVySGFzTW9yZS52YWx1ZSkgcmV0dXJuXG4gIGZvbGRlclBhZ2VJbkZsaWdodCA9IHRydWVcbiAgdHJ5IHtcbiAgICBsZXQgZG9SZXNldCA9IHJlc2V0XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGZvbGRlclBlbmRpbmdSZXNldCA9IGZhbHNlXG4gICAgICBjb25zdCBwYWdlID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MuZ2V0UGFnZSh7XG4gICAgICAgIHZpZXc6ICdmb2xkZXInLFxuICAgICAgICBmb2xkZXJJZDogcGFnZWRGb2xkZXJJZCxcbiAgICAgICAgZmlsdGVyczogcGFnZWRGaWx0ZXJzLFxuICAgICAgICBzb3J0OiAnaW1wb3J0ZWRfYXQnLFxuICAgICAgICBkZXNjOiB0cnVlLFxuICAgICAgICBjdXJzb3I6IGRvUmVzZXQgPyB1bmRlZmluZWQgOiAoZm9sZGVyQ3Vyc29yLnZhbHVlID8/IHVuZGVmaW5lZCksXG4gICAgICAgIGxpbWl0OiBGT0xERVJfUEFHRV9TSVpFXG4gICAgICB9KVxuICAgICAgaWYgKGZvbGRlclBlbmRpbmdSZXNldCkge1xuICAgICAgICBkb1Jlc2V0ID0gdHJ1ZVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgZm9sZGVyUGhvdG9zLnZhbHVlID0gZG9SZXNldCA/IHBhZ2UuaXRlbXMgOiBbLi4uZm9sZGVyUGhvdG9zLnZhbHVlLCAuLi5wYWdlLml0ZW1zXVxuICAgICAgZm9sZGVyQ3Vyc29yLnZhbHVlID0gcGFnZS5uZXh0Q3Vyc29yXG4gICAgICBmb2xkZXJIYXNNb3JlLnZhbHVlID0gcGFnZS5uZXh0Q3Vyc29yICE9PSBudWxsXG4gICAgICBicmVha1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfliqDovb3mlofku7blpLnlpLHotKU6JywgZXJyb3IpXG4gIH0gZmluYWxseSB7XG4gICAgZm9sZGVyUGFnZUluRmxpZ2h0ID0gZmFsc2VcbiAgfVxufVxuXG5jb25zdCBsb2FkTW9yZUZvbGRlciA9ICgpOiB2b2lkID0+IHtcbiAgdm9pZCBsb2FkRm9sZGVyUGFnZShmYWxzZSlcbn1cblxuLy8g4pSA4pSAIOWIhumhteWMlumYtuautSAz77ya5YWo5bGA5pCc57Si5rGg77yIRlRTL3Njb3BlIOS4i+aOqO+8m+WFs+mUruivjeaQnOe0oueahOWFqOWxgOivreS5ie+8ieKUgOKUgFxuLy8g5Zue5rua5byA5YWz77yabG9jYWxTdG9yYWdlIOe9riAnbGVhZjp1c2UtcGFnZWQtc2VhcmNoJyA9ICcwJyDljbPlm57pgIDlrqLmiLfnq6/nqpflj6Pov4fmu6TjgIJcbmNvbnN0IFBBR0VEX1NFQVJDSF9LRVkgPSAnbGVhZjp1c2UtcGFnZWQtc2VhcmNoJ1xuY29uc3QgU0VBUkNIX1BBR0VfU0laRSA9IDIwMFxuY29uc3Qgc2VhcmNoUG9vbFBob3RvcyA9IHJlZjxQaG90b1tdPihbXSlcbmNvbnN0IHNlYXJjaEN1cnNvciA9IHJlZjxzdHJpbmcgfCBudWxsPihudWxsKVxuY29uc3Qgc2VhcmNoSGFzTW9yZSA9IHJlZihmYWxzZSlcbmxldCBzZWFyY2hQYWdlSW5GbGlnaHQgPSBmYWxzZVxubGV0IHNlYXJjaFBlbmRpbmdSZXNldCA9IGZhbHNlXG4vKiog5b2T5YmN5rGg5a+55bqU55qE5pCc57Si6K+N77yIZGlzcGxheVNlY3Rpb25zIOagoemqjOaxoOS4juWFs+mUruivjeS4gOiHtOaJjei1sOacjeWKoeerr+axoO+8iSAqL1xuY29uc3Qgc2VhcmNoUG9vbFF1ZXJ5ID0gcmVmKCcnKVxuLyoqIOacgOi/keS4gOasoeaQnOe0oiBzcGVj77yIbG9hZE1vcmUvcmVmcmVzaCDlpI3nlKjvvIzpgb/lhY3nv7vpobXkuI7lr7zlhaXlkI7liLfmlrDkuKLnrZvpgInvvIkgKi9cbmxldCBsYXN0U2VhcmNoU3BlYzogU21hcnRBbGJ1bVJ1bGVzIHwgdW5kZWZpbmVkXG4vKiog5pyA6L+R5LiA5qyh5pCc57Si6K+N77ya5LiOIGxhc3RTZWFyY2hTcGVjIOWQjOaAp+i0qOKAlOKAlOWcqOmjnumHjeaUvuW/hemhu+WPluacgOaWsOWAvO+8jFxuICogIOWQpuWImeOAjOW/q+mAn+i/nuaJk+OAjeS8mueUqOesrOS4gOasoeeahCBxdWVyeS9zcGVjIOmHjei3ke+8jOacgOaWsOWFs+mUruivjeiiq+mdmem7mOS4ouW8gyAqL1xubGV0IGxhc3RTZWFyY2hRdWVyeSA9ICcnXG5cbmZ1bmN0aW9uIHVzZVBhZ2VkU2VhcmNoKCk6IGJvb2xlYW4ge1xuICB0cnkge1xuICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShQQUdFRF9TRUFSQ0hfS0VZKSAhPT0gJzAnXG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB0cnVlXG4gIH1cbn1cblxuLyoqIOWFqOWxgOaQnOe0ouWIhumhte+8mmZpbHRlcnMg5Li657u05bqmIHNwZWPvvIjlkKsgc2VhcmNoS2V5d29yZC9zZWFyY2hTY29wZXMvYWR2YW5jZWRBc3TvvIzkuIDlubbkuIvmjqjvvIkgKi9cbmNvbnN0IGxvYWRTZWFyY2hQYWdlID0gYXN5bmMgKFxuICByZXNldDogYm9vbGVhbixcbiAgcXVlcnk6IHN0cmluZyxcbiAgZmlsdGVycz86IFNtYXJ0QWxidW1SdWxlc1xuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGxhc3RTZWFyY2hRdWVyeSA9IHF1ZXJ5XG4gIGlmIChmaWx0ZXJzKSBsYXN0U2VhcmNoU3BlYyA9IGZpbHRlcnNcbiAgaWYgKHNlYXJjaFBhZ2VJbkZsaWdodCkge1xuICAgIC8vIOWcqOmjnuacn+mXtOeahOaWsOaQnOe0ou+8muiusOW9lSBzcGVjL+W+hemHjee9ru+8jOW9k+WJjeWTjeW6lOiQveWcsOWQjumHjei3ke+8iOS4jemdmem7mOS4ouW8g+OAgeS4jemUmemhte+8iVxuICAgIGlmIChyZXNldCkgc2VhcmNoUGVuZGluZ1Jlc2V0ID0gdHJ1ZVxuICAgIHJldHVyblxuICB9XG4gIGlmICghcmVzZXQgJiYgIXNlYXJjaEhhc01vcmUudmFsdWUpIHJldHVyblxuICAvLyByZXNldCDmnKrmmL7lvI/luKYgc3BlY++8iHJlZnJlc2hBbGxQb29scyDlnLrmma/vvInml7bmsr/nlKjkuIrkuIDmrKHnmoTvvIzkv53or4HliLfmlrDkuI3kuKLnrZvpgIlcbiAgc2VhcmNoUGFnZUluRmxpZ2h0ID0gdHJ1ZVxuICB0cnkge1xuICAgIGxldCBkb1Jlc2V0ID0gcmVzZXRcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgc2VhcmNoUGVuZGluZ1Jlc2V0ID0gZmFsc2VcbiAgICAgIGNvbnN0IHBhZ2UgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5nZXRQYWdlKHtcbiAgICAgICAgdmlldzogJ3NlYXJjaCcsXG4gICAgICAgIHF1ZXJ5OiBsYXN0U2VhcmNoUXVlcnksXG4gICAgICAgIGZpbHRlcnM6IGxhc3RTZWFyY2hTcGVjIGFzIG5ldmVyLFxuICAgICAgICBzb3J0OiAnaW1wb3J0ZWQnLFxuICAgICAgICBkZXNjOiB0cnVlLFxuICAgICAgICBjdXJzb3I6IGRvUmVzZXQgPyB1bmRlZmluZWQgOiAoc2VhcmNoQ3Vyc29yLnZhbHVlID8/IHVuZGVmaW5lZCksXG4gICAgICAgIGxpbWl0OiBTRUFSQ0hfUEFHRV9TSVpFXG4gICAgICB9KVxuICAgICAgaWYgKHNlYXJjaFBlbmRpbmdSZXNldCkge1xuICAgICAgICBkb1Jlc2V0ID0gdHJ1ZVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgc2VhcmNoUG9vbFBob3Rvcy52YWx1ZSA9IGRvUmVzZXQgPyBwYWdlLml0ZW1zIDogWy4uLnNlYXJjaFBvb2xQaG90b3MudmFsdWUsIC4uLnBhZ2UuaXRlbXNdXG4gICAgICBzZWFyY2hDdXJzb3IudmFsdWUgPSBwYWdlLm5leHRDdXJzb3JcbiAgICAgIHNlYXJjaEhhc01vcmUudmFsdWUgPSBwYWdlLm5leHRDdXJzb3IgIT09IG51bGxcbiAgICAgIHNlYXJjaFBvb2xRdWVyeS52YWx1ZSA9IGxhc3RTZWFyY2hRdWVyeVxuICAgICAgYnJlYWtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign5pCc57Si5aSx6LSlOicsIGVycm9yKVxuICB9IGZpbmFsbHkge1xuICAgIHNlYXJjaFBhZ2VJbkZsaWdodCA9IGZhbHNlXG4gIH1cbn1cblxuY29uc3QgbG9hZE1vcmVTZWFyY2ggPSAoKTogdm9pZCA9PiB7XG4gIHZvaWQgbG9hZFNlYXJjaFBhZ2UoZmFsc2UsIHNlYXJjaFBvb2xRdWVyeS52YWx1ZSlcbn1cblxuY29uc3QgbG9hZFJlY3ljbGVCaW4gPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIHRyeSB7XG4gICAgaWYgKHVzZVBhZ2VkVHJhc2goKSkge1xuICAgICAgYXdhaXQgbG9hZFRyYXNoUGFnZSh0cnVlKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHJlY3ljbGVCaW5QaG90b3MudmFsdWUgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5nZXRSZWN5Y2xlQmluKClcbiAgICByZWN5Y2xlQ291bnQudmFsdWUgPSByZWN5Y2xlQmluUGhvdG9zLnZhbHVlLmxlbmd0aFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+WKoOi9veWbnuaUtuermeWksei0pTonLCBlcnJvcilcbiAgfVxufVxuXG5jb25zdCByZWZyZXNoQWxidW1QaG90b3MgPSBhc3luYyAoYWxidW1JZDogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBpZiAoIWFsYnVtSWQpIHJldHVyblxuICB0cnkge1xuICAgIGFsYnVtUGhvdG9zLnZhbHVlID0gYXdhaXQgd2luZG93LmFwaS5waG90b3MuZ2V0QWxidW1QaG90b3MoYWxidW1JZClcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfliqDovb3nm7jlhozlhoXlrrnlpLHotKU6JywgZXJyb3IpXG4gIH1cbn1cblxuY29uc3QgcmVmcmVzaEZvbGRlclBob3RvcyA9IGFzeW5jIChmb2xkZXJJZDogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBpZiAoIWZvbGRlcklkKSByZXR1cm5cbiAgcGFnZWRGb2xkZXJJZCA9IGZvbGRlcklkXG4gIGlmICh1c2VQYWdlZEZvbGRlcigpKSB7XG4gICAgYXdhaXQgbG9hZEZvbGRlclBhZ2UodHJ1ZSlcbiAgICByZXR1cm5cbiAgfVxuICB0cnkge1xuICAgIGZvbGRlclBob3Rvcy52YWx1ZSA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmdldEZvbGRlclBob3Rvcyhmb2xkZXJJZClcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfliqDovb3mlofku7blpLnlhoXlrrnlpLHotKU6JywgZXJyb3IpXG4gIH1cbn1cblxuY29uc3QgcmVmcmVzaFNtYXJ0QWxidW1QaG90b3MgPSBhc3luYyAoc21hcnRJZDogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBpZiAoIXNtYXJ0SWQpIHJldHVyblxuICB0cnkge1xuICAgIHNtYXJ0QWxidW1QaG90b3MudmFsdWUgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5nZXRTbWFydEFsYnVtUGhvdG9zKHNtYXJ0SWQpXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign5Yqg6L295pm66IO95paH5Lu25aS55YaF5a655aSx6LSlOicsIGVycm9yKVxuICB9XG59XG5cbmNvbnN0IGxvYWRVbnNvcnRlZCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICB1bnNvcnRlZFBob3Rvcy52YWx1ZSA9IGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLmdldFVuc29ydGVkKClcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfliqDovb3mnKrliIbnsbvlpLHotKU6JywgZXJyb3IpXG4gIH1cbn1cblxuY29uc3QgbG9hZFJlY2VudCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICByZWNlbnRQaG90b3MudmFsdWUgPSBhd2FpdCB3aW5kb3cuYXBpLnBob3Rvcy5nZXRSZWNlbnQoKVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+WKoOi9veacgOi/kea3u+WKoOWksei0pTonLCBlcnJvcilcbiAgfVxufVxuXG4vKiog5bm25Y+R5Yi35paw5YWo5bqT55u45YWz5rGg77yI5a+85YWlL+aJuemHj+aTjeS9nOWQjumBv+WFjeWkmuasoeS4suihjOaVtOW6k+aLieWPlu+8ieOAglxuICogIOWQq+agh+etvuWtl+WFuO+8muaIquWbvuWvvOWFpeetieWcuuaZr+S8mue7mee0oOadkOaJk+S4iuaWsOagh+etvu+8iOWmgummluW8oOOAjOaIquWbvuOAje+8ie+8jFxuICogIOS4jeWIt+aWsOWtl+WFuOeahOivnei/h+a7pOmdouadvy/moIfnrb7nrqHnkIbnnIvkuI3liLDmlrDmoIfnrb7jgIIgKi9cbmNvbnN0IHJlZnJlc2hBbGxQb29scyA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgIGxvYWRQaG90b3MoKSxcbiAgICBsb2FkVW5zb3J0ZWQoKSxcbiAgICBsb2FkUmVjZW50KCksXG4gICAgbG9hZFJlY2VudFZpZXdlZCgpLFxuICAgIGxvYWREaWN0aW9uYXJ5VGFncygpLFxuICAgIC8vIOWIhumhteaxoOS/nea0u++8muWvueW6lOinhuWbvua/gOa0u+i/h+WwseWIt+aWsOWFtueql+WPo++8iOWvvOWFpS/liKDpmaTlkI7lhoXlrrnkuI3pmYjml6fvvIlcbiAgICAuLi4odXNlUGFnZWRGYXZvcml0ZXMoKSA/IFtsb2FkRmF2b3JpdGVzUGFnZSh0cnVlKV0gOiBbXSksXG4gICAgLi4uKHBhZ2VkRm9sZGVySWQgJiYgdXNlUGFnZWRGb2xkZXIoKSA/IFtsb2FkRm9sZGVyUGFnZSh0cnVlKV0gOiBbXSksXG4gICAgLy8g5YWo5bGA5pCc57Si5rGg77ya5pyJ5rS75Yqo5pCc57Si6K+N5pe26YeN5Yi377yI5a+85YWlL+WIoOmZpOWQjue7k+aenOS4jemZiOaXp++8iVxuICAgIC4uLihzZWFyY2hQb29sUXVlcnkudmFsdWUgPyBbbG9hZFNlYXJjaFBhZ2UodHJ1ZSwgc2VhcmNoUG9vbFF1ZXJ5LnZhbHVlKV0gOiBbXSlcbiAgXSlcbn1cblxuLyoqIMKnMyBMNCAvIMKnMi5CIOaJk+W8gOe0oOadkC/op4blm77ml7borrDlvZXmn6XnnIvml7bpl7TvvIzpqbHliqjjgIzmnIDov5Hmn6XnnIvjgI0gKi9cbmNvbnN0IHNldExhc3RWaWV3ZWQgPSBhc3luYyAoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGF3YWl0IHdpbmRvdy5hcGkucGhvdG9zLnNldExhc3RWaWV3ZWQoaWQpXG4gICAgLy8g5ZCM5q2l5pys5Zyw57yT5a2Y77yI5Y2h54mH5LiK55qE44CM5pyA6L+R5p+l55yL44CN5a2X5q6177yJ77yM5rGg5pS55Li65oyJIFNRTCDph43lj5ZcbiAgICBjb25zdCBwID0gYWxsUGhvdG9zLnZhbHVlLmZpbmQoKHgpID0+IHguaWQgPT09IGlkKVxuICAgIGlmIChwKSBwLmxhc3RWaWV3ZWRBdCA9IERhdGUubm93KClcbiAgICB2b2lkIGxvYWRSZWNlbnRWaWV3ZWQoKVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+iusOW9leafpeeci+aXtumXtOWksei0pTonLCBlcnJvcilcbiAgfVxufVxuXG4vKiog5Y2V5byg5bCx5Zyw5pu/5o2i77yI57yp55Wl5Zu+L0VYSUYg5Zue5aGr44CB5pS26JePL+ivhOWIhi/moIfnrb7nrYnlop7ph4/mm7TmlrDvvIkgKi9cbmZ1bmN0aW9uIHJlcGxhY2VQaG90b0xvY2FsKHVwZGF0ZWQ6IFBob3RvKTogdm9pZCB7XG4gIHBob3RvSW5kZXguc2V0KHVwZGF0ZWQuaWQsIHVwZGF0ZWQpXG4gIGNvbnN0IHJlcGxhY2VJbiA9IChsaXN0OiBQaG90b1tdKTogdm9pZCA9PiB7XG4gICAgY29uc3QgaSA9IGxpc3QuZmluZEluZGV4KChwKSA9PiBwLmlkID09PSB1cGRhdGVkLmlkKVxuICAgIGlmIChpID49IDApIGxpc3Quc3BsaWNlKGksIDEsIHVwZGF0ZWQpXG4gIH1cbiAgcmVwbGFjZUluKGFsbFBob3Rvcy52YWx1ZSlcbiAgcmVwbGFjZUluKGFsYnVtUGhvdG9zLnZhbHVlKVxuICByZXBsYWNlSW4oZm9sZGVyUGhvdG9zLnZhbHVlKVxuICByZXBsYWNlSW4oc21hcnRBbGJ1bVBob3Rvcy52YWx1ZSlcbiAgcmVwbGFjZUluKHJlY3ljbGVCaW5QaG90b3MudmFsdWUpXG4gIC8vIOWIhumhteeql+WPo+axoOWQjOatpeabv+aNou+8jOWQpuWImeaUtuiXjy/mkJzntKIv5Zu65a6a5YWl5Y+j6KeG5Zu+6YeM5Y2h54mH54q25oCB6ZmI5pen77yI5a6h5p+lIFAyLTE577yJXG4gIHJlcGxhY2VJbihmYXZvcml0ZXNQaG90b3MudmFsdWUpXG4gIHJlcGxhY2VJbihzZWFyY2hQb29sUGhvdG9zLnZhbHVlKVxuICByZXBsYWNlSW4odW5zb3J0ZWRQaG90b3MudmFsdWUpXG4gIHJlcGxhY2VJbihyZWNlbnRQaG90b3MudmFsdWUpXG4gIGZvciAoY29uc3Qgc2VjdGlvbiBvZiBzZWN0aW9ucy52YWx1ZSkgcmVwbGFjZUluKHNlY3Rpb24ucGhvdG9zKVxuICBwaG90b1Jldi52YWx1ZSsrXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1c2VQaG90b0RhdGEoKToge1xuICBsb2FkaW5nOiB0eXBlb2YgbG9hZGluZ1xuICBzZWN0aW9uczogdHlwZW9mIHNlY3Rpb25zXG4gIGFsbFBob3RvczogdHlwZW9mIGFsbFBob3Rvc1xuICBzbWFydEFsYnVtczogdHlwZW9mIHNtYXJ0QWxidW1zXG4gIGFsYnVtczogdHlwZW9mIGFsYnVtc1xuICBmb2xkZXJzOiB0eXBlb2YgZm9sZGVyc1xuICBkaWN0aW9uYXJ5VGFnczogdHlwZW9mIGRpY3Rpb25hcnlUYWdzXG4gIHJlY3ljbGVCaW5QaG90b3M6IHR5cGVvZiByZWN5Y2xlQmluUGhvdG9zXG4gIHJlY3ljbGVDb3VudDogdHlwZW9mIHJlY3ljbGVDb3VudFxuICBwcm9jZXNzaW5nOiB0eXBlb2YgcHJvY2Vzc2luZ1xuICBhbGJ1bVBob3RvczogdHlwZW9mIGFsYnVtUGhvdG9zXG4gIGZvbGRlclBob3RvczogdHlwZW9mIGZvbGRlclBob3Rvc1xuICBzbWFydEFsYnVtUGhvdG9zOiB0eXBlb2Ygc21hcnRBbGJ1bVBob3Rvc1xuICB1bnNvcnRlZFBob3RvczogdHlwZW9mIHVuc29ydGVkUGhvdG9zXG4gIHJlY2VudFBob3RvczogdHlwZW9mIHJlY2VudFBob3Rvc1xuICByZWNlbnRWaWV3ZWRQaG90b3M6IHR5cGVvZiByZWNlbnRWaWV3ZWRQaG90b3NcbiAgLyoqIOS+p+agj+W+veeroO+8iOWFqOmDqC/mnKrmoIfnrb4v5pyA6L+R5p+l55yL77yJ77yaU1FMIOiBmuWQiO+8jOS4jeWPl+WIhumhteeql+WPo+W9seWTjSAqL1xuICBzaWRlYmFyQ291bnRzOiB0eXBlb2Ygc2lkZWJhckNvdW50c1xuICBsb2FkUGhvdG9zOiB0eXBlb2YgbG9hZFBob3Rvc1xuICBsb2FkQWxidW1zOiB0eXBlb2YgbG9hZEFsYnVtc1xuICBsb2FkRm9sZGVyczogdHlwZW9mIGxvYWRGb2xkZXJzXG4gIGxvYWRTbWFydEFsYnVtczogdHlwZW9mIGxvYWRTbWFydEFsYnVtc1xuICBsb2FkRGljdGlvbmFyeVRhZ3M6IHR5cGVvZiBsb2FkRGljdGlvbmFyeVRhZ3NcbiAgbG9hZFJlY3ljbGVCaW46IHR5cGVvZiBsb2FkUmVjeWNsZUJpblxuICAvKiog5YiG6aG15YyW6Zi25q61IDHvvJrlm57mlLbnq5nnqpflj6Plj5bmlbAgKi9cbiAgbG9hZE1vcmVUcmFzaDogdHlwZW9mIGxvYWRNb3JlVHJhc2hcbiAgdHJhc2hIYXNNb3JlOiB0eXBlb2YgdHJhc2hIYXNNb3JlXG4gIC8qKiDliIbpobXljJbpmLbmrrUgMu+8muaUtuiXjyAvIOaWh+S7tuWkueeql+WPo+WPluaVsCAqL1xuICBmYXZvcml0ZXNQaG90b3M6IHR5cGVvZiBmYXZvcml0ZXNQaG90b3NcbiAgZmF2b3JpdGVzSGFzTW9yZTogdHlwZW9mIGZhdm9yaXRlc0hhc01vcmVcbiAgbG9hZE1vcmVGYXZvcml0ZXM6IHR5cGVvZiBsb2FkTW9yZUZhdm9yaXRlc1xuICBsb2FkRmF2b3JpdGVzUGFnZTogdHlwZW9mIGxvYWRGYXZvcml0ZXNQYWdlXG4gIHVzZVBhZ2VkRmF2b3JpdGVzOiB0eXBlb2YgdXNlUGFnZWRGYXZvcml0ZXNcbiAgZm9sZGVySGFzTW9yZTogdHlwZW9mIGZvbGRlckhhc01vcmVcbiAgbG9hZE1vcmVGb2xkZXI6IHR5cGVvZiBsb2FkTW9yZUZvbGRlclxuICBsb2FkRm9sZGVyUGFnZTogdHlwZW9mIGxvYWRGb2xkZXJQYWdlXG4gIHVzZVBhZ2VkRm9sZGVyOiB0eXBlb2YgdXNlUGFnZWRGb2xkZXJcbiAgc2VhcmNoUG9vbFBob3RvczogdHlwZW9mIHNlYXJjaFBvb2xQaG90b3NcbiAgc2VhcmNoSGFzTW9yZTogdHlwZW9mIHNlYXJjaEhhc01vcmVcbiAgc2VhcmNoUG9vbFF1ZXJ5OiB0eXBlb2Ygc2VhcmNoUG9vbFF1ZXJ5XG4gIGxvYWRTZWFyY2hQYWdlOiB0eXBlb2YgbG9hZFNlYXJjaFBhZ2VcbiAgbG9hZE1vcmVTZWFyY2g6IHR5cGVvZiBsb2FkTW9yZVNlYXJjaFxuICB1c2VQYWdlZFNlYXJjaDogdHlwZW9mIHVzZVBhZ2VkU2VhcmNoXG4gIC8qKiDliIbpobXljJbpmLbmrrUgMu+8muS4u+inhuWbvueql+WPo+WPluaVsO+8iOmXqOaOp+a3t+WQiO+8jOingSBsb2FkUGhvdG9zIOazqOmHiu+8iSAqL1xuICBsb2FkTW9yZU1haW46IHR5cGVvZiBsb2FkTW9yZU1haW5cbiAgbWFpbkhhc01vcmU6IHR5cGVvZiBtYWluSGFzTW9yZVxuICByZWdpc3Rlck1haW5QYWdlR2F0ZTogdHlwZW9mIHJlZ2lzdGVyTWFpblBhZ2VHYXRlXG4gIHNldFBhZ2VkRmlsdGVyczogdHlwZW9mIHNldFBhZ2VkRmlsdGVyc1xuICBtYWluUGFnZWRBY3RpdmU6IHR5cGVvZiBtYWluUGFnZWRBY3RpdmVcbiAgcmVmcmVzaEFsYnVtUGhvdG9zOiB0eXBlb2YgcmVmcmVzaEFsYnVtUGhvdG9zXG4gIHJlZnJlc2hGb2xkZXJQaG90b3M6IHR5cGVvZiByZWZyZXNoRm9sZGVyUGhvdG9zXG4gIHJlZnJlc2hTbWFydEFsYnVtUGhvdG9zOiB0eXBlb2YgcmVmcmVzaFNtYXJ0QWxidW1QaG90b3NcbiAgbG9hZFVuc29ydGVkOiB0eXBlb2YgbG9hZFVuc29ydGVkXG4gIGxvYWRSZWNlbnQ6IHR5cGVvZiBsb2FkUmVjZW50XG4gIHJlZnJlc2hBbGxQb29sczogdHlwZW9mIHJlZnJlc2hBbGxQb29sc1xuICBzZXRMYXN0Vmlld2VkOiB0eXBlb2Ygc2V0TGFzdFZpZXdlZFxuICByZXBsYWNlUGhvdG9Mb2NhbDogdHlwZW9mIHJlcGxhY2VQaG90b0xvY2FsXG4gIC8qKiDku6PnoIHlrqHmn6UgUDAtMTHvvJpPKDEpIOaMiSBpZCDmibnph4/mn6XntKDmnZDvvIhNYXAg57Si5byV77yJICovXG4gIGJ5SWRzOiB0eXBlb2YgYnlJZHNcbiAgbGl2ZVBob3RvOiB0eXBlb2YgbGl2ZVBob3RvXG59IHtcbiAgcmV0dXJuIHtcbiAgICBsb2FkaW5nLFxuICAgIHNlY3Rpb25zLFxuICAgIGFsbFBob3RvcyxcbiAgICBzbWFydEFsYnVtcyxcbiAgICBhbGJ1bXMsXG4gICAgZm9sZGVycyxcbiAgICBkaWN0aW9uYXJ5VGFncyxcbiAgICByZWN5Y2xlQmluUGhvdG9zLFxuICAgIHJlY3ljbGVDb3VudCxcbiAgICBwcm9jZXNzaW5nLFxuICAgIGFsYnVtUGhvdG9zLFxuICAgIGZvbGRlclBob3RvcyxcbiAgICBzbWFydEFsYnVtUGhvdG9zLFxuICAgIHVuc29ydGVkUGhvdG9zLFxuICAgIHJlY2VudFBob3RvcyxcbiAgICByZWNlbnRWaWV3ZWRQaG90b3MsXG4gICAgc2lkZWJhckNvdW50cyxcbiAgICBsb2FkUGhvdG9zLFxuICAgIGxvYWRBbGJ1bXMsXG4gICAgbG9hZEZvbGRlcnMsXG4gICAgbG9hZFNtYXJ0QWxidW1zLFxuICAgIGxvYWREaWN0aW9uYXJ5VGFncyxcbiAgICBsb2FkUmVjeWNsZUJpbixcbiAgICBsb2FkTW9yZVRyYXNoLFxuICAgIHRyYXNoSGFzTW9yZSxcbiAgICBmYXZvcml0ZXNQaG90b3MsXG4gICAgZmF2b3JpdGVzSGFzTW9yZSxcbiAgICBsb2FkTW9yZUZhdm9yaXRlcyxcbiAgICBsb2FkRmF2b3JpdGVzUGFnZSxcbiAgICB1c2VQYWdlZEZhdm9yaXRlcyxcbiAgICBmb2xkZXJIYXNNb3JlLFxuICAgIGxvYWRNb3JlRm9sZGVyLFxuICAgIGxvYWRGb2xkZXJQYWdlLFxuICAgIHVzZVBhZ2VkRm9sZGVyLFxuICAgIHNlYXJjaFBvb2xQaG90b3MsXG4gICAgc2VhcmNoSGFzTW9yZSxcbiAgICBzZWFyY2hQb29sUXVlcnksXG4gICAgbG9hZFNlYXJjaFBhZ2UsXG4gICAgbG9hZE1vcmVTZWFyY2gsXG4gICAgdXNlUGFnZWRTZWFyY2gsXG4gICAgbG9hZE1vcmVNYWluLFxuICAgIG1haW5IYXNNb3JlLFxuICAgIHJlZ2lzdGVyTWFpblBhZ2VHYXRlLFxuICAgIHNldFBhZ2VkRmlsdGVycyxcbiAgICBtYWluUGFnZWRBY3RpdmUsXG4gICAgcmVmcmVzaEFsYnVtUGhvdG9zLFxuICAgIHJlZnJlc2hGb2xkZXJQaG90b3MsXG4gICAgcmVmcmVzaFNtYXJ0QWxidW1QaG90b3MsXG4gICAgbG9hZFVuc29ydGVkLFxuICAgIGxvYWRSZWNlbnQsXG4gICAgcmVmcmVzaEFsbFBvb2xzLFxuICAgIHNldExhc3RWaWV3ZWQsXG4gICAgcmVwbGFjZVBob3RvTG9jYWwsXG4gICAgYnlJZHMsXG4gICAgbGl2ZVBob3RvXG4gIH1cbn1cblxuLyoqXG4gKiDlkI7lj7DlpITnkIbov5vluqborqLpmIXvvIjluYLnrYnvvJrku4XpppbmrKHosIPnlKjml7bmjILnm5HlkKzvvIzov5Tlm57op6Pnu5Hlh73mlbDvvInjgIJcbiAqIOaooeWdl+WNleS+i+S4i+Wkmuasoee7hOS7tuaMgui9veS4jeS8mumHjeWkjeazqOWGjOOAglxuICovXG5sZXQgb2ZmUHJvY2Vzc2luZzogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGxcbmxldCBwcm9jZXNzaW5nUmVzZXRUaW1lcjogbnVtYmVyIHwgdW5kZWZpbmVkXG5cbmV4cG9ydCBmdW5jdGlvbiBiaW5kUHJvY2Vzc2luZ1Byb2dyZXNzKCk6ICgpID0+IHZvaWQge1xuICBpZiAob2ZmUHJvY2Vzc2luZykgcmV0dXJuIG9mZlByb2Nlc3NpbmdcbiAgb2ZmUHJvY2Vzc2luZyA9IHdpbmRvdy5hcGkucGhvdG9zLm9uUHJvY2Vzc2luZygocHJvZ3Jlc3MpID0+IHtcbiAgICBwcm9jZXNzaW5nLnZhbHVlID0gcHJvZ3Jlc3NcbiAgICBpZiAocHJvZ3Jlc3Muc3RhdHVzID09PSAnZG9uZScpIHtcbiAgICAgIHZvaWQgd2luZG93LmFwaS5waG90b3MuZ2V0QnlJZChwcm9ncmVzcy5waG90b0lkKS50aGVuKCh1cGRhdGVkKSA9PiB7XG4gICAgICAgIGlmICh1cGRhdGVkKSByZXBsYWNlUGhvdG9Mb2NhbCh1cGRhdGVkKVxuICAgICAgfSlcbiAgICB9XG4gICAgaWYgKHByb2dyZXNzLmRvbmUgPj0gcHJvZ3Jlc3MudG90YWwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQocHJvY2Vzc2luZ1Jlc2V0VGltZXIpXG4gICAgICBwcm9jZXNzaW5nUmVzZXRUaW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgcHJvY2Vzc2luZy52YWx1ZSA9IG51bGxcbiAgICAgIH0sIDE1MDApXG4gICAgfVxuICB9KVxuICByZXR1cm4gKCkgPT4ge1xuICAgIG9mZlByb2Nlc3Npbmc/LigpXG4gICAgb2ZmUHJvY2Vzc2luZyA9IG51bGxcbiAgfVxufVxuXG4vKiog6KeG5Zu+5YiH5o2iIOKGkiDmjInpnIDliLfmlrDlhoXlrrnmsaDvvIjluYLnrYnlronoo4XvvIzov5Tlm57op6Pnu5Hlh73mlbDvvIkgKi9cbmxldCBvZmZWaWV3V2F0Y2hlcjogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGxcbmV4cG9ydCBmdW5jdGlvbiBiaW5kVmlld1dhdGNoZXIoKTogKCkgPT4gdm9pZCB7XG4gIC8vIOS7o+eggeWuoeafpSBQMe+8muW5guetieWuiOWNq+KAlOKAlOaXp+WunueOsOazqOmHiuWGmeOAjOW5guetieOAjeS9huaXoCBndWFyZO+8jFxuICAvLyDlpJrmrKHnu4Tku7bmjILovb0vSE1SIOS8mumHjeWkjeaWsOW7uiB3YXRjaO+8jOmHjeWkjeinpuWPkSBJUEMg5Yi35pawXG4gIGlmIChvZmZWaWV3V2F0Y2hlcikgcmV0dXJuIG9mZlZpZXdXYXRjaGVyXG4gIGNvbnN0IHRhYnMgPSB1c2VMaWJyYXJ5VGFicygpXG4gIGNvbnN0IHN0b3AgPSB3YXRjaChcbiAgICAoKSA9PiB0YWJzLmFjdGl2ZVZpZXcsXG4gICAgKHZpZXcpID0+IHtcbiAgICAgIGlmICh2aWV3ID09PSAndHJhc2gnKSB7XG4gICAgICAgIHZvaWQgbG9hZFJlY3ljbGVCaW4oKVxuICAgICAgfSBlbHNlIGlmICh2aWV3ID09PSAnZmF2b3JpdGVzJykge1xuICAgICAgICBpZiAodXNlUGFnZWRGYXZvcml0ZXMoKSkgdm9pZCBsb2FkRmF2b3JpdGVzUGFnZSh0cnVlKVxuICAgICAgfSBlbHNlIGlmICh2aWV3LnN0YXJ0c1dpdGgoJ3NtYXJ0OicpKSB7XG4gICAgICAgIHZvaWQgcmVmcmVzaFNtYXJ0QWxidW1QaG90b3Modmlldy5zbGljZSg2KSlcbiAgICAgIH0gZWxzZSBpZiAodmlldy5zdGFydHNXaXRoKCdhbGJ1bTonKSkge1xuICAgICAgICB2b2lkIHJlZnJlc2hBbGJ1bVBob3Rvcyh2aWV3LnNsaWNlKDYpKVxuICAgICAgfSBlbHNlIGlmICh2aWV3LnN0YXJ0c1dpdGgoJ2ZvbGRlcjonKSkge1xuICAgICAgICB2b2lkIHJlZnJlc2hGb2xkZXJQaG90b3Modmlldy5zbGljZSg3KSlcbiAgICAgIH0gZWxzZSBpZiAodmlldyA9PT0gJ3Vuc29ydGVkJykge1xuICAgICAgICB2b2lkIGxvYWRVbnNvcnRlZCgpXG4gICAgICB9IGVsc2UgaWYgKHZpZXcgPT09ICdyZWNlbnQnKSB7XG4gICAgICAgIHZvaWQgbG9hZFJlY2VudCgpXG4gICAgICB9IGVsc2UgaWYgKHZpZXcgPT09ICdyZWNlbnRzJykge1xuICAgICAgICB2b2lkIGxvYWRSZWNlbnRWaWV3ZWQoKVxuICAgICAgfVxuICAgIH0sXG4gICAgeyBpbW1lZGlhdGU6IHRydWUgfVxuICApXG4gIG9mZlZpZXdXYXRjaGVyID0gc3RvcFxuICByZXR1cm4gKCkgPT4ge1xuICAgIC8vIOW/hemhu+a4heagh+W/l++8muWQpuWImSBwaG90b3Mg6KeG5Zu+5Y246L295ZCO77yI5Y676K6+572uL+agh+etvumhteWGjeWbnuadpe+8ieWuiOWNq+aBkuecn++8jFxuICAgIC8vIHdhdGNoIOS4jeWGjemHjeW7uu+8jOWIh+aWh+S7tuWkuS/nm7jlhowv5Zue5pS256uZ5pe25YaF5a655rGg5YWo6YOo5YGc5q2i5Yi35pawXG4gICAgc3RvcCgpXG4gICAgb2ZmVmlld1dhdGNoZXIgPSBudWxsXG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6IkFBT0EsU0FBUyxLQUFLLGFBQWE7QUFVM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSxRQUFRLFNBQVM7QUFFdkIsTUFBTSxVQUFVLElBQUksS0FBSztBQUN6QixNQUFNLFdBQVcsSUFBb0IsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sWUFBWSxJQUFhLENBQUMsQ0FBQztBQUNqQyxNQUFNLGNBQWMsSUFBa0IsQ0FBQyxDQUFDO0FBQ3hDLE1BQU0sU0FBUyxJQUFhLENBQUMsQ0FBQztBQUM5QixNQUFNLFVBQVUsSUFBbUIsQ0FBQyxDQUFDO0FBQ3JDLE1BQU0saUJBQWlCLElBQWtCLENBQUMsQ0FBQztBQUMzQyxNQUFNLG1CQUFtQixJQUFhLENBQUMsQ0FBQztBQUN4QyxNQUFNLGVBQWUsSUFBSSxDQUFDO0FBQzFCLE1BQU0sYUFBYSxJQUErQixJQUFJO0FBUXRELE1BQU0sYUFBYSxvQkFBSSxJQUFtQjtBQU8xQyxNQUFNLFdBQVcsSUFBSSxDQUFDO0FBR3RCLFNBQVMsVUFBVSxJQUErQjtBQUNoRCxPQUFLLFNBQVM7QUFDZCxTQUFPLFdBQVcsSUFBSSxFQUFFO0FBQzFCO0FBR0EsU0FBUyxNQUFNLEtBQXdCO0FBQ3JDLFFBQU0sTUFBZSxDQUFDO0FBQ3RCLE1BQUksVUFBVTtBQUNkLGFBQVcsTUFBTSxLQUFLO0FBQ3BCLFVBQU0sSUFBSSxXQUFXLElBQUksRUFBRTtBQUMzQixRQUFJLEVBQUcsS0FBSSxLQUFLLENBQUM7QUFBQSxRQUNaLFdBQVU7QUFBQSxFQUNqQjtBQUNBLE1BQUksQ0FBQyxRQUFTLFFBQU87QUFHckIs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