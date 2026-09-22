/* 2026-09-22 由 dev-server 缓存的编译产物机械还原：非原始源码，类型标注已被 esbuild 剥除，
   import 说明符已尽量改回裸包名。过了 node --check 语法校验，未做运行验证。 */
import { computed, ref, watch } from "vue";
import { hueBucketOf } from "/src/utils/photoColor.ts";
import { accuracyToMaxDelta, colorListCloseTo } from "/src/shared/colorMatch.ts";
import {
  useLibraryTabs
} from "/src/stores/libraryTabs.ts";
import { usePhotoData } from "/src/views/photos/composables/usePhotoData.ts";
import { searchMatch } from "/src/views/photos/composables/useAdvancedSearch.ts?t=1789945171666";
import { useQueryWords } from "/src/views/photos/composables/useQueryWords.ts?t=1789945259796";
import { useSearchScopes } from "/src/views/photos/constants/searchScopes.ts";
import { buildFiltersSpec, buildSearchSpec, RESOLUTION_MIN } from "/src/views/photos/composables/usePhotoFilterSpec.ts?t=1789949142955";
const DAY_MS = 864e5;
let cachedDayKey = -1;
let cachedTodayStart = 0;
function todayStart() {
  const dayKey = Math.floor(Date.now() / DAY_MS);
  if (dayKey !== cachedDayKey) {
    cachedDayKey = dayKey;
    cachedTodayStart = (/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0);
  }
  return cachedTodayStart;
}
function matchImportTimePreset(p, t) {
  const ts = todayStart();
  if (t === "today") return p.importedAt >= ts;
  if (t === "yesterday") return p.importedAt >= ts - DAY_MS && p.importedAt < ts;
  const days = t === "7d" ? 7 : t === "90d" ? 90 : t === "365d" ? 365 : 30;
  return p.importedAt >= Date.now() - days * DAY_MS;
}
function importTimePresetBounds(t) {
  const ts = todayStart();
  if (t === "today") return [ts, 0];
  if (t === "yesterday") return [ts - DAY_MS, ts];
  const days = t === "7d" ? 7 : t === "90d" ? 90 : t === "365d" ? 365 : 30;
  return [Date.now() - days * DAY_MS, 0];
}
function extOfFile(p) {
  const idx = p.fileName.lastIndexOf(".");
  return idx >= 0 ? p.fileName.slice(idx + 1).toLowerCase() : "";
}
function shapeOf(p) {
  if (!p.width || !p.height) return null;
  const ratio = p.width / p.height;
  if (ratio >= 3) return "panoramic";
  if (ratio <= 1 / 3) return "panoramicPortrait";
  if (ratio > 1.1) return "landscape";
  if (ratio < 0.9) return "portrait";
  return "square";
}
function ratioMatches(p, target) {
  if (!p.width || !p.height) return false;
  const t = target[0] / target[1];
  if (t <= 0) return false;
  return Math.abs(p.width / p.height - t) / t <= 0.02;
}
function matchKeyword(p, query, opts) {
  return searchMatch(p, query, {
    ...opts,
    words: opts?.words ?? useQueryWords().wordsFor(query)
  });
}
function folderScopeTextOf(p, folderMap) {
  if (p.folderId == null) return { folderName: "", folderDesc: "" };
  const f = folderMap.get(p.folderId);
  return { folderName: f?.name ?? "", folderDesc: f?.description ?? "" };
}
function groupByDate(photos) {
  const grouped = /* @__PURE__ */ new Map();
  for (const photo of photos) {
    if (!grouped.has(photo.dateSection)) {
      grouped.set(photo.dateSection, []);
    }
    grouped.get(photo.dateSection).push(photo);
  }
  return Array.from(grouped.entries()).map(([dateSection, photos2]) => ({ dateSection, photos: photos2 })).sort((a, b) => b.dateSection.localeCompare(a.dateSection));
}
function descendantFolderIds(folders, rootId) {
  const childrenOf = /* @__PURE__ */ new Map();
  for (const f of folders) {
    if (f.parentId == null) continue;
    const arr = childrenOf.get(f.parentId) ?? [];
    arr.push(f.id);
    childrenOf.set(f.parentId, arr);
  }
  const out = /* @__PURE__ */ new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const cur = queue.pop();
    for (const c of childrenOf.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c);
        queue.push(c);
      }
    }
  }
  return out;
}
function sortPhotos(photos, sortBy, asc = false) {
  const sorted = sortPhotosBase(photos, sortBy);
  if (!asc) return sorted;
  const rev = [...sorted].reverse();
  return [...rev.filter((p) => p.pinnedAt), ...rev.filter((p) => !p.pinnedAt)];
}
function sortPhotosBase(photos, sortBy) {
  const by = (cmp) => [...photos].sort((a, b) => Number(!!b.pinnedAt) - Number(!!a.pinnedAt) || cmp(a, b));
  const extOf = (p) => {
    const i = p.fileName.lastIndexOf(".");
    return i < 0 ? "" : p.fileName.slice(i + 1).toLowerCase();
  };
  const pixelsOf = (p) => (p.width ?? 0) * (p.height ?? 0);
  switch (sortBy) {
    case "name":
      return by((a, b) => a.fileName.localeCompare(b.fileName));
    case "modified":
      return by((a, b) => (b.fsModifiedAt ?? b.modifiedAt) - (a.fsModifiedAt ?? a.modifiedAt));
    case "created":
      return by((a, b) => (b.fsCreatedAt ?? b.createdAt) - (a.fsCreatedAt ?? a.createdAt));
    case "extension":
      return by((a, b) => extOf(a).localeCompare(extOf(b)) || a.fileName.localeCompare(b.fileName));
    case "size":
      return by((a, b) => b.fileSize - a.fileSize);
    case "dimensions":
      return by((a, b) => pixelsOf(b) - pixelsOf(a));
    case "rating":
      return by((a, b) => b.rating - a.rating);
    case "duration":
      return by((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
    default:
      return [...photos].sort((a, b) => Number(!!b.pinnedAt) - Number(!!a.pinnedAt));
  }
}
const similarMatches = ref([]);
const similarSourceName = ref("");
export function installSearchPools() {
  return { similarMatches, similarSourceName };
}
let shuffleKey = "";
let shuffleIds = [];
function poolFingerprint(pool) {
  if (pool.length === 0) return "0";
  let f = `${pool.length}:${pool[0].id}:${pool[pool.length - 1].id}`;
  const step = Math.max(1, Math.floor(pool.length / 8));
  for (let i = step; i < pool.length; i += step) f += `:${pool[i].id}`;
  return f;
}
function stableShuffleOrder(pool) {
  const key = poolFingerprint(pool);
  if (key !== shuffleKey) {
    shuffleIds = pool.map((p) => p.id);
    for (let i = shuffleIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleIds[i], shuffleIds[j]] = [shuffleIds[j], shuffleIds[i]];
    }
    shuffleKey = key;
  }
  return shuffleIds;
}
function build() {
  const tabs = useLibraryTabs();
  const data = usePhotoData();
  const searchScopes = useSearchScopes();
  const tab = computed(() => tabs.active);
  const isTrashView = computed(() => tab.value.view === "trash");
  const isMapView = computed(() => tab.value.view === "map");
  const isDuplicateView = computed(() => tab.value.view === "duplicates");
  const isSimilarView = computed(() => tab.value.view.startsWith("similar:"));
  const activeAlbumId = computed(
    () => tab.value.view.startsWith("album:") ? tab.value.view.slice(6) : null
  );
  const activeAlbum = computed(
    () => data.albums.value.find((a) => a.id === activeAlbumId.value) ?? null
  );
  const activeFolderId = computed(
    () => tab.value.view.startsWith("folder:") ? tab.value.view.slice(7) : null
  );
  const activeFolder = computed(
    () => data.folders.value.find((f) => f.id === activeFolderId.value) ?? null
  );
  const activeSmartAlbumId = computed(
    () => tab.value.view.startsWith("smart:") ? tab.value.view.slice(6) : null
  );
  const activeSmartAlbum = computed(
    () => data.smartAlbums.value.find((a) => a.id === activeSmartAlbumId.value) ?? null
  );
  const viewLayout = computed(() => {
    const o = activeFolder.value?.viewLayout;
    return o && o !== "global" ? o : tab.value.layout;
  });
  const viewSortBy = computed(() => {
    const o = activeFolder.value?.viewSort;
    return o && o !== "global" ? o : tab.value.sortBy;
  });
  const viewDisplay = computed(() => {
    const raw = activeFolder.value?.viewDisplay;
    if (!raw) return tab.value.display;
    try {
      return { ...tab.value.display, ...JSON.parse(raw) };
    } catch {
      return tab.value.display;
    }
  });
  const isSearchMode = computed(
    () => !!tab.value.searchKeyword.trim() && !isTrashView.value && !isDuplicateView.value && !isSimilarView.value
  );
  const showFilters = computed(
    () => !isTrashView.value && !isDuplicateView.value && !isSimilarView.value
  );
  function matchKind(p) {
    return !tab.value.kindFilter || p.kind === tab.value.kindFilter;
  }
  function matchColor(p) {
    const close = tab.value.colorClose;
    if (close) {
      const colors = [p.colorDominant, ...p.palette ?? []].filter((c) => !!c);
      return colorListCloseTo(colors, close.hex, accuracyToMaxDelta(close.accuracy));
    }
    if (!tab.value.colorFilter) return true;
    return !!p.colorDominant && hueBucketOf(p.colorDominant) === tab.value.colorFilter;
  }
  function matchRating(p) {
    const inc = tab.value.ratingInclude;
    if (inc.length > 0) return inc.includes(p.rating);
    const ex = tab.value.ratingExclude;
    return ex.length === 0 || !ex.includes(p.rating);
  }
  function matchSize(p) {
    const r = tab.value.sizeRange;
    if (!r) return true;
    const [min, max] = r;
    if (min > 0 && p.fileSize < min) return false;
    if (max > 0 && p.fileSize > max) return false;
    return true;
  }
  function matchShape(p) {
    const r = tab.value.ratioFilter;
    const ex = tab.value.shapeExclude;
    const inc = tab.value.shapeInclude;
    if (r) {
      if (!ratioMatches(p, r)) return false;
    }
    const v = shapeOf(p);
    if (v && ex.includes(v)) return false;
    if (inc.length > 0) return v !== null && inc.includes(v);
    return true;
  }
  function matchTags(p) {
    if (tab.value.untaggedOnly && p.tags.length > 0) return false;
    const ex = tab.value.tagExclude;
    if (ex.length > 0) {
      const exLower = ex.map((e) => e.toLowerCase());
      if (p.tags.some((pt) => exLower.includes(pt.toLowerCase()))) return false;
    }
    const t = tab.value.tagFilter;
    if (!t || t.length === 0) return true;
    const has = (tag) => p.tags.some((pt) => pt.toLowerCase() === tag.toLowerCase());
    if (tab.value.tagMatchExact) {
      if (p.tags.length !== t.length) return false;
      return t.every(has);
    }
    return tab.value.tagMatchAny ? t.some(has) : t.every(has);
  }
  function matchExclude(p) {
    const kw = tab.value.excludeKeyword.trim().toLowerCase();
    if (!kw) return true;
    return !(p.fileName.toLowerCase().includes(kw) || (p.description ?? "").toLowerCase().includes(kw) || p.tags.some((t) => t.toLowerCase().includes(kw)));
  }
  function matchCustomTime(p) {
    const c = tab.value.customTime;
    if (!c) return true;
    const [from, to] = c;
    if (from > 0 && p.importedAt < from) return false;
    if (to > 0 && p.importedAt > to) return false;
    return true;
  }
  function matchDuration(p) {
    const r = tab.value.durationRange;
    if (!r) return true;
    const [min, max] = r;
    const d = p.durationMs;
    if (d == null) return false;
    if (min > 0 && d < min) return false;
    if (max > 0 && d > max) return false;
    return true;
  }
  function matchNoteKeyword(p) {
    const kw = tab.value.noteKeyword.trim().toLowerCase();
    if (!kw) return true;
    const desc = (p.description ?? "").toLowerCase();
    return tab.value.noteKeywordExact ? desc === kw : desc.includes(kw);
  }
  function matchFolderFilter(p) {
    const ex = tab.value.folderExcludeIds;
    if (ex.length > 0) {
      if (p.folderId == null) {
        if (ex.includes("none")) return false;
      } else if (ex.includes(p.folderId)) {
        return false;
      }
    }
    const ids = tab.value.folderFilterIds;
    if (ids.length > 0) {
      const inSet = (id) => id === "none" ? p.folderId == null : p.folderId === id;
      return tab.value.folderMatchAll ? ids.every(inSet) : ids.some(inSet);
    }
    const f = tab.value.folderFilter;
    if (!f) return true;
    if (f === "none") return p.folderId == null;
    return p.folderId === f;
  }
  function matchModifiedTime(p) {
    const r = tab.value.modifiedTimeRange;
    if (!r) return true;
    const [from, to] = r;
    const m = p.fsModifiedAt;
    if (m == null) return false;
    if (from > 0 && m < from) return false;
    if (to > 0 && m > to) return false;
    return true;
  }
  function matchUrlKeyword(p) {
    const kw = tab.value.urlKeyword.trim().toLowerCase();
    if (!kw) return true;
    const url = (p.sourceUrl ?? "").toLowerCase();
    return tab.value.urlKeywordExact ? url === kw : url.includes(kw);
  }
  function matchQuick(p) {
    if (tab.value.resolutionFilter) {
      const min = RESOLUTION_MIN[tab.value.resolutionFilter];
      if (Math.max(p.width ?? 0, p.height ?? 0) < min) return false;
    }
    if (tab.value.timeFilter) {
      if (!matchImportTimePreset(p, tab.value.timeFilter)) return false;
    }
    return true;
  }
  function matchFormat(p) {
    const ext = extOfFile(p);
    const ex = tab.value.formatExclude;
    if (ex.length > 0 && ex.includes(ext)) return false;
    const inc = tab.value.formatInclude;
    if (inc.length > 0) return inc.includes(ext);
    return true;
  }
  function matchAll(p) {
    return matchKind(p) && matchColor(p) && matchFormat(p) && matchQuick(p) && matchRating(p) && matchSize(p) && matchShape(p) && matchTags(p) && matchExclude(p) && matchCustomTime(p) && matchDuration(p) && matchNoteKeyword(p) && matchUrlKeyword(p) && matchFolderFilter(p) && matchModifiedTime(p);
  }
  const hasDimensionFilters = computed(() => {
    const t = tab.value;
    return !!t.kindFilter || !!t.colorFilter || !!t.colorClose || t.formatInclude.length > 0 || t.formatExclude.length > 0 || !!t.resolutionFilter || !!t.timeFilter || t.ratingInclude.length > 0 || t.ratingExclude.length > 0 || !!t.sizeRange || t.shapeInclude.length > 0 || t.shapeExclude.length > 0 || !!t.ratioFilter || t.tagFilter.length > 0 || t.tagExclude.length > 0 || t.untaggedOnly || !!t.folderFilter || t.folderFilterIds.length > 0 || t.folderExcludeIds.length > 0 || !!t.customTime || !!t.modifiedTimeRange || !!t.durationRange || !!t.noteKeyword || !!t.urlKeyword || !!t.excludeKeyword;
  });
  const canPageMain = computed(
    () => (
      // 阶段 3：维度筛选已下推 SQL（buildFiltersSpec → getPage.filters），
      // 不再因此退回全量路径；搜索视图走全局搜索池分支
      !isSearchMode.value && !isMapView.value && !isDuplicateView.value && !isSimilarView.value && !isTrashView.value && !tab.value.shuffle && tab.value.view !== "random"
    )
  );
  data.setPagedFilters(((s) => Object.keys(s).length > 0 ? s : void 0)(buildFiltersSpec()));
  const reloadPagedPoolForSpec = () => {
    if (isSearchMode.value) {
      const q = tab.value.searchKeyword;
      if (data.usePagedSearch()) void data.loadSearchPage(true, q, buildSearchSpec(q));
      return;
    }
    if (tab.value.view === "favorites") {
      if (data.usePagedFavorites()) void data.loadFavoritesPage(true);
      return;
    }
    if (activeFolderId.value) {
      if (data.usePagedFolder()) void data.loadFolderPage(true);
      return;
    }
    if (canPageMain.value && data.mainPagedActive.value) void data.loadPhotos();
  };
  watch(
    () => JSON.stringify(buildFiltersSpec()),
    () => {
      const spec = buildFiltersSpec();
      data.setPagedFilters(Object.keys(spec).length > 0 ? spec : void 0);
      reloadPagedPoolForSpec();
    }
  );
  data.registerMainPageGate(() => {
    try {
      if (localStorage.getItem("leaf:use-paged-main") === "0") return false;
    } catch {
    }
    return canPageMain.value;
  });
  watch(canPageMain, (on, off) => {
    if (on !== off) void data.loadPhotos();
  });
  const currentPool = computed(() => {
    if (isMapView.value) {
      return data.allPhotos.value.filter((p) => p.latitude != null && p.longitude != null);
    }
    if (isSimilarView.value) return similarMatches.value;
    if (activeFolderId.value) return data.folderPhotos.value;
    if (activeAlbumId.value) return data.albumPhotos.value;
    if (activeSmartAlbumId.value) return data.smartAlbumPhotos.value;
    if (tab.value.view === "unsorted") return data.unsortedPhotos.value;
    if (tab.value.view === "recent") return data.recentPhotos.value;
    if (tab.value.view === "recents") return data.recentViewedPhotos.value;
    return data.allPhotos.value;
  });
  const displaySections = computed(() => {
    const sortForView = (photos) => sortPhotos(photos, viewSortBy.value, tab.value.sortAsc);
    if (isTrashView.value) {
      return groupByDate(data.recycleBinPhotos.value);
    }
    if (isDuplicateView.value) {
      return [];
    }
    if (isSimilarView.value) {
      return [
        {
          dateSection: `与「${similarSourceName.value}」相似的 ${similarMatches.value.length} 张图片`,
          photos: sortForView(similarMatches.value)
        }
      ];
    }
    if (tab.value.shuffle || tab.value.view === "random") {
      const pool = currentPool.value;
      const order = stableShuffleOrder(pool);
      const orderIndex = new Map(order.map((id, i) => [id, i]));
      const filtered = pool.filter((p) => matchAll(p));
      filtered.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
      return [{ dateSection: `随机 · ${filtered.length} 张`, photos: filtered }];
    }
    if (isSearchMode.value) {
      if (data.usePagedSearch() && data.searchPoolQuery.value === tab.value.searchKeyword) {
        return groupByDate(data.searchPoolPhotos.value).map((s) => ({
          ...s,
          photos: sortForView(s.photos)
        }));
      }
      const scopes = searchScopes.value;
      const folderMap = new Map(data.folders.value.map((f) => [f.id, f]));
      return groupByDate(
        currentPool.value.filter(
          (p) => matchKeyword(p, tab.value.searchKeyword, {
            scopes,
            ...folderScopeTextOf(p, folderMap)
          }) && matchAll(p)
        )
      ).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }));
    }
    if (tab.value.view === "favorites") {
      if (data.usePagedFavorites()) {
        return groupByDate(data.favoritesPhotos.value).map((s) => ({
          ...s,
          photos: sortForView(s.photos)
        }));
      }
      return groupByDate(currentPool.value.filter((p) => p.isFavorite && matchAll(p))).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }));
    }
    if (tab.value.view === "untagged") {
      return groupByDate(currentPool.value.filter((p) => p.tags.length === 0 && matchAll(p))).map(
        (s) => ({
          ...s,
          photos: sortForView(s.photos)
        })
      );
    }
    if (activeAlbumId.value) {
      return groupByDate(data.albumPhotos.value.filter(matchAll)).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }));
    }
    if (activeFolderId.value) {
      if (data.usePagedFolder() && !tab.value.display.includeSubfolders) {
        return groupByDate(data.folderPhotos.value).map((s) => ({
          ...s,
          photos: sortForView(s.photos)
        }));
      }
      let pool = data.folderPhotos.value;
      if (tab.value.display.includeSubfolders) {
        const ids = descendantFolderIds(data.folders.value, activeFolderId.value);
        pool = data.allPhotos.value.filter((p) => p.folderId != null && ids.has(p.folderId));
      }
      return groupByDate(pool.filter(matchAll)).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }));
    }
    if (activeSmartAlbumId.value) {
      return groupByDate(data.smartAlbumPhotos.value.filter(matchAll)).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }));
    }
    if (tab.value.view === "unsorted" || tab.value.view === "recent" || tab.value.view === "recents") {
      return groupByDate(currentPool.value.filter(matchAll)).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }));
    }
    if (data.mainPagedActive.value) {
      return groupByDate(data.allPhotos.value).map((s) => ({
        ...s,
        photos: sortForView(s.photos)
      }));
    }
    return groupByDate(data.allPhotos.value.filter(matchAll)).map((s) => ({
      ...s,
      photos: sortForView(s.photos)
    }));
  });
  const flatDisplayPhotos = computed(() => displaySections.value.flatMap((s) => s.photos));
  const totalCount = computed(() => flatDisplayPhotos.value.length);
  const availableFormats = computed(() => {
    const set = /* @__PURE__ */ new Set();
    for (const p of currentPool.value) {
      const idx = p.fileName.lastIndexOf(".");
      if (idx >= 0) set.add(p.fileName.slice(idx + 1).toLowerCase());
    }
    return Array.from(set).sort();
  });
  return {
    tab,
    viewLayout,
    viewSortBy,
    viewDisplay,
    isTrashView,
    isMapView,
    isDuplicateView,
    isSimilarView,
    activeAlbumId,
    activeAlbum,
    activeFolderId,
    activeFolder,
    activeSmartAlbumId,
    activeSmartAlbum,
    isSearchMode,
    showFilters,
    matchAll,
    matchKeyword,
    hasDimensionFilters,
    currentPool,
    displaySections,
    flatDisplayPhotos,
    totalCount,
    availableFormats
  };
}
let singleton = null;
export function usePhotoFilters() {
  if (!singleton) singleton = build();
  return singleton;
}
export {
  extOfFile,
  shapeOf,
  ratioMatches,
  matchImportTimePreset,
  importTimePresetBounds,
  RESOLUTION_MIN
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZVBob3RvRmlsdGVycy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIExlYWYg57Sg5p2Q5bqTIMK3IOinhuWbvuaooeWei+S4juetm+mAie+8iEQtMDA4IOmHjeaehO+8iVxuICpcbiAqIOS7juWOnyBpbmRleC52dWUg6L+B5Ye677ya6KeG5Zu+5YiG5pSv5Yik5pat44CB57G75Z6LL+iJsuebuC/moLzlvI8v5YiG6L6o546HL+aXtumXtOW/q+etm+OAgVxuICog5YWz6ZSu6K+N5Yy56YWN44CB5o6S5bqP44CB5YiG57uEIGRpc3BsYXlTZWN0aW9ucyDkuI7pooTop4jnv7vpobXmsaAgY3VycmVudFBvb2zjgIJcbiAqIOetm+mAieeKtuaAgeWtmOS6jua0u+WKqCB0YWLvvIh1c2VMaWJyYXJ5VGFic++8ie+8jOWIhyB0YWIg6Ieq5Yqo5L+d55WZ5ZCE6Ieq562b6YCJ44CCXG4gKlxuICog5qih5Z2X57qn5Y2V5L6L77ya5omA5pyJIGNvbXB1dGVkcyDlhoXpg6jljbPml7bor7vlj5YgdGFicy5hY3RpdmXvvIx0YWIg5YiH5o2i6Ieq5Yqo5ZON5bqU44CCXG4gKi9cbmltcG9ydCB7IGNvbXB1dGVkLCByZWYsIHdhdGNoIH0gZnJvbSAndnVlJ1xuaW1wb3J0IHsgaHVlQnVja2V0T2YsIHR5cGUgSHVlQnVja2V0IH0gZnJvbSAnQHV0aWxzL3Bob3RvQ29sb3InXG5pbXBvcnQgeyBhY2N1cmFjeVRvTWF4RGVsdGEsIGNvbG9yTGlzdENsb3NlVG8gfSBmcm9tICdAc2hhcmVkL2NvbG9yTWF0Y2gnXG5pbXBvcnQgdHlwZSB7IFBob3RvLCBQaG90b1NlY3Rpb24gfSBmcm9tICdAcmVuZGVyZXIvdHlwZXMvcGhvdG8nXG5pbXBvcnQge1xuICB1c2VMaWJyYXJ5VGFicyxcbiAgdHlwZSBEaXNwbGF5T3B0aW9ucyxcbiAgdHlwZSBMaWJyYXJ5TGF5b3V0LFxuICB0eXBlIExpYnJhcnlTb3J0LFxuICB0eXBlIE9yaWVudGF0aW9uVmFsdWVcbn0gZnJvbSAnQHJlbmRlcmVyL3N0b3Jlcy9saWJyYXJ5VGFicydcbmltcG9ydCB7IHVzZVBob3RvRGF0YSB9IGZyb20gJy4vdXNlUGhvdG9EYXRhJ1xuaW1wb3J0IHsgc2VhcmNoTWF0Y2gsIHR5cGUgU2VhcmNoU2NvcGVPcHRpb25zIH0gZnJvbSAnLi91c2VBZHZhbmNlZFNlYXJjaCdcbmltcG9ydCB7IHVzZVF1ZXJ5V29yZHMgfSBmcm9tICcuL3VzZVF1ZXJ5V29yZHMnXG5pbXBvcnQgeyB1c2VTZWFyY2hTY29wZXMgfSBmcm9tICcuLi9jb25zdGFudHMvc2VhcmNoU2NvcGVzJ1xuaW1wb3J0IHsgYnVpbGRGaWx0ZXJzU3BlYywgYnVpbGRTZWFyY2hTcGVjLCBSRVNPTFVUSU9OX01JTiB9IGZyb20gJy4vdXNlUGhvdG9GaWx0ZXJTcGVjJ1xuaW1wb3J0IHR5cGUgeyBQaG90b0ZvbGRlciB9IGZyb20gJ0ByZW5kZXJlci90eXBlcy9waG90bydcblxuY29uc3QgREFZX01TID0gODZfNDAwXzAwMFxuXG5sZXQgY2FjaGVkRGF5S2V5ID0gLTFcbmxldCBjYWNoZWRUb2RheVN0YXJ0ID0gMFxuLyoqIOS7iuaXpSAwIOeCue+8iOaMieWkqee8k+WtmO+8m+WuoeafpSBNMTLvvJrorqHmlbDlvqrnjq/pgb/lhY3lr7nmr4/lvKDlm77mnoTpgKAgRGF0Ze+8iSAqL1xuZnVuY3Rpb24gdG9kYXlTdGFydCgpOiBudW1iZXIge1xuICBjb25zdCBkYXlLZXkgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyBEQVlfTVMpXG4gIGlmIChkYXlLZXkgIT09IGNhY2hlZERheUtleSkge1xuICAgIGNhY2hlZERheUtleSA9IGRheUtleVxuICAgIGNhY2hlZFRvZGF5U3RhcnQgPSBuZXcgRGF0ZSgpLnNldEhvdXJzKDAsIDAsIDAsIDApXG4gIH1cbiAgcmV0dXJuIGNhY2hlZFRvZGF5U3RhcnRcbn1cblxuLyoqXG4gKiDkuozljYHlha3ova7vvJrlr7zlhaXml7bpl7TpooTorr7liKTlrprvvIhtYXRjaFF1aWNrIOS4juetm+mAieihjOiuoeaVsOWFseeUqO+8ieOAglxuICog5pio5pelPeS7heaYqOWkqeW9k+Wkqe+8iOS4jeWQq+S7iuaXpe+8ie+8jOWFtuS9mT3oh6rku4rml6UgMCDngrkvIE4g5pel5YmN6LW3566X44CCXG4gKi9cbmZ1bmN0aW9uIG1hdGNoSW1wb3J0VGltZVByZXNldChwOiBQaG90bywgdDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IHRzID0gdG9kYXlTdGFydCgpXG4gIGlmICh0ID09PSAndG9kYXknKSByZXR1cm4gcC5pbXBvcnRlZEF0ID49IHRzXG4gIGlmICh0ID09PSAneWVzdGVyZGF5JykgcmV0dXJuIHAuaW1wb3J0ZWRBdCA+PSB0cyAtIERBWV9NUyAmJiBwLmltcG9ydGVkQXQgPCB0c1xuICBjb25zdCBkYXlzID0gdCA9PT0gJzdkJyA/IDcgOiB0ID09PSAnOTBkJyA/IDkwIDogdCA9PT0gJzM2NWQnID8gMzY1IDogMzBcbiAgcmV0dXJuIHAuaW1wb3J0ZWRBdCA+PSBEYXRlLm5vdygpIC0gZGF5cyAqIERBWV9NU1xufVxuXG4vKiog5LqM5Y2B5LiD6L2u77ya5pe26Ze06aKE6K6+IOKGkiBbc3RhcnQsIGVuZCkg6L6555WM77yI5L+d5a2Y562b6YCJ4oaS5pm66IO95aS56KeE5YiZ5pig5bCE55So77ybZW5kPTAg5peg5LiK55WM77yJICovXG5mdW5jdGlvbiBpbXBvcnRUaW1lUHJlc2V0Qm91bmRzKHQ6IHN0cmluZyk6IFtudW1iZXIsIG51bWJlcl0ge1xuICBjb25zdCB0cyA9IHRvZGF5U3RhcnQoKVxuICBpZiAodCA9PT0gJ3RvZGF5JykgcmV0dXJuIFt0cywgMF1cbiAgaWYgKHQgPT09ICd5ZXN0ZXJkYXknKSByZXR1cm4gW3RzIC0gREFZX01TLCB0c11cbiAgY29uc3QgZGF5cyA9IHQgPT09ICc3ZCcgPyA3IDogdCA9PT0gJzkwZCcgPyA5MCA6IHQgPT09ICczNjVkJyA/IDM2NSA6IDMwXG4gIHJldHVybiBbRGF0ZS5ub3coKSAtIGRheXMgKiBEQVlfTVMsIDBdXG59XG5cbi8qKiDkuozljYHlha3ova7vvJrmianlsZXlkI3vvIjlsI/lhpnvvIzml6DmianlsZXlkI0gPSAnJ++8ieKAlOKAlOagvOW8j+e7tOW6puWkmumAiS/mjpLpmaTlhbHnlKggKi9cbmZ1bmN0aW9uIGV4dE9mRmlsZShwOiBQaG90byk6IHN0cmluZyB7XG4gIGNvbnN0IGlkeCA9IHAuZmlsZU5hbWUubGFzdEluZGV4T2YoJy4nKVxuICByZXR1cm4gaWR4ID49IDAgPyBwLmZpbGVOYW1lLnNsaWNlKGlkeCArIDEpLnRvTG93ZXJDYXNlKCkgOiAnJ1xufVxuXG4vKiog5LqM5Y2B5YWt6L2u77ya5b2i54q25b2S57G777yI5peg5a696auYID0gbnVsbO+8ieKAlOKAlOW9oueKtue7tOW6puWkmumAiS/mjpLpmaTkuI7orqHmlbDlhbHnlKggKi9cbmZ1bmN0aW9uIHNoYXBlT2YocDogUGhvdG8pOiBPcmllbnRhdGlvblZhbHVlIHwgbnVsbCB7XG4gIGlmICghcC53aWR0aCB8fCAhcC5oZWlnaHQpIHJldHVybiBudWxsXG4gIGNvbnN0IHJhdGlvID0gcC53aWR0aCAvIHAuaGVpZ2h0XG4gIGlmIChyYXRpbyA+PSAzKSByZXR1cm4gJ3Bhbm9yYW1pYydcbiAgaWYgKHJhdGlvIDw9IDEgLyAzKSByZXR1cm4gJ3Bhbm9yYW1pY1BvcnRyYWl0J1xuICBpZiAocmF0aW8gPiAxLjEpIHJldHVybiAnbGFuZHNjYXBlJ1xuICBpZiAocmF0aW8gPCAwLjkpIHJldHVybiAncG9ydHJhaXQnXG4gIHJldHVybiAnc3F1YXJlJ1xufVxuXG4vKiog5LqM5Y2B5YWt6L2u77ya5q+U5L6L5a655beu5Yy56YWN77yIRWFnbGUg5b2i54q25by55bGCIDM6NCDnrYnmr5TkvovooYzvvJvCsTIlIOebuOWvueWuueW3ru+8iSAqL1xuZnVuY3Rpb24gcmF0aW9NYXRjaGVzKHA6IFBob3RvLCB0YXJnZXQ6IFtudW1iZXIsIG51bWJlcl0pOiBib29sZWFuIHtcbiAgaWYgKCFwLndpZHRoIHx8ICFwLmhlaWdodCkgcmV0dXJuIGZhbHNlXG4gIGNvbnN0IHQgPSB0YXJnZXRbMF0gLyB0YXJnZXRbMV1cbiAgaWYgKHQgPD0gMCkgcmV0dXJuIGZhbHNlXG4gIHJldHVybiBNYXRoLmFicyhwLndpZHRoIC8gcC5oZWlnaHQgLSB0KSAvIHQgPD0gMC4wMlxufVxuXG4vKipcbiAqIOWFs+mUruivjeWMuemFje+8iHJvdW5kMjDvvJrpm4bmiJDpq5jnuqfmkJzntKIgT1Iv5ous5Y+3L+W8leWPty/mjpLpmaTor43vvInjgIJcbiAqIOaXoOmrmOe6p+ivreazleaXtui1sOWOn+W/q+mAn+i3r+W+hO+8iOepuuagvCBBTkTvvInvvIzkv53or4HmgKfog73jgIJcbiAqL1xuZnVuY3Rpb24gbWF0Y2hLZXl3b3JkKHA6IFBob3RvLCBxdWVyeTogc3RyaW5nLCBvcHRzPzogU2VhcmNoU2NvcGVPcHRpb25zKTogYm9vbGVhbiB7XG4gIC8vIOivjeeUseS4u+i/m+eoi+WIhuivjeWQjue7jyB1c2VRdWVyeVdvcmRzIOe8k+WtmOS8oOi/h+adpe+8muS4pOS+p+WQhOWIh+S4gOasoeS8muW+l+WHuuS4pOWll+e7k+aenFxuICByZXR1cm4gc2VhcmNoTWF0Y2gocCwgcXVlcnksIHtcbiAgICAuLi5vcHRzLFxuICAgIHdvcmRzOiBvcHRzPy53b3JkcyA/PyB1c2VRdWVyeVdvcmRzKCkud29yZHNGb3IocXVlcnkpXG4gIH0pXG59XG5cbi8qKiDntKDmnZDmiYDlsZ7mlofku7blpLnnmoTlkI3np7Av5o+P6L+w77yIZm9sZGVyTmFtZS9mb2xkZXJEZXNjIOaQnOe0ouiMg+WbtOeUqO+8ieOAglxuICogIOaUtiBNYXDvvJrnrZvpgInmr4/mrKHlj5jljJblr7nlhajmsaDpgJDlm77osIPnlKjvvIzml6flrp7njrAgZm9sZGVycy5maW5kIOaYryBPKE7Dl0Yp44CCICovXG5mdW5jdGlvbiBmb2xkZXJTY29wZVRleHRPZihcbiAgcDogUGhvdG8sXG4gIGZvbGRlck1hcDogTWFwPHN0cmluZywgUGhvdG9Gb2xkZXI+XG4pOiB7IGZvbGRlck5hbWU6IHN0cmluZzsgZm9sZGVyRGVzYzogc3RyaW5nIH0ge1xuICBpZiAocC5mb2xkZXJJZCA9PSBudWxsKSByZXR1cm4geyBmb2xkZXJOYW1lOiAnJywgZm9sZGVyRGVzYzogJycgfVxuICBjb25zdCBmID0gZm9sZGVyTWFwLmdldChwLmZvbGRlcklkKVxuICByZXR1cm4geyBmb2xkZXJOYW1lOiBmPy5uYW1lID8/ICcnLCBmb2xkZXJEZXNjOiBmPy5kZXNjcmlwdGlvbiA/PyAnJyB9XG59XG5cbmZ1bmN0aW9uIGdyb3VwQnlEYXRlKHBob3RvczogUGhvdG9bXSk6IFBob3RvU2VjdGlvbltdIHtcbiAgY29uc3QgZ3JvdXBlZCA9IG5ldyBNYXA8c3RyaW5nLCBQaG90b1tdPigpXG4gIGZvciAoY29uc3QgcGhvdG8gb2YgcGhvdG9zKSB7XG4gICAgaWYgKCFncm91cGVkLmhhcyhwaG90by5kYXRlU2VjdGlvbikpIHtcbiAgICAgIGdyb3VwZWQuc2V0KHBob3RvLmRhdGVTZWN0aW9uLCBbXSlcbiAgICB9XG4gICAgZ3JvdXBlZC5nZXQocGhvdG8uZGF0ZVNlY3Rpb24pIS5wdXNoKHBob3RvKVxuICB9XG4gIHJldHVybiBBcnJheS5mcm9tKGdyb3VwZWQuZW50cmllcygpKVxuICAgIC5tYXAoKFtkYXRlU2VjdGlvbiwgcGhvdG9zXSkgPT4gKHsgZGF0ZVNlY3Rpb24sIHBob3RvcyB9KSlcbiAgICAuc29ydCgoYSwgYikgPT4gYi5kYXRlU2VjdGlvbi5sb2NhbGVDb21wYXJlKGEuZGF0ZVNlY3Rpb24pKVxufVxuXG4vKiogRC0wMTLjgIzmmL7npLrlrZDmlofku7blpLnlhoXlrrnjgI3vvJrmoLnmlofku7blpLkg4oiqIOWFqOmDqOWQjuS7o+eahCBpZCDpm4YgKi9cbmZ1bmN0aW9uIGRlc2NlbmRhbnRGb2xkZXJJZHMoXG4gIGZvbGRlcnM6IEFycmF5PHsgaWQ6IHN0cmluZzsgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwgfT4sXG4gIHJvb3RJZDogc3RyaW5nXG4pOiBTZXQ8c3RyaW5nPiB7XG4gIGNvbnN0IGNoaWxkcmVuT2YgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KClcbiAgZm9yIChjb25zdCBmIG9mIGZvbGRlcnMpIHtcbiAgICBpZiAoZi5wYXJlbnRJZCA9PSBudWxsKSBjb250aW51ZVxuICAgIGNvbnN0IGFyciA9IGNoaWxkcmVuT2YuZ2V0KGYucGFyZW50SWQpID8/IFtdXG4gICAgYXJyLnB1c2goZi5pZClcbiAgICBjaGlsZHJlbk9mLnNldChmLnBhcmVudElkLCBhcnIpXG4gIH1cbiAgY29uc3Qgb3V0ID0gbmV3IFNldDxzdHJpbmc+KFtyb290SWRdKVxuICBjb25zdCBxdWV1ZSA9IFtyb290SWRdXG4gIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgY3VyID0gcXVldWUucG9wKCkgYXMgc3RyaW5nXG4gICAgZm9yIChjb25zdCBjIG9mIGNoaWxkcmVuT2YuZ2V0KGN1cikgPz8gW10pIHtcbiAgICAgIGlmICghb3V0LmhhcyhjKSkge1xuICAgICAgICBvdXQuYWRkKGMpXG4gICAgICAgIHF1ZXVlLnB1c2goYylcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG4vKipcbiAqIOe7hOWGheaOkuW6j++8iEQtMDEy77ya5a+56b2QIEVhZ2xlIOaOkuWIl+aWueW8j++8m2ltcG9ydGVkIOS/neaMgeWvvOWFpeW6jy/ml6XmnJ/liIbnu4Tluo/vvInjgIJcbiAqIOmaj+acuuaooeW8j+S4jei1sOi/memHjOKAlOKAlOeUsSBzaHVmZmxlIOWtl+autempseWKqCBzdGFibGVTaHVmZmxlT3JkZXLjgIJcbiAqL1xuZnVuY3Rpb24gc29ydFBob3RvcyhwaG90b3M6IFBob3RvW10sIHNvcnRCeTogc3RyaW5nLCBhc2MgPSBmYWxzZSk6IFBob3RvW10ge1xuICBjb25zdCBzb3J0ZWQgPSBzb3J0UGhvdG9zQmFzZShwaG90b3MsIHNvcnRCeSlcbiAgaWYgKCFhc2MpIHJldHVybiBzb3J0ZWRcbiAgLy8g5Y2H5bqP77ya5pW057uE5Y+N6L2s5ZCO572u6aG26aG55LuN5L+d5oyB5Zyo5pyA5YmN77yIRWFnbGUg6KGM5Li677yJXG4gIGNvbnN0IHJldiA9IFsuLi5zb3J0ZWRdLnJldmVyc2UoKVxuICByZXR1cm4gWy4uLnJldi5maWx0ZXIoKHApID0+IHAucGlubmVkQXQpLCAuLi5yZXYuZmlsdGVyKChwKSA9PiAhcC5waW5uZWRBdCldXG59XG5cbmZ1bmN0aW9uIHNvcnRQaG90b3NCYXNlKHBob3RvczogUGhvdG9bXSwgc29ydEJ5OiBzdHJpbmcpOiBQaG90b1tdIHtcbiAgLy8gUjUg572u6aG277yacGlubmVkQXQg5LyY5YWI77yI56iz5a6a5o6S5bqP77yM57uE5YaF5L+d5oyB5Y6f5bqP77yJXG4gIGNvbnN0IGJ5ID0gKGNtcDogKGE6IFBob3RvLCBiOiBQaG90bykgPT4gbnVtYmVyKTogUGhvdG9bXSA9PlxuICAgIFsuLi5waG90b3NdLnNvcnQoKGEsIGIpID0+IE51bWJlcighIWIucGlubmVkQXQpIC0gTnVtYmVyKCEhYS5waW5uZWRBdCkgfHwgY21wKGEsIGIpKVxuICBjb25zdCBleHRPZiA9IChwOiBQaG90byk6IHN0cmluZyA9PiB7XG4gICAgY29uc3QgaSA9IHAuZmlsZU5hbWUubGFzdEluZGV4T2YoJy4nKVxuICAgIHJldHVybiBpIDwgMCA/ICcnIDogcC5maWxlTmFtZS5zbGljZShpICsgMSkudG9Mb3dlckNhc2UoKVxuICB9XG4gIGNvbnN0IHBpeGVsc09mID0gKHA6IFBob3RvKTogbnVtYmVyID0+IChwLndpZHRoID8/IDApICogKHAuaGVpZ2h0ID8/IDApXG4gIHN3aXRjaCAoc29ydEJ5KSB7XG4gICAgY2FzZSAnbmFtZSc6IC8vIEVhZ2xl44CM5qCH6aKY44CNXG4gICAgICByZXR1cm4gYnkoKGEsIGIpID0+IGEuZmlsZU5hbWUubG9jYWxlQ29tcGFyZShiLmZpbGVOYW1lKSlcbiAgICBjYXNlICdtb2RpZmllZCc6IC8vIOaWh+S7tuezu+e7n+S/ruaUueaXtumXtO+8jOe8uuWIl+WbnumAgCB1cGRhdGVkX2F0XG4gICAgICByZXR1cm4gYnkoKGEsIGIpID0+IChiLmZzTW9kaWZpZWRBdCA/PyBiLm1vZGlmaWVkQXQpIC0gKGEuZnNNb2RpZmllZEF0ID8/IGEubW9kaWZpZWRBdCkpXG4gICAgY2FzZSAnY3JlYXRlZCc6IC8vIOaWh+S7tuezu+e7n+WIm+W7uuaXtumXtO+8jOe8uuWIl+WbnumAgOaLjeaRhC/mm7TmlrDml7bpl7RcbiAgICAgIHJldHVybiBieSgoYSwgYikgPT4gKGIuZnNDcmVhdGVkQXQgPz8gYi5jcmVhdGVkQXQpIC0gKGEuZnNDcmVhdGVkQXQgPz8gYS5jcmVhdGVkQXQpKVxuICAgIGNhc2UgJ2V4dGVuc2lvbic6XG4gICAgICByZXR1cm4gYnkoKGEsIGIpID0+IGV4dE9mKGEpLmxvY2FsZUNvbXBhcmUoZXh0T2YoYikpIHx8IGEuZmlsZU5hbWUubG9jYWxlQ29tcGFyZShiLmZpbGVOYW1lKSlcbiAgICBjYXNlICdzaXplJzpcbiAgICAgIHJldHVybiBieSgoYSwgYikgPT4gYi5maWxlU2l6ZSAtIGEuZmlsZVNpemUpXG4gICAgY2FzZSAnZGltZW5zaW9ucyc6XG4gICAgICByZXR1cm4gYnkoKGEsIGIpID0+IHBpeGVsc09mKGIpIC0gcGl4ZWxzT2YoYSkpXG4gICAgY2FzZSAncmF0aW5nJzpcbiAgICAgIHJldHVybiBieSgoYSwgYikgPT4gYi5yYXRpbmcgLSBhLnJhdGluZylcbiAgICBjYXNlICdkdXJhdGlvbic6XG4gICAgICByZXR1cm4gYnkoKGEsIGIpID0+IChiLmR1cmF0aW9uTXMgPz8gMCkgLSAoYS5kdXJhdGlvbk1zID8/IDApKVxuICAgIGRlZmF1bHQ6IC8vIGltcG9ydGVk77yI572u6aG25LuN5LyY5YWI77yM57uE5YaF5L+d5oyB5a+85YWl5bqP77yJXG4gICAgICByZXR1cm4gWy4uLnBob3Rvc10uc29ydCgoYSwgYikgPT4gTnVtYmVyKCEhYi5waW5uZWRBdCkgLSBOdW1iZXIoISFhLnBpbm5lZEF0KSlcbiAgfVxufVxuXG4vLyDilIDilIAg55u45Ly857uT5p6c5rGg77yI55SxIHVzZUR1cGxpY2F0ZVNjYW4g5Y+N5ZCR5rOo5YWl77yM6YG/5YWN5b6q546v5L6d6LWW77yJ4pSA4pSAXG5cbmNvbnN0IHNpbWlsYXJNYXRjaGVzID0gcmVmPFBob3RvW10+KFtdKVxuY29uc3Qgc2ltaWxhclNvdXJjZU5hbWUgPSByZWYoJycpXG5cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsU2VhcmNoUG9vbHMoKToge1xuICBzaW1pbGFyTWF0Y2hlczogdHlwZW9mIHNpbWlsYXJNYXRjaGVzXG4gIHNpbWlsYXJTb3VyY2VOYW1lOiB0eXBlb2Ygc2ltaWxhclNvdXJjZU5hbWVcbn0ge1xuICByZXR1cm4geyBzaW1pbGFyTWF0Y2hlcywgc2ltaWxhclNvdXJjZU5hbWUgfVxufVxuXG4vKipcbiAqIMKnMi5DIOmaj+acuuaooeW8j+eos+WumuWMlu+8muS7heWcqOOAjOinhuWbvuWAmemAieaxoOaIkOWRmOOAjeWPmOWMluaXtumHjeaWsOa0l+eJjO+8jFxuICog5pS5562b6YCJL+aOkuW6jy/lhbPplK7or43nrYnkuI3ph43mjpLvvIzpgb/lhY3mr4/mrKEgY29tcHV0ZWQg6YeN566X6YO96YeN5paw5Lmx5bqP5a+86Ie06Lez5Yqo44CCXG4gKi9cbmxldCBzaHVmZmxlS2V5ID0gJydcbmxldCBzaHVmZmxlSWRzOiBzdHJpbmdbXSA9IFtdXG5cbi8qKlxuICog5Luj56CB5a6h5p+lIFMy77ya6L276YeP5rGg5oyH57q55pu/5LujIGBwb29sLm1hcChpZCkuam9pbignfCcpYO+8iDUg5LiH5p2hIOKJiCAzMCDkuIflrZfnrKbnmoRcbiAqIE8oTikg5ou85o6lICsg5aSn5a2X56ym5Liy5q+U6L6D77yJ44CC6aaWL+WwviArIDgg562J6Led6YeH5qC377yM56Kw5pKe5qaC546H5p6B5L2O5LiU5Y2z5L2/56Kw5pKeXG4gKiDkuZ/lj6rmmK/lsJHkuIDmrKHph43mjpLvvIzkuI3lvbHlk43mraPnoa7mgKfjgIJcbiAqL1xuZnVuY3Rpb24gcG9vbEZpbmdlcnByaW50KHBvb2w6IFBob3RvW10pOiBzdHJpbmcge1xuICBpZiAocG9vbC5sZW5ndGggPT09IDApIHJldHVybiAnMCdcbiAgbGV0IGYgPSBgJHtwb29sLmxlbmd0aH06JHtwb29sWzBdLmlkfToke3Bvb2xbcG9vbC5sZW5ndGggLSAxXS5pZH1gXG4gIGNvbnN0IHN0ZXAgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKHBvb2wubGVuZ3RoIC8gOCkpXG4gIGZvciAobGV0IGkgPSBzdGVwOyBpIDwgcG9vbC5sZW5ndGg7IGkgKz0gc3RlcCkgZiArPSBgOiR7cG9vbFtpXS5pZH1gXG4gIHJldHVybiBmXG59XG5cbmZ1bmN0aW9uIHN0YWJsZVNodWZmbGVPcmRlcihwb29sOiBQaG90b1tdKTogc3RyaW5nW10ge1xuICBjb25zdCBrZXkgPSBwb29sRmluZ2VycHJpbnQocG9vbClcbiAgaWYgKGtleSAhPT0gc2h1ZmZsZUtleSkge1xuICAgIHNodWZmbGVJZHMgPSBwb29sLm1hcCgocCkgPT4gcC5pZClcbiAgICBmb3IgKGxldCBpID0gc2h1ZmZsZUlkcy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICBjb25zdCBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGkgKyAxKSlcbiAgICAgIDtbc2h1ZmZsZUlkc1tpXSwgc2h1ZmZsZUlkc1tqXV0gPSBbc2h1ZmZsZUlkc1tqXSwgc2h1ZmZsZUlkc1tpXV1cbiAgICB9XG4gICAgc2h1ZmZsZUtleSA9IGtleVxuICB9XG4gIHJldHVybiBzaHVmZmxlSWRzXG59XG5cbmZ1bmN0aW9uIGJ1aWxkKCkge1xuICBjb25zdCB0YWJzID0gdXNlTGlicmFyeVRhYnMoKVxuICBjb25zdCBkYXRhID0gdXNlUGhvdG9EYXRhKClcbiAgLyoqIOS6jOWNgeS4g+i9ru+8muaQnOe0ouiMg+WbtO+8iEVhZ2xlIMuFIOmdouadv+WLvumAiembhu+8m+aooeWdl+WNleS+iyByZWbvvIzli77pgInljbPop6blj5Hnu5Pmnpzph43nrpfvvIkgKi9cbiAgY29uc3Qgc2VhcmNoU2NvcGVzID0gdXNlU2VhcmNoU2NvcGVzKClcblxuICAvKiog5rS75YqoIHRhYu+8iGNvbXB1dGVkIOW8leeUqO+8jOWIhyB0YWIg6Ieq5Yqo6Lef6ZqP77yJICovXG4gIGNvbnN0IHRhYiA9IGNvbXB1dGVkKCgpID0+IHRhYnMuYWN0aXZlKVxuXG4gIC8vIOKUgOKUgCDop4blm77liIbmlK8g4pSA4pSAXG4gIGNvbnN0IGlzVHJhc2hWaWV3ID0gY29tcHV0ZWQoKCkgPT4gdGFiLnZhbHVlLnZpZXcgPT09ICd0cmFzaCcpXG4gIGNvbnN0IGlzTWFwVmlldyA9IGNvbXB1dGVkKCgpID0+IHRhYi52YWx1ZS52aWV3ID09PSAnbWFwJylcbiAgY29uc3QgaXNEdXBsaWNhdGVWaWV3ID0gY29tcHV0ZWQoKCkgPT4gdGFiLnZhbHVlLnZpZXcgPT09ICdkdXBsaWNhdGVzJylcbiAgY29uc3QgaXNTaW1pbGFyVmlldyA9IGNvbXB1dGVkKCgpID0+IHRhYi52YWx1ZS52aWV3LnN0YXJ0c1dpdGgoJ3NpbWlsYXI6JykpXG4gIGNvbnN0IGFjdGl2ZUFsYnVtSWQgPSBjb21wdXRlZCgoKSA9PlxuICAgIHRhYi52YWx1ZS52aWV3LnN0YXJ0c1dpdGgoJ2FsYnVtOicpID8gdGFiLnZhbHVlLnZpZXcuc2xpY2UoNikgOiBudWxsXG4gIClcbiAgY29uc3QgYWN0aXZlQWxidW0gPSBjb21wdXRlZChcbiAgICAoKSA9PiBkYXRhLmFsYnVtcy52YWx1ZS5maW5kKChhKSA9PiBhLmlkID09PSBhY3RpdmVBbGJ1bUlkLnZhbHVlKSA/PyBudWxsXG4gIClcbiAgY29uc3QgYWN0aXZlRm9sZGVySWQgPSBjb21wdXRlZCgoKSA9PlxuICAgIHRhYi52YWx1ZS52aWV3LnN0YXJ0c1dpdGgoJ2ZvbGRlcjonKSA/IHRhYi52YWx1ZS52aWV3LnNsaWNlKDcpIDogbnVsbFxuICApXG4gIGNvbnN0IGFjdGl2ZUZvbGRlciA9IGNvbXB1dGVkKFxuICAgICgpID0+IGRhdGEuZm9sZGVycy52YWx1ZS5maW5kKChmKSA9PiBmLmlkID09PSBhY3RpdmVGb2xkZXJJZC52YWx1ZSkgPz8gbnVsbFxuICApXG4gIGNvbnN0IGFjdGl2ZVNtYXJ0QWxidW1JZCA9IGNvbXB1dGVkKCgpID0+XG4gICAgdGFiLnZhbHVlLnZpZXcuc3RhcnRzV2l0aCgnc21hcnQ6JykgPyB0YWIudmFsdWUudmlldy5zbGljZSg2KSA6IG51bGxcbiAgKVxuICBjb25zdCBhY3RpdmVTbWFydEFsYnVtID0gY29tcHV0ZWQoXG4gICAgKCkgPT4gZGF0YS5zbWFydEFsYnVtcy52YWx1ZS5maW5kKChhKSA9PiBhLmlkID09PSBhY3RpdmVTbWFydEFsYnVtSWQudmFsdWUpID8/IG51bGxcbiAgKVxuXG4gIC8vIOKUgOKUgCDljYHkuozova7vvJrmlofku7blpLnni6znq4vop4blm77orr7nva7vvIhtMDA177yM5a+56b2QIEVhZ2xlIOavj+aWh+S7tuWkueimhueblu+8ieKUgOKUgFxuXG4gIC8qKiDnlJ/mlYjluIPlsYDvvJrmlofku7blpLnopobnm5bkvJjlhYjkuo7lhajlsYAgKi9cbiAgY29uc3Qgdmlld0xheW91dCA9IGNvbXB1dGVkPExpYnJhcnlMYXlvdXQ+KCgpID0+IHtcbiAgICBjb25zdCBvID0gYWN0aXZlRm9sZGVyLnZhbHVlPy52aWV3TGF5b3V0XG4gICAgcmV0dXJuIG8gJiYgbyAhPT0gJ2dsb2JhbCcgPyAobyBhcyBMaWJyYXJ5TGF5b3V0KSA6IHRhYi52YWx1ZS5sYXlvdXRcbiAgfSlcbiAgLyoqIOeUn+aViOaOkuWIl++8muaWh+S7tuWkueimhuebluS8mOWFiOS6juWFqOWxgCAqL1xuICBjb25zdCB2aWV3U29ydEJ5ID0gY29tcHV0ZWQ8TGlicmFyeVNvcnQ+KCgpID0+IHtcbiAgICBjb25zdCBvID0gYWN0aXZlRm9sZGVyLnZhbHVlPy52aWV3U29ydFxuICAgIHJldHVybiBvICYmIG8gIT09ICdnbG9iYWwnID8gKG8gYXMgTGlicmFyeVNvcnQpIDogdGFiLnZhbHVlLnNvcnRCeVxuICB9KVxuICAvKiog55Sf5pWI5pi+56S65byA5YWz77ya5paH5Lu25aS5IEpTT04g6KaG55uW6YCQ6ZSu5ZCI5bm25LqO5YWo5bGAICovXG4gIGNvbnN0IHZpZXdEaXNwbGF5ID0gY29tcHV0ZWQ8RGlzcGxheU9wdGlvbnM+KCgpID0+IHtcbiAgICBjb25zdCByYXcgPSBhY3RpdmVGb2xkZXIudmFsdWU/LnZpZXdEaXNwbGF5XG4gICAgaWYgKCFyYXcpIHJldHVybiB0YWIudmFsdWUuZGlzcGxheVxuICAgIHRyeSB7XG4gICAgICByZXR1cm4geyAuLi50YWIudmFsdWUuZGlzcGxheSwgLi4uKEpTT04ucGFyc2UocmF3KSBhcyBQYXJ0aWFsPERpc3BsYXlPcHRpb25zPikgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRhYi52YWx1ZS5kaXNwbGF5XG4gICAgfVxuICB9KVxuXG4gIC8qKiDmkJzntKLmqKHlvI/vvJrmnInlhbPplK7or43kuJTkuI3mmK/lm57mlLbnq5kv5p+l6YeNL+ebuOS8vOetieS4k+eUqOinhuWbviAqL1xuICBjb25zdCBpc1NlYXJjaE1vZGUgPSBjb21wdXRlZChcbiAgICAoKSA9PlxuICAgICAgISF0YWIudmFsdWUuc2VhcmNoS2V5d29yZC50cmltKCkgJiZcbiAgICAgICFpc1RyYXNoVmlldy52YWx1ZSAmJlxuICAgICAgIWlzRHVwbGljYXRlVmlldy52YWx1ZSAmJlxuICAgICAgIWlzU2ltaWxhclZpZXcudmFsdWVcbiAgKVxuXG4gIC8qKiDnrZvpgInlmajlj6/op4HmgKfvvIh0cmFzaC/mn6Xph40v55u45Ly85LiN5pi+56S65b+r562b77yJICovXG4gIGNvbnN0IHNob3dGaWx0ZXJzID0gY29tcHV0ZWQoXG4gICAgKCkgPT4gIWlzVHJhc2hWaWV3LnZhbHVlICYmICFpc0R1cGxpY2F0ZVZpZXcudmFsdWUgJiYgIWlzU2ltaWxhclZpZXcudmFsdWVcbiAgKVxuXG4gIC8vIOKUgOKUgCDlv6vnrZvljLnphY0g4pSA4pSAXG5cbiAgZnVuY3Rpb24gbWF0Y2hLaW5kKHA6IFBob3RvKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICF0YWIudmFsdWUua2luZEZpbHRlciB8fCBwLmtpbmQgPT09IHRhYi52YWx1ZS5raW5kRmlsdGVyXG4gIH1cblxuICBmdW5jdGlvbiBtYXRjaENvbG9yKHA6IFBob3RvKTogYm9vbGVhbiB7XG4gICAgY29uc3QgY2xvc2UgPSB0YWIudmFsdWUuY29sb3JDbG9zZVxuICAgIGlmIChjbG9zZSkge1xuICAgICAgLy8g6L+R5Ly86Imy5qGj5LiO5Li76L+b56iLIGNvbG9yX2Nsb3NlKCkg5b+F6aG75ZCM5Y+j5b6E77yI5ZCM5LiA5Lu9IEBzaGFyZWQvY29sb3JNYXRjaO+8ie+8mlxuICAgICAgLy8g5Lik5p2h6Lev5b6E5LiN5LiA6Ie05bCx5Lya44CM5YiH5LiA5LiL5YiG6aG15byA5YWz77yM5ZCM5LiA562b6YCJ55qE57uT5p6c5Y+Y5LqG44CNXG4gICAgICBjb25zdCBjb2xvcnMgPSBbcC5jb2xvckRvbWluYW50LCAuLi4ocC5wYWxldHRlID8/IFtdKV0uZmlsdGVyKChjKTogYyBpcyBzdHJpbmcgPT4gISFjKVxuICAgICAgcmV0dXJuIGNvbG9yTGlzdENsb3NlVG8oY29sb3JzLCBjbG9zZS5oZXgsIGFjY3VyYWN5VG9NYXhEZWx0YShjbG9zZS5hY2N1cmFjeSkpXG4gICAgfVxuICAgIGlmICghdGFiLnZhbHVlLmNvbG9yRmlsdGVyKSByZXR1cm4gdHJ1ZVxuICAgIHJldHVybiAhIXAuY29sb3JEb21pbmFudCAmJiBodWVCdWNrZXRPZihwLmNvbG9yRG9taW5hbnQpID09PSB0YWIudmFsdWUuY29sb3JGaWx0ZXJcbiAgfVxuXG4gIC8qKiDkuozljYHlha3ova7vvJrnsr7noa7or4TliIblpJrpgInvvIjlkKsgMD3lsJrmnKror4TliIbvvJvnqbrpm4bkuI3pmZDvvJvmjpLpmaTpm4bkvJjlhYjkuo7jgIzlsJrmnKror4TliIbjgI3lpJbnmoTliKTmlq3vvIkgKi9cbiAgZnVuY3Rpb24gbWF0Y2hSYXRpbmcocDogUGhvdG8pOiBib29sZWFuIHtcbiAgICBjb25zdCBpbmMgPSB0YWIudmFsdWUucmF0aW5nSW5jbHVkZVxuICAgIGlmIChpbmMubGVuZ3RoID4gMCkgcmV0dXJuIGluYy5pbmNsdWRlcyhwLnJhdGluZylcbiAgICBjb25zdCBleCA9IHRhYi52YWx1ZS5yYXRpbmdFeGNsdWRlXG4gICAgcmV0dXJuIGV4Lmxlbmd0aCA9PT0gMCB8fCAhZXguaW5jbHVkZXMocC5yYXRpbmcpXG4gIH1cblxuICAvKiogwqcyLkMg5paH5Lu25aSn5bCP5Yy66Ze077yI5a2X6IqC77yJICovXG4gIGZ1bmN0aW9uIG1hdGNoU2l6ZShwOiBQaG90byk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHIgPSB0YWIudmFsdWUuc2l6ZVJhbmdlXG4gICAgaWYgKCFyKSByZXR1cm4gdHJ1ZVxuICAgIGNvbnN0IFttaW4sIG1heF0gPSByXG4gICAgaWYgKG1pbiA+IDAgJiYgcC5maWxlU2l6ZSA8IG1pbikgcmV0dXJuIGZhbHNlXG4gICAgaWYgKG1heCA+IDAgJiYgcC5maWxlU2l6ZSA+IG1heCkgcmV0dXJuIGZhbHNlXG4gICAgcmV0dXJuIHRydWVcbiAgfVxuXG4gIC8qKiDkuozljYHlha3ova7vvJrlvaLnirblpJrpgInljIXlkKsv5o6S6ZmkICsg5q+U5L6L562b6YCJ77yIRWFnbGUg5b2i54q25by55bGC6K+t5LmJ77yJICovXG4gIGZ1bmN0aW9uIG1hdGNoU2hhcGUocDogUGhvdG8pOiBib29sZWFuIHtcbiAgICBjb25zdCByID0gdGFiLnZhbHVlLnJhdGlvRmlsdGVyXG4gICAgY29uc3QgZXggPSB0YWIudmFsdWUuc2hhcGVFeGNsdWRlXG4gICAgY29uc3QgaW5jID0gdGFiLnZhbHVlLnNoYXBlSW5jbHVkZVxuICAgIGlmIChyKSB7XG4gICAgICAvLyDmr5TkvovnrZvpgInkuI7mqKov56uW5b2S57G75Y+g5Yqg55Sf5pWI77yIQU5E77yM5a6h5p+lIE0577ya5bm26Z2e5ZG95Lit5Y2z6YCa6L+H77yJXG4gICAgICBpZiAoIXJhdGlvTWF0Y2hlcyhwLCByKSkgcmV0dXJuIGZhbHNlXG4gICAgfVxuICAgIGNvbnN0IHYgPSBzaGFwZU9mKHApXG4gICAgaWYgKHYgJiYgZXguaW5jbHVkZXModikpIHJldHVybiBmYWxzZVxuICAgIGlmIChpbmMubGVuZ3RoID4gMCkgcmV0dXJuIHYgIT09IG51bGwgJiYgaW5jLmluY2x1ZGVzKHYpXG4gICAgcmV0dXJuIHRydWVcbiAgfVxuXG4gIC8qKiDCpzIuQyDmoIfnrb7lpJrpgInvvIhBTkQvT1Ig6YC76L6R5Y+v5YiH77yM5LqM5Y2B5YWt6L2u77yaKyBFYWdsZeOAjOetieWQjOOAjT0g5qCH562+6ZuG5ZCI5a6M5YWo5LiA6Ie077yJ77yb5o6S6Zmk5qCH562+ICsg5LuF55yL5pyq5qCH562+ICovXG4gIGZ1bmN0aW9uIG1hdGNoVGFncyhwOiBQaG90byk6IGJvb2xlYW4ge1xuICAgIGlmICh0YWIudmFsdWUudW50YWdnZWRPbmx5ICYmIHAudGFncy5sZW5ndGggPiAwKSByZXR1cm4gZmFsc2VcbiAgICBjb25zdCBleCA9IHRhYi52YWx1ZS50YWdFeGNsdWRlXG4gICAgaWYgKGV4Lmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGV4TG93ZXIgPSBleC5tYXAoKGUpID0+IGUudG9Mb3dlckNhc2UoKSlcbiAgICAgIGlmIChwLnRhZ3Muc29tZSgocHQpID0+IGV4TG93ZXIuaW5jbHVkZXMocHQudG9Mb3dlckNhc2UoKSkpKSByZXR1cm4gZmFsc2VcbiAgICB9XG4gICAgY29uc3QgdCA9IHRhYi52YWx1ZS50YWdGaWx0ZXJcbiAgICBpZiAoIXQgfHwgdC5sZW5ndGggPT09IDApIHJldHVybiB0cnVlXG4gICAgY29uc3QgaGFzID0gKHRhZzogc3RyaW5nKTogYm9vbGVhbiA9PlxuICAgICAgcC50YWdzLnNvbWUoKHB0KSA9PiBwdC50b0xvd2VyQ2FzZSgpID09PSB0YWcudG9Mb3dlckNhc2UoKSlcbiAgICBpZiAodGFiLnZhbHVlLnRhZ01hdGNoRXhhY3QpIHtcbiAgICAgIC8vIEVhZ2xlIGljLWxvZ2ljLWVxdWFs77ya57Sg5p2Q5qCH562+6ZuG5ZCI5LiO6YCJ5Lit6ZuG5ZCI5a6M5YWo5LiA6Ie0XG4gICAgICBpZiAocC50YWdzLmxlbmd0aCAhPT0gdC5sZW5ndGgpIHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuIHQuZXZlcnkoaGFzKVxuICAgIH1cbiAgICByZXR1cm4gdGFiLnZhbHVlLnRhZ01hdGNoQW55ID8gdC5zb21lKGhhcykgOiB0LmV2ZXJ5KGhhcylcbiAgfVxuXG4gIC8qKiDCpzIuQyDmjpLpmaTlhbPplK7or40gKi9cbiAgZnVuY3Rpb24gbWF0Y2hFeGNsdWRlKHA6IFBob3RvKTogYm9vbGVhbiB7XG4gICAgY29uc3Qga3cgPSB0YWIudmFsdWUuZXhjbHVkZUtleXdvcmQudHJpbSgpLnRvTG93ZXJDYXNlKClcbiAgICBpZiAoIWt3KSByZXR1cm4gdHJ1ZVxuICAgIHJldHVybiAhKFxuICAgICAgcC5maWxlTmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGt3KSB8fFxuICAgICAgKHAuZGVzY3JpcHRpb24gPz8gJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoa3cpIHx8XG4gICAgICBwLnRhZ3Muc29tZSgodCkgPT4gdC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGt3KSlcbiAgICApXG4gIH1cblxuICAvKiogwqcyLkMg6Ieq5a6a5LmJ5pe26Ze05Yy66Ze077yI5oyJ5a+85YWl5pe26Ze077yJICovXG4gIGZ1bmN0aW9uIG1hdGNoQ3VzdG9tVGltZShwOiBQaG90byk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IGMgPSB0YWIudmFsdWUuY3VzdG9tVGltZVxuICAgIGlmICghYykgcmV0dXJuIHRydWVcbiAgICBjb25zdCBbZnJvbSwgdG9dID0gY1xuICAgIGlmIChmcm9tID4gMCAmJiBwLmltcG9ydGVkQXQgPCBmcm9tKSByZXR1cm4gZmFsc2VcbiAgICBpZiAodG8gPiAwICYmIHAuaW1wb3J0ZWRBdCA+IHRvKSByZXR1cm4gZmFsc2VcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgLyoqIEQtMDEyIOaXtumVv+WMuumXtO+8iG1z77yJICovXG4gIGZ1bmN0aW9uIG1hdGNoRHVyYXRpb24ocDogUGhvdG8pOiBib29sZWFuIHtcbiAgICBjb25zdCByID0gdGFiLnZhbHVlLmR1cmF0aW9uUmFuZ2VcbiAgICBpZiAoIXIpIHJldHVybiB0cnVlXG4gICAgY29uc3QgW21pbiwgbWF4XSA9IHJcbiAgICBjb25zdCBkID0gcC5kdXJhdGlvbk1zXG4gICAgaWYgKGQgPT0gbnVsbCkgcmV0dXJuIGZhbHNlXG4gICAgaWYgKG1pbiA+IDAgJiYgZCA8IG1pbikgcmV0dXJuIGZhbHNlXG4gICAgaWYgKG1heCA+IDAgJiYgZCA+IG1heCkgcmV0dXJuIGZhbHNlXG4gICAgcmV0dXJuIHRydWVcbiAgfVxuXG4gIC8qKiBELTAxMiDmj4/ov7Av5aSH5rOo5YWz6ZSu6K+N77yI4pGk77ya5pSv5oyBIEVhZ2xl44CM5a6M5YWo55u4562J44CN6YC76L6R77yJICovXG4gIGZ1bmN0aW9uIG1hdGNoTm90ZUtleXdvcmQocDogUGhvdG8pOiBib29sZWFuIHtcbiAgICBjb25zdCBrdyA9IHRhYi52YWx1ZS5ub3RlS2V5d29yZC50cmltKCkudG9Mb3dlckNhc2UoKVxuICAgIGlmICgha3cpIHJldHVybiB0cnVlXG4gICAgY29uc3QgZGVzYyA9IChwLmRlc2NyaXB0aW9uID8/ICcnKS50b0xvd2VyQ2FzZSgpXG4gICAgcmV0dXJuIHRhYi52YWx1ZS5ub3RlS2V5d29yZEV4YWN0ID8gZGVzYyA9PT0ga3cgOiBkZXNjLmluY2x1ZGVzKGt3KVxuICB9XG5cbiAgLyoqIEQtMDEyIOaWh+S7tuWkueetm+mAie+8iCcnID0g5LiN6ZmQ77yMJ25vbmUnID0g5pyq5YiG57G777yJ77yb5LqU6L2u77ya5aSa6YCJ5bm2L+S6pCArIOaOkumZpCAqL1xuICBmdW5jdGlvbiBtYXRjaEZvbGRlckZpbHRlcihwOiBQaG90byk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IGV4ID0gdGFiLnZhbHVlLmZvbGRlckV4Y2x1ZGVJZHNcbiAgICBpZiAoZXgubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKHAuZm9sZGVySWQgPT0gbnVsbCkge1xuICAgICAgICBpZiAoZXguaW5jbHVkZXMoJ25vbmUnKSkgcmV0dXJuIGZhbHNlXG4gICAgICB9IGVsc2UgaWYgKGV4LmluY2x1ZGVzKHAuZm9sZGVySWQpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpZHMgPSB0YWIudmFsdWUuZm9sZGVyRmlsdGVySWRzXG4gICAgaWYgKGlkcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBpblNldCA9IChpZDogc3RyaW5nKTogYm9vbGVhbiA9PlxuICAgICAgICBpZCA9PT0gJ25vbmUnID8gcC5mb2xkZXJJZCA9PSBudWxsIDogcC5mb2xkZXJJZCA9PT0gaWRcbiAgICAgIHJldHVybiB0YWIudmFsdWUuZm9sZGVyTWF0Y2hBbGwgPyBpZHMuZXZlcnkoaW5TZXQpIDogaWRzLnNvbWUoaW5TZXQpXG4gICAgfVxuICAgIGNvbnN0IGYgPSB0YWIudmFsdWUuZm9sZGVyRmlsdGVyXG4gICAgaWYgKCFmKSByZXR1cm4gdHJ1ZVxuICAgIGlmIChmID09PSAnbm9uZScpIHJldHVybiBwLmZvbGRlcklkID09IG51bGxcbiAgICByZXR1cm4gcC5mb2xkZXJJZCA9PT0gZlxuICB9XG5cbiAgLyoqIEQtMDEyIOS/ruaUueaXpeacn+WMuumXtO+8iOaMieaWh+S7tuezu+e7n+S/ruaUueaXtumXtO+8jOe8uuWIl+inhuS4uuS4jeWMuemFje+8iSAqL1xuICBmdW5jdGlvbiBtYXRjaE1vZGlmaWVkVGltZShwOiBQaG90byk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHIgPSB0YWIudmFsdWUubW9kaWZpZWRUaW1lUmFuZ2VcbiAgICBpZiAoIXIpIHJldHVybiB0cnVlXG4gICAgY29uc3QgW2Zyb20sIHRvXSA9IHJcbiAgICBjb25zdCBtID0gcC5mc01vZGlmaWVkQXRcbiAgICBpZiAobSA9PSBudWxsKSByZXR1cm4gZmFsc2VcbiAgICBpZiAoZnJvbSA+IDAgJiYgbSA8IGZyb20pIHJldHVybiBmYWxzZVxuICAgIGlmICh0byA+IDAgJiYgbSA+IHRvKSByZXR1cm4gZmFsc2VcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgLyoqIOS6jOWNgeWFrei9ru+8mumTvuaOpeetm+mAie+8iOKRpO+8muaUr+aMgSBFYWdsZeOAjOWujOWFqOebuOetieOAjemAu+i+ke+8iSAqL1xuICBmdW5jdGlvbiBtYXRjaFVybEtleXdvcmQocDogUGhvdG8pOiBib29sZWFuIHtcbiAgICBjb25zdCBrdyA9IHRhYi52YWx1ZS51cmxLZXl3b3JkLnRyaW0oKS50b0xvd2VyQ2FzZSgpXG4gICAgaWYgKCFrdykgcmV0dXJuIHRydWVcbiAgICBjb25zdCB1cmwgPSAocC5zb3VyY2VVcmwgPz8gJycpLnRvTG93ZXJDYXNlKClcbiAgICByZXR1cm4gdGFiLnZhbHVlLnVybEtleXdvcmRFeGFjdCA/IHVybCA9PT0ga3cgOiB1cmwuaW5jbHVkZXMoa3cpXG4gIH1cblxuICBmdW5jdGlvbiBtYXRjaFF1aWNrKHA6IFBob3RvKTogYm9vbGVhbiB7XG4gICAgaWYgKHRhYi52YWx1ZS5yZXNvbHV0aW9uRmlsdGVyKSB7XG4gICAgICBjb25zdCBtaW4gPSBSRVNPTFVUSU9OX01JTlt0YWIudmFsdWUucmVzb2x1dGlvbkZpbHRlcl1cbiAgICAgIGlmIChNYXRoLm1heChwLndpZHRoID8/IDAsIHAuaGVpZ2h0ID8/IDApIDwgbWluKSByZXR1cm4gZmFsc2VcbiAgICB9XG4gICAgaWYgKHRhYi52YWx1ZS50aW1lRmlsdGVyKSB7XG4gICAgICAvLyDlhavova7vvJrlr7npvZAgRWFnbGUg562b6YCJ6YCJ6aG577yI5LuK5pelL+aYqOaXpS/mnIDov5EgNy8zMC85MC8zNjUg5pel77yJXG4gICAgICBpZiAoIW1hdGNoSW1wb3J0VGltZVByZXNldChwLCB0YWIudmFsdWUudGltZUZpbHRlcikpIHJldHVybiBmYWxzZVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgLyoqIOS6jOWNgeWFrei9ru+8muagvOW8j+WkmumAieWMheWQqy/mjpLpmaTvvIhFYWdsZSDmoLzlvI/lvLnlsYIg5bem6ZSu6YCJ5oupL+WPs+mUruaOkumZpO+8iSAqL1xuICBmdW5jdGlvbiBtYXRjaEZvcm1hdChwOiBQaG90byk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IGV4dCA9IGV4dE9mRmlsZShwKVxuICAgIGNvbnN0IGV4ID0gdGFiLnZhbHVlLmZvcm1hdEV4Y2x1ZGVcbiAgICBpZiAoZXgubGVuZ3RoID4gMCAmJiBleC5pbmNsdWRlcyhleHQpKSByZXR1cm4gZmFsc2VcbiAgICBjb25zdCBpbmMgPSB0YWIudmFsdWUuZm9ybWF0SW5jbHVkZVxuICAgIGlmIChpbmMubGVuZ3RoID4gMCkgcmV0dXJuIGluYy5pbmNsdWRlcyhleHQpXG4gICAgcmV0dXJuIHRydWVcbiAgfVxuXG4gIC8qKiDlhajpg6jlv6vnrZvlj6DliqDvvJrnsbvlnosgKyDpopzoibIgKyDmoLzlvI8v5YiG6L6o546HL+aXtumXtCArIMKnMi5DIOajgOe0oumhuSArIEQtMDEyIOe7tOW6piAqL1xuICBmdW5jdGlvbiBtYXRjaEFsbChwOiBQaG90byk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAoXG4gICAgICBtYXRjaEtpbmQocCkgJiZcbiAgICAgIG1hdGNoQ29sb3IocCkgJiZcbiAgICAgIG1hdGNoRm9ybWF0KHApICYmXG4gICAgICBtYXRjaFF1aWNrKHApICYmXG4gICAgICBtYXRjaFJhdGluZyhwKSAmJlxuICAgICAgbWF0Y2hTaXplKHApICYmXG4gICAgICBtYXRjaFNoYXBlKHApICYmXG4gICAgICBtYXRjaFRhZ3MocCkgJiZcbiAgICAgIG1hdGNoRXhjbHVkZShwKSAmJlxuICAgICAgbWF0Y2hDdXN0b21UaW1lKHApICYmXG4gICAgICBtYXRjaER1cmF0aW9uKHApICYmXG4gICAgICBtYXRjaE5vdGVLZXl3b3JkKHApICYmXG4gICAgICBtYXRjaFVybEtleXdvcmQocCkgJiZcbiAgICAgIG1hdGNoRm9sZGVyRmlsdGVyKHApICYmXG4gICAgICBtYXRjaE1vZGlmaWVkVGltZShwKVxuICAgIClcbiAgfVxuXG4gIC8qKlxuICAgKiDkuozljYHlha3ova7vvJrku7vkuIDnu7TluqbnrZvpgInnlJ/mlYjvvIhFYWdsZSDnlJ/mlYjmgIHvvJrotJ/lkJEgdG9rZW4gLyDooYzlsL4g5L+d5a2YwrfplIHlrprCt+a4hemZpCAvXG4gICAqIOa8j+aWl+iTneeCuSAvIOmdouWMheWxkeOAjOaQnOe0oue7k+aenCAoTinjgI3nmoTliKTlrprmupDvvInjgILkuI3lkKvlhbPplK7or43mkJzntKLkuI7luIPlsYDmmL7npLrpobnjgIJcbiAgICovXG4gIGNvbnN0IGhhc0RpbWVuc2lvbkZpbHRlcnMgPSBjb21wdXRlZDxib29sZWFuPigoKSA9PiB7XG4gICAgY29uc3QgdCA9IHRhYi52YWx1ZVxuICAgIHJldHVybiAoXG4gICAgICAhIXQua2luZEZpbHRlciB8fFxuICAgICAgISF0LmNvbG9yRmlsdGVyIHx8XG4gICAgICAhIXQuY29sb3JDbG9zZSB8fFxuICAgICAgdC5mb3JtYXRJbmNsdWRlLmxlbmd0aCA+IDAgfHxcbiAgICAgIHQuZm9ybWF0RXhjbHVkZS5sZW5ndGggPiAwIHx8XG4gICAgICAhIXQucmVzb2x1dGlvbkZpbHRlciB8fFxuICAgICAgISF0LnRpbWVGaWx0ZXIgfHxcbiAgICAgIHQucmF0aW5nSW5jbHVkZS5sZW5ndGggPiAwIHx8XG4gICAgICB0LnJhdGluZ0V4Y2x1ZGUubGVuZ3RoID4gMCB8fFxuICAgICAgISF0LnNpemVSYW5nZSB8fFxuICAgICAgdC5zaGFwZUluY2x1ZGUubGVuZ3RoID4gMCB8fFxuICAgICAgdC5zaGFwZUV4Y2x1ZGUubGVuZ3RoID4gMCB8fFxuICAgICAgISF0LnJhdGlvRmlsdGVyIHx8XG4gICAgICB0LnRhZ0ZpbHRlci5sZW5ndGggPiAwIHx8XG4gICAgICB0LnRhZ0V4Y2x1ZGUubGVuZ3RoID4gMCB8fFxuICAgICAgdC51bnRhZ2dlZE9ubHkgfHxcbiAgICAgICEhdC5mb2xkZXJGaWx0ZXIgfHxcbiAgICAgIHQuZm9sZGVyRmlsdGVySWRzLmxlbmd0aCA+IDAgfHxcbiAgICAgIHQuZm9sZGVyRXhjbHVkZUlkcy5sZW5ndGggPiAwIHx8XG4gICAgICAhIXQuY3VzdG9tVGltZSB8fFxuICAgICAgISF0Lm1vZGlmaWVkVGltZVJhbmdlIHx8XG4gICAgICAhIXQuZHVyYXRpb25SYW5nZSB8fFxuICAgICAgISF0Lm5vdGVLZXl3b3JkIHx8XG4gICAgICAhIXQudXJsS2V5d29yZCB8fFxuICAgICAgISF0LmV4Y2x1ZGVLZXl3b3JkXG4gICAgKVxuICB9KVxuXG4gIC8vIOKUgOKUgCDliIbpobXljJbpmLbmrrUgMu+8muS4u+inhuWbvuWIhumhtemXqOaOp++8iGRvY3MvUEFHSU5BVElPTl9ERVNJR04ubWTvvInilIDilIBcbiAgLy8g5LuF5b2T44CM5peg57u05bqm562b6YCJICsg6Z2e5pCc57SiL+WcsOWbvi/mn6Xph40v55u45Ly8L+maj+acui9BSSDop4blm77jgI3ml7bvvIzkuLvmsaDlj6/nqpflj6Plj5bmlbBcbiAgLy8g77yIaW1wb3J0ZWRfYXQg5rWB5bqP5LiO5YWo6YeP6Lev5b6E5LiA6Ie077yM5bGV56S66K+t5LmJ6YCQ5a2X6IqC55u45ZCM77yJ44CCXG4gIC8vIOWcsOWbvi/mn6Xph40v55u45Ly85LuOIGFsbFBob3RvcyDmtL7nlJ/kuJPnlKjmsaDvvIzlv4Xpobvlhajph4/vvJvnrZvpgInmv4DmtLvljbPnv7vlgYfvvIxcbiAgLy8g57+76L2s5pe26Kem5Y+R5LiA5qyhIGxvYWRQaG90b3Mg5Zyo44CM56qX5Y+jIOKGlCDlhajph4/jgI3pl7TliIfmjaLvvIjlm57pgIDor63kuYnvvInjgIJcbiAgY29uc3QgY2FuUGFnZU1haW4gPSBjb21wdXRlZChcbiAgICAoKSA9PlxuICAgICAgLy8g6Zi25q61IDPvvJrnu7TluqbnrZvpgInlt7LkuIvmjqggU1FM77yIYnVpbGRGaWx0ZXJzU3BlYyDihpIgZ2V0UGFnZS5maWx0ZXJz77yJ77yMXG4gICAgICAvLyDkuI3lho3lm6DmraTpgIDlm57lhajph4/ot6/lvoTvvJvmkJzntKLop4blm77otbDlhajlsYDmkJzntKLmsaDliIbmlK9cbiAgICAgICFpc1NlYXJjaE1vZGUudmFsdWUgJiZcbiAgICAgICFpc01hcFZpZXcudmFsdWUgJiZcbiAgICAgICFpc0R1cGxpY2F0ZVZpZXcudmFsdWUgJiZcbiAgICAgICFpc1NpbWlsYXJWaWV3LnZhbHVlICYmXG4gICAgICAhaXNUcmFzaFZpZXcudmFsdWUgJiZcbiAgICAgICF0YWIudmFsdWUuc2h1ZmZsZSAmJlxuICAgICAgdGFiLnZhbHVlLnZpZXcgIT09ICdyYW5kb20nXG4gIClcbiAgLy8g6Z2Z5oCB5Zue5rua5byA5YWz77yI6K6+6K6h5paH5qGj5LiN5Y+Y5byPICM077yJ77yabG9jYWxTdG9yYWdlIOe9riAnbGVhZjp1c2UtcGFnZWQtbWFpbic9JzAnXG4gIC8vIOW8uuWItui1sOWFqOmHj+i3r+W+hO+8m+WKqOaAgemXqOaOp+i0n+i0o+etm+mAiea/gOa0u+aXtueahOiHquWKqOWIh+aNolxuICAvLyDpmLbmrrUgM++8mummluW4p+azqOWFpeWIneWniyBzcGVj77yI5LiN6Kem5Y+R6YeN6L2977yJXG4gIGRhdGEuc2V0UGFnZWRGaWx0ZXJzKCgocykgPT4gKE9iamVjdC5rZXlzKHMpLmxlbmd0aCA+IDAgPyBzIDogdW5kZWZpbmVkKSkoYnVpbGRGaWx0ZXJzU3BlYygpKSlcbiAgLyoqXG4gICAqIOe7tOW6puetm+mAieWPmOWMliDihpIg6YeN6L2944CM5b2T5YmN5bGV56S655qE6YKj5Liq5YiG6aG15rGg44CN44CCXG4gICAqIOWbm+S4quaxoO+8iOS4uy/mlLbol48v5paH5Lu25aS5L+aQnOe0ou+8ieWFseeUqOWQjOS4gOS7vSBzcGVj77yIc2V0UGFnZWRGaWx0ZXJzIOazqOWFpe+8ie+8m+WIhuaUr+mhuuW6j1xuICAgKiDkuI4gZGlzcGxheVNlY3Rpb25zIOeahOaxoOS8mOWFiOe6p+S4gOiHtOKAlOKAlOaXqeWFiOWPqumHjei9veS4u+axoO+8jOaUtuiXjy/mlofku7blpLkv5pCc57Si6KeG5Zu+5LiLXG4gICAqIOeCueetm+mAiSBjaGlwIOS6rui1t+OAgee9keagvOS4jeWKqO+8iOmCo+S4ieS4quaxoOaXouS4jeS4i+aOqO+8jOWxleekuuWxguS5n+S4jeWGjeacrOWcsCBtYXRjaEFsbO+8ieOAglxuICAgKi9cbiAgY29uc3QgcmVsb2FkUGFnZWRQb29sRm9yU3BlYyA9ICgpOiB2b2lkID0+IHtcbiAgICBpZiAoaXNTZWFyY2hNb2RlLnZhbHVlKSB7XG4gICAgICAvLyDmkJzntKLmsaDopoHov57lhbPplK7or43kuIDotbfph43oo4XphY3vvJrlj6rkuIvlj5Hnu7TluqYgc3BlYyDkvJrkuKLmjokgc2VhcmNoS2V5d29yZC9BU1RcbiAgICAgIGNvbnN0IHEgPSB0YWIudmFsdWUuc2VhcmNoS2V5d29yZFxuICAgICAgaWYgKGRhdGEudXNlUGFnZWRTZWFyY2goKSkgdm9pZCBkYXRhLmxvYWRTZWFyY2hQYWdlKHRydWUsIHEsIGJ1aWxkU2VhcmNoU3BlYyhxKSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAodGFiLnZhbHVlLnZpZXcgPT09ICdmYXZvcml0ZXMnKSB7XG4gICAgICBpZiAoZGF0YS51c2VQYWdlZEZhdm9yaXRlcygpKSB2b2lkIGRhdGEubG9hZEZhdm9yaXRlc1BhZ2UodHJ1ZSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoYWN0aXZlRm9sZGVySWQudmFsdWUpIHtcbiAgICAgIGlmIChkYXRhLnVzZVBhZ2VkRm9sZGVyKCkpIHZvaWQgZGF0YS5sb2FkRm9sZGVyUGFnZSh0cnVlKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChjYW5QYWdlTWFpbi52YWx1ZSAmJiBkYXRhLm1haW5QYWdlZEFjdGl2ZS52YWx1ZSkgdm9pZCBkYXRhLmxvYWRQaG90b3MoKVxuICB9XG4gIC8vIOmYtuautSAz77ya57u05bqm562b6YCJ5Y+Y5YyWIOKGkiDms6jlhaUgc3BlYyDlubbph43ovb3liIbpobXmsaBcbiAgd2F0Y2goXG4gICAgKCkgPT4gSlNPTi5zdHJpbmdpZnkoYnVpbGRGaWx0ZXJzU3BlYygpKSxcbiAgICAoKSA9PiB7XG4gICAgICBjb25zdCBzcGVjID0gYnVpbGRGaWx0ZXJzU3BlYygpXG4gICAgICBkYXRhLnNldFBhZ2VkRmlsdGVycyhPYmplY3Qua2V5cyhzcGVjKS5sZW5ndGggPiAwID8gc3BlYyA6IHVuZGVmaW5lZClcbiAgICAgIC8vIOmdniBpbW1lZGlhdGXvvJrpppbluKfkuI3ph43ovb3vvIjlupTnlKjlkK/liqjoh6rkvJrliqDovb3vvInvvJvku4XnrZvpgInlj5jljJbml7bliIbpobXmgIHph43ovb1cbiAgICAgIHJlbG9hZFBhZ2VkUG9vbEZvclNwZWMoKVxuICAgIH1cbiAgKVxuICBkYXRhLnJlZ2lzdGVyTWFpblBhZ2VHYXRlKCgpID0+IHtcbiAgICB0cnkge1xuICAgICAgaWYgKGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdsZWFmOnVzZS1wYWdlZC1tYWluJykgPT09ICcwJykgcmV0dXJuIGZhbHNlXG4gICAgfSBjYXRjaCB7XG4gICAgICAvKiBsb2NhbFN0b3JhZ2Ug5LiN5Y+v55So5pe25oyJ5byA5YWz5byA5ZCv5aSE55CGICovXG4gICAgfVxuICAgIHJldHVybiBjYW5QYWdlTWFpbi52YWx1ZVxuICB9KVxuICB3YXRjaChjYW5QYWdlTWFpbiwgKG9uLCBvZmYpID0+IHtcbiAgICBpZiAob24gIT09IG9mZikgdm9pZCBkYXRhLmxvYWRQaG90b3MoKVxuICB9KVxuXG4gIC8vIOKUgOKUgCDnv7vpobXmsaDvvIjop4blm77lgJnpgInmsaDvvIzmnKrlj6DliqDlv6vnrZvvvInilIDilIBcblxuICBjb25zdCBjdXJyZW50UG9vbCA9IGNvbXB1dGVkPFBob3RvW10+KCgpID0+IHtcbiAgICBpZiAoaXNNYXBWaWV3LnZhbHVlKSB7XG4gICAgICByZXR1cm4gZGF0YS5hbGxQaG90b3MudmFsdWUuZmlsdGVyKChwKSA9PiBwLmxhdGl0dWRlICE9IG51bGwgJiYgcC5sb25naXR1ZGUgIT0gbnVsbClcbiAgICB9XG4gICAgaWYgKGlzU2ltaWxhclZpZXcudmFsdWUpIHJldHVybiBzaW1pbGFyTWF0Y2hlcy52YWx1ZVxuICAgIGlmIChhY3RpdmVGb2xkZXJJZC52YWx1ZSkgcmV0dXJuIGRhdGEuZm9sZGVyUGhvdG9zLnZhbHVlXG4gICAgaWYgKGFjdGl2ZUFsYnVtSWQudmFsdWUpIHJldHVybiBkYXRhLmFsYnVtUGhvdG9zLnZhbHVlXG4gICAgaWYgKGFjdGl2ZVNtYXJ0QWxidW1JZC52YWx1ZSkgcmV0dXJuIGRhdGEuc21hcnRBbGJ1bVBob3Rvcy52YWx1ZVxuICAgIGlmICh0YWIudmFsdWUudmlldyA9PT0gJ3Vuc29ydGVkJykgcmV0dXJuIGRhdGEudW5zb3J0ZWRQaG90b3MudmFsdWVcbiAgICBpZiAodGFiLnZhbHVlLnZpZXcgPT09ICdyZWNlbnQnKSByZXR1cm4gZGF0YS5yZWNlbnRQaG90b3MudmFsdWVcbiAgICBpZiAodGFiLnZhbHVlLnZpZXcgPT09ICdyZWNlbnRzJykgcmV0dXJuIGRhdGEucmVjZW50Vmlld2VkUGhvdG9zLnZhbHVlXG4gICAgcmV0dXJuIGRhdGEuYWxsUGhvdG9zLnZhbHVlXG4gIH0pXG5cbiAgLy8g4pSA4pSAIOWxleekuuWIhue7hO+8iOinhuWbvuWIhuaUryArIOWFs+mUruivjSArIOW/q+etmyArIOe7hOWGheaOkuW6j++8ieKUgOKUgFxuXG4gIGNvbnN0IGRpc3BsYXlTZWN0aW9ucyA9IGNvbXB1dGVkPFBob3RvU2VjdGlvbltdPigoKSA9PiB7XG4gICAgY29uc3Qgc29ydEZvclZpZXcgPSAocGhvdG9zOiBQaG90b1tdKTogUGhvdG9bXSA9PlxuICAgICAgc29ydFBob3RvcyhwaG90b3MsIHZpZXdTb3J0QnkudmFsdWUsIHRhYi52YWx1ZS5zb3J0QXNjKVxuXG4gICAgaWYgKGlzVHJhc2hWaWV3LnZhbHVlKSB7XG4gICAgICByZXR1cm4gZ3JvdXBCeURhdGUoZGF0YS5yZWN5Y2xlQmluUGhvdG9zLnZhbHVlKVxuICAgIH1cblxuICAgIGlmIChpc0R1cGxpY2F0ZVZpZXcudmFsdWUpIHtcbiAgICAgIHJldHVybiBbXSAvLyDmn6Xph43op4blm77nlLEgRHVwbGljYXRlR3JvdXBzVmlldyDmuLLmn5NcbiAgICB9XG5cbiAgICBpZiAoaXNTaW1pbGFyVmlldy52YWx1ZSkge1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAge1xuICAgICAgICAgIGRhdGVTZWN0aW9uOiBg5LiO44CMJHtzaW1pbGFyU291cmNlTmFtZS52YWx1ZX3jgI3nm7jkvLznmoQgJHtzaW1pbGFyTWF0Y2hlcy52YWx1ZS5sZW5ndGh9IOW8oOWbvueJh2AsXG4gICAgICAgICAgcGhvdG9zOiBzb3J0Rm9yVmlldyhzaW1pbGFyTWF0Y2hlcy52YWx1ZSlcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH1cblxuICAgIC8vIMKnMi5DIOmaj+acuuaooeW8j++8muWcqOW9k+WJjeWAmemAieaxoOS4iuaJk+aVo++8iOWbnuaUtuermS/mn6Xph40v55u45Ly8L0FJIOinhuWbvuS4jeWPl+W9seWTje+8iVxuICAgIC8vIOmhuuW6j+eUsSBzdGFibGVTaHVmZmxlT3JkZXIg57yT5a2Y77yM562b6YCJL+aOkuW6j+WPmOWMluS4jemHjeaOku+8jOS7heaxoOaIkOWRmOWPmOWMluaJjemHjea0l1xuICAgIC8vIOS4iei9riBHM++8muS+p+agj+WbuuWumumhueOAjOmaj+acuuaooeW8j+OAjT0g5LiT5pyJ6KeG5Zu+77yIRWFnbGUg5ZCM5ZCN5YWl5Y+j77yJ77yM5LiOIHNodWZmbGUg5byA5YWz5Y+g5Yqg55Sf5pWIXG4gICAgaWYgKHRhYi52YWx1ZS5zaHVmZmxlIHx8IHRhYi52YWx1ZS52aWV3ID09PSAncmFuZG9tJykge1xuICAgICAgY29uc3QgcG9vbCA9IGN1cnJlbnRQb29sLnZhbHVlXG4gICAgICBjb25zdCBvcmRlciA9IHN0YWJsZVNodWZmbGVPcmRlcihwb29sKVxuICAgICAgY29uc3Qgb3JkZXJJbmRleCA9IG5ldyBNYXAob3JkZXIubWFwKChpZCwgaSkgPT4gW2lkLCBpXSkpXG4gICAgICBjb25zdCBmaWx0ZXJlZCA9IHBvb2wuZmlsdGVyKChwKSA9PiBtYXRjaEFsbChwKSlcbiAgICAgIGZpbHRlcmVkLnNvcnQoKGEsIGIpID0+IChvcmRlckluZGV4LmdldChhLmlkKSA/PyAwKSAtIChvcmRlckluZGV4LmdldChiLmlkKSA/PyAwKSlcbiAgICAgIHJldHVybiBbeyBkYXRlU2VjdGlvbjogYOmaj+acuiDCtyAke2ZpbHRlcmVkLmxlbmd0aH0g5bygYCwgcGhvdG9zOiBmaWx0ZXJlZCB9XVxuICAgIH1cblxuICAgIGlmIChpc1NlYXJjaE1vZGUudmFsdWUpIHtcbiAgICAgIC8vIOmYtuautSAz77ya5YWo5bGA5pCc57Si5rGg77yIRlRTL3Njb3BlIOS4i+aOqO+8m+m7mOiupOiMg+WbtCArIOaXoOmrmOe6p+ivreazleaXtuWQr+eUqO+8ieOAglxuICAgICAgLy8g5rGg5LiO5YWz6ZSu6K+N5ZCM5q2l5qCh6aqM6Ziy6ZSZ6aG177yI6Ziy5oqW56qX5Y+j5YaF5pen5rGg5LiN5pi+56S677yJ44CCXG4gICAgICAvLyDpq5jnuqfor63ms5Xlt7LkuIvmjqjvvIhhZHZhbmNlZEFzdO+8ie+8jOS4juaZrumAmuivjeWQjOaxoFxuICAgICAgaWYgKGRhdGEudXNlUGFnZWRTZWFyY2goKSAmJiBkYXRhLnNlYXJjaFBvb2xRdWVyeS52YWx1ZSA9PT0gdGFiLnZhbHVlLnNlYXJjaEtleXdvcmQpIHtcbiAgICAgICAgcmV0dXJuIGdyb3VwQnlEYXRlKGRhdGEuc2VhcmNoUG9vbFBob3Rvcy52YWx1ZSkubWFwKChzKSA9PiAoe1xuICAgICAgICAgIC4uLnMsXG4gICAgICAgICAgcGhvdG9zOiBzb3J0Rm9yVmlldyhzLnBob3RvcylcbiAgICAgICAgfSkpXG4gICAgICB9XG4gICAgICAvLyDkuozljYHkuIPova7vvJpFYWdsZeOAjOaQnOe0ouiMg+WbtOOAjeKAlOKAlOaMiSDLhSDpnaLmnb/li77pgInlrZfmrrXljLnphY3vvIjmlofku7blpLnlkI0v5o+P6L+w5Y+W5omA5bGe5paH5Lu25aS577yJ77ybXG4gICAgICAvLyDpq5jnuqfor63ms5XvvIhPUi/mi6zlj7cv5byV5Y+3L+aOkumZpOivje+8iei1sOWuouaIt+err+WMuemFje+8iOS9nOeUqOS6juW3suWKoOi9veeql+WPo++8iVxuICAgICAgY29uc3Qgc2NvcGVzID0gc2VhcmNoU2NvcGVzLnZhbHVlXG4gICAgICAvLyDkuIDmrKHlu7ogTWFw77yM5pW05Liq562b6YCJ6L+H56iLIE8oRinvvJvpgJDlm74gZm9sZGVycy5maW5kIOS8muaUvuWkp+aIkCBPKE7Dl0YpXG4gICAgICBjb25zdCBmb2xkZXJNYXAgPSBuZXcgTWFwKGRhdGEuZm9sZGVycy52YWx1ZS5tYXAoKGYpID0+IFtmLmlkLCBmXSkpXG4gICAgICByZXR1cm4gZ3JvdXBCeURhdGUoXG4gICAgICAgIGN1cnJlbnRQb29sLnZhbHVlLmZpbHRlcihcbiAgICAgICAgICAocCkgPT5cbiAgICAgICAgICAgIG1hdGNoS2V5d29yZChwLCB0YWIudmFsdWUuc2VhcmNoS2V5d29yZCwge1xuICAgICAgICAgICAgICBzY29wZXMsXG4gICAgICAgICAgICAgIC4uLmZvbGRlclNjb3BlVGV4dE9mKHAsIGZvbGRlck1hcClcbiAgICAgICAgICAgIH0pICYmIG1hdGNoQWxsKHApXG4gICAgICAgIClcbiAgICAgICkubWFwKChzKSA9PiAoe1xuICAgICAgICAuLi5zLFxuICAgICAgICBwaG90b3M6IHNvcnRGb3JWaWV3KHMucGhvdG9zKVxuICAgICAgfSkpXG4gICAgfVxuXG4gICAgaWYgKHRhYi52YWx1ZS52aWV3ID09PSAnZmF2b3JpdGVzJykge1xuICAgICAgLy8g5YiG6aG15YyW6Zi25q61IDLvvJrmlLbol4/nqpflj6Plj5bmlbDvvIjpl6jmjqflvIAg4oaSIOeLrOeri+aUtuiXj+axoO+8m+WFsyDihpIg5Li75rGg5bCx5Zyw6L+H5ruk77yJXG4gICAgICBpZiAoZGF0YS51c2VQYWdlZEZhdm9yaXRlcygpKSB7XG4gICAgICAgIC8vIOmYtuautSAz77ya57u05bqm5bey5LiL5o6o77yM56qX5Y+j5YaF5LiN5YaN5LqM5qyhIG1hdGNoQWxsXG4gICAgICAgIHJldHVybiBncm91cEJ5RGF0ZShkYXRhLmZhdm9yaXRlc1Bob3Rvcy52YWx1ZSkubWFwKChzKSA9PiAoe1xuICAgICAgICAgIC4uLnMsXG4gICAgICAgICAgcGhvdG9zOiBzb3J0Rm9yVmlldyhzLnBob3RvcylcbiAgICAgICAgfSkpXG4gICAgICB9XG4gICAgICByZXR1cm4gZ3JvdXBCeURhdGUoY3VycmVudFBvb2wudmFsdWUuZmlsdGVyKChwKSA9PiBwLmlzRmF2b3JpdGUgJiYgbWF0Y2hBbGwocCkpKS5tYXAoKHMpID0+ICh7XG4gICAgICAgIC4uLnMsXG4gICAgICAgIHBob3Rvczogc29ydEZvclZpZXcocy5waG90b3MpXG4gICAgICB9KSlcbiAgICB9XG5cbiAgICBpZiAodGFiLnZhbHVlLnZpZXcgPT09ICd1bnRhZ2dlZCcpIHtcbiAgICAgIHJldHVybiBncm91cEJ5RGF0ZShjdXJyZW50UG9vbC52YWx1ZS5maWx0ZXIoKHApID0+IHAudGFncy5sZW5ndGggPT09IDAgJiYgbWF0Y2hBbGwocCkpKS5tYXAoXG4gICAgICAgIChzKSA9PiAoe1xuICAgICAgICAgIC4uLnMsXG4gICAgICAgICAgcGhvdG9zOiBzb3J0Rm9yVmlldyhzLnBob3RvcylcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICB9XG5cbiAgICBpZiAoYWN0aXZlQWxidW1JZC52YWx1ZSkge1xuICAgICAgcmV0dXJuIGdyb3VwQnlEYXRlKGRhdGEuYWxidW1QaG90b3MudmFsdWUuZmlsdGVyKG1hdGNoQWxsKSkubWFwKChzKSA9PiAoe1xuICAgICAgICAuLi5zLFxuICAgICAgICBwaG90b3M6IHNvcnRGb3JWaWV3KHMucGhvdG9zKVxuICAgICAgfSkpXG4gICAgfVxuXG4gICAgaWYgKGFjdGl2ZUZvbGRlcklkLnZhbHVlKSB7XG4gICAgICAvLyDpmLbmrrUgM++8muaWh+S7tuWkueWIhumhteaAge+8iOacquW8gOOAjOaYvuekuuWtkOaWh+S7tuWkueWGheWuueOAje+8iee7tOW6puW3suS4i+aOqO+8jOi3s+i/hyBtYXRjaEFsbFxuICAgICAgaWYgKGRhdGEudXNlUGFnZWRGb2xkZXIoKSAmJiAhdGFiLnZhbHVlLmRpc3BsYXkuaW5jbHVkZVN1YmZvbGRlcnMpIHtcbiAgICAgICAgcmV0dXJuIGdyb3VwQnlEYXRlKGRhdGEuZm9sZGVyUGhvdG9zLnZhbHVlKS5tYXAoKHMpID0+ICh7XG4gICAgICAgICAgLi4ucyxcbiAgICAgICAgICBwaG90b3M6IHNvcnRGb3JWaWV3KHMucGhvdG9zKVxuICAgICAgICB9KSlcbiAgICAgIH1cbiAgICAgIC8vIEQtMDEy44CM5pi+56S65a2Q5paH5Lu25aS55YaF5a6544CN5byA5ZCv5pe277yM5rGg5omp5Li6IOa0u+WKqOaWh+S7tuWkuSDiiKog5YWo6YOo5ZCO5LujXG4gICAgICBsZXQgcG9vbCA9IGRhdGEuZm9sZGVyUGhvdG9zLnZhbHVlXG4gICAgICBpZiAodGFiLnZhbHVlLmRpc3BsYXkuaW5jbHVkZVN1YmZvbGRlcnMpIHtcbiAgICAgICAgY29uc3QgaWRzID0gZGVzY2VuZGFudEZvbGRlcklkcyhkYXRhLmZvbGRlcnMudmFsdWUsIGFjdGl2ZUZvbGRlcklkLnZhbHVlKVxuICAgICAgICBwb29sID0gZGF0YS5hbGxQaG90b3MudmFsdWUuZmlsdGVyKChwKSA9PiBwLmZvbGRlcklkICE9IG51bGwgJiYgaWRzLmhhcyhwLmZvbGRlcklkKSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBncm91cEJ5RGF0ZShwb29sLmZpbHRlcihtYXRjaEFsbCkpLm1hcCgocykgPT4gKHtcbiAgICAgICAgLi4ucyxcbiAgICAgICAgcGhvdG9zOiBzb3J0Rm9yVmlldyhzLnBob3RvcylcbiAgICAgIH0pKVxuICAgIH1cblxuICAgIGlmIChhY3RpdmVTbWFydEFsYnVtSWQudmFsdWUpIHtcbiAgICAgIHJldHVybiBncm91cEJ5RGF0ZShkYXRhLnNtYXJ0QWxidW1QaG90b3MudmFsdWUuZmlsdGVyKG1hdGNoQWxsKSkubWFwKChzKSA9PiAoe1xuICAgICAgICAuLi5zLFxuICAgICAgICBwaG90b3M6IHNvcnRGb3JWaWV3KHMucGhvdG9zKVxuICAgICAgfSkpXG4gICAgfVxuXG4gICAgLy8gwqczIEw0IC8gwqcyLkIg5Zu65a6a5YWl5Y+j6KeG5Zu+77yI5pyq5YiG57G7IC8g5pyA6L+R5re75YqgIC8g5pyA6L+R5p+l55yL77yJXG4gICAgaWYgKFxuICAgICAgdGFiLnZhbHVlLnZpZXcgPT09ICd1bnNvcnRlZCcgfHxcbiAgICAgIHRhYi52YWx1ZS52aWV3ID09PSAncmVjZW50JyB8fFxuICAgICAgdGFiLnZhbHVlLnZpZXcgPT09ICdyZWNlbnRzJ1xuICAgICkge1xuICAgICAgcmV0dXJuIGdyb3VwQnlEYXRlKGN1cnJlbnRQb29sLnZhbHVlLmZpbHRlcihtYXRjaEFsbCkpLm1hcCgocykgPT4gKHtcbiAgICAgICAgLi4ucyxcbiAgICAgICAgcGhvdG9zOiBzb3J0Rm9yVmlldyhzLnBob3RvcylcbiAgICAgIH0pKVxuICAgIH1cblxuICAgIC8vIOmYtuautSAz77ya5YiG6aG15oCB5LiL57u05bqm562b6YCJ5bey5LiL5o6oIFNRTO+8jOeql+WPo+WGheS4jeWGjeS6jOasoSBtYXRjaEFsbFxuICAgIGlmIChkYXRhLm1haW5QYWdlZEFjdGl2ZS52YWx1ZSkge1xuICAgICAgcmV0dXJuIGdyb3VwQnlEYXRlKGRhdGEuYWxsUGhvdG9zLnZhbHVlKS5tYXAoKHMpID0+ICh7XG4gICAgICAgIC4uLnMsXG4gICAgICAgIHBob3Rvczogc29ydEZvclZpZXcocy5waG90b3MpXG4gICAgICB9KSlcbiAgICB9XG4gICAgcmV0dXJuIGdyb3VwQnlEYXRlKGRhdGEuYWxsUGhvdG9zLnZhbHVlLmZpbHRlcihtYXRjaEFsbCkpLm1hcCgocykgPT4gKHtcbiAgICAgIC4uLnMsXG4gICAgICBwaG90b3M6IHNvcnRGb3JWaWV3KHMucGhvdG9zKVxuICAgIH0pKVxuICB9KVxuXG4gIC8qKiDlsZXnpLrljLrmiYHlubPliJfooajvvIjpooTop4jnv7vpobUgLyDplK7nm5jlr7zoiKogLyDov57pgInojIPlm7TlhbHnlKjlkIzkuIDpobrluo/vvIkgKi9cbiAgY29uc3QgZmxhdERpc3BsYXlQaG90b3MgPSBjb21wdXRlZDxQaG90b1tdPigoKSA9PiBkaXNwbGF5U2VjdGlvbnMudmFsdWUuZmxhdE1hcCgocykgPT4gcy5waG90b3MpKVxuXG4gIGNvbnN0IHRvdGFsQ291bnQgPSBjb21wdXRlZCgoKSA9PiBmbGF0RGlzcGxheVBob3Rvcy52YWx1ZS5sZW5ndGgpXG5cbiAgLyoqIOW9k+WJjeinhuWbvuWAmemAieaxoOmHjOWunumZheWHuueOsOeahOaJqeWxleWQje+8iOS/neaMgeagvOW8j+etm+mAiemhuemaj+inhuWbvuaUtuaVm++8iSAqL1xuICBjb25zdCBhdmFpbGFibGVGb3JtYXRzID0gY29tcHV0ZWQ8c3RyaW5nW10+KCgpID0+IHtcbiAgICBjb25zdCBzZXQgPSBuZXcgU2V0PHN0cmluZz4oKVxuICAgIGZvciAoY29uc3QgcCBvZiBjdXJyZW50UG9vbC52YWx1ZSkge1xuICAgICAgY29uc3QgaWR4ID0gcC5maWxlTmFtZS5sYXN0SW5kZXhPZignLicpXG4gICAgICBpZiAoaWR4ID49IDApIHNldC5hZGQocC5maWxlTmFtZS5zbGljZShpZHggKyAxKS50b0xvd2VyQ2FzZSgpKVxuICAgIH1cbiAgICByZXR1cm4gQXJyYXkuZnJvbShzZXQpLnNvcnQoKVxuICB9KVxuXG4gIHJldHVybiB7XG4gICAgdGFiLFxuICAgIHZpZXdMYXlvdXQsXG4gICAgdmlld1NvcnRCeSxcbiAgICB2aWV3RGlzcGxheSxcbiAgICBpc1RyYXNoVmlldyxcbiAgICBpc01hcFZpZXcsXG4gICAgaXNEdXBsaWNhdGVWaWV3LFxuICAgIGlzU2ltaWxhclZpZXcsXG4gICAgYWN0aXZlQWxidW1JZCxcbiAgICBhY3RpdmVBbGJ1bSxcbiAgICBhY3RpdmVGb2xkZXJJZCxcbiAgICBhY3RpdmVGb2xkZXIsXG4gICAgYWN0aXZlU21hcnRBbGJ1bUlkLFxuICAgIGFjdGl2ZVNtYXJ0QWxidW0sXG4gICAgaXNTZWFyY2hNb2RlLFxuICAgIHNob3dGaWx0ZXJzLFxuICAgIG1hdGNoQWxsLFxuICAgIG1hdGNoS2V5d29yZCxcbiAgICBoYXNEaW1lbnNpb25GaWx0ZXJzLFxuICAgIGN1cnJlbnRQb29sLFxuICAgIGRpc3BsYXlTZWN0aW9ucyxcbiAgICBmbGF0RGlzcGxheVBob3RvcyxcbiAgICB0b3RhbENvdW50LFxuICAgIGF2YWlsYWJsZUZvcm1hdHNcbiAgfVxufVxuXG50eXBlIEZpbHRlcnMgPSBSZXR1cm5UeXBlPHR5cGVvZiBidWlsZD5cblxubGV0IHNpbmdsZXRvbjogRmlsdGVycyB8IG51bGwgPSBudWxsXG5cbi8qKiDmqKHlnZfljZXkvovvvJpwaG90byDop4blm77lhoXmiYDmnInmtojotLnmlrnlhbHkuqvlkIzkuIDku73op4blm77mqKHlnosgKi9cbmV4cG9ydCBmdW5jdGlvbiB1c2VQaG90b0ZpbHRlcnMoKTogRmlsdGVycyB7XG4gIGlmICghc2luZ2xldG9uKSBzaW5nbGV0b24gPSBidWlsZCgpXG4gIHJldHVybiBzaW5nbGV0b25cbn1cblxuLyoqIOS6jOWNgeWFrei9ru+8muaJqeWxleWQjeW9kuexu++8iOagvOW8j+e7tOW6puiuoeaVsOeUqO+8iSAqL1xuZXhwb3J0IHtcbiAgZXh0T2ZGaWxlLFxuICBzaGFwZU9mLFxuICByYXRpb01hdGNoZXMsXG4gIG1hdGNoSW1wb3J0VGltZVByZXNldCxcbiAgaW1wb3J0VGltZVByZXNldEJvdW5kcyxcbiAgUkVTT0xVVElPTl9NSU5cbn1cblxuZXhwb3J0IHR5cGUgeyBIdWVCdWNrZXQgfVxuIl0sIm1hcHBpbmdzIjoiQUFTQSxTQUFTLFVBQVUsS0FBSyxhQUFhO0FBQ3JDLFNBQVMsbUJBQW1DO0FBQzVDLFNBQVMsb0JBQW9CLHdCQUF3QjtBQUVyRDtBQUFBLEVBQ0U7QUFBQSxPQUtLO0FBQ1AsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBNEM7QUFDckQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQkFBa0IsaUJBQWlCLHNCQUFzQjtBQUdsRSxNQUFNLFNBQVM7QUFFZixJQUFJLGVBQWU7QUFDbkIsSUFBSSxtQkFBbUI7QUFFdkIsU0FBUyxhQUFxQjtBQUM1QixRQUFNLFNBQVMsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLE1BQU07QUFDN0MsTUFB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