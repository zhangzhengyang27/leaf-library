/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import { defineStore } from "pinia";
export function makeDisplayOptions() {
  return {
    showName: true,
    showSummary: "dimensions",
    showExtension: true,
    // 二十一轮：角标渲染已随 Eagle 对齐移除，字段保留仅为旧持久化数据兼容
    showExtensionLabel: false,
    showAnnotation: false,
    includeSubfolders: false,
    // 十八轮：Eagle 无卡片 hover 操作条，默认关闭
    showHoverBar: false,
    showInspector: true,
    // ④-4：默认静态缩略图（Eagle 默认行为，悬停才播动图）
    autoPlayGif: false,
    thumbBackground: "auto"
  };
}
const STORAGE_KEY = "library.tab.v2";
const LEGACY_STORAGE_KEY = "library.tabs.v1";
const HISTORY_LIMIT = 50;
export function makeTab(view = "all", title = "全部") {
  return {
    view,
    title,
    kindFilter: null,
    colorFilter: null,
    colorMatch: "bucket",
    colorClose: null,
    formatInclude: [],
    formatExclude: [],
    resolutionFilter: "",
    timeFilter: "",
    layout: "waterfall",
    sortBy: "imported",
    searchKeyword: "",
    ratingInclude: [],
    ratingExclude: [],
    sizeRange: null,
    shapeInclude: [],
    shapeExclude: [],
    ratioFilter: null,
    tagFilter: [],
    tagMatchAny: false,
    tagMatchExact: false,
    tagExclude: [],
    untaggedOnly: false,
    customTime: null,
    modifiedTimeRange: null,
    durationRange: null,
    noteKeyword: "",
    noteKeywordExact: false,
    urlKeyword: "",
    urlKeywordExact: false,
    folderFilter: "",
    folderFilterIds: [],
    folderExcludeIds: [],
    folderMatchAll: false,
    excludeKeyword: "",
    shuffle: false,
    /** 十五轮批6：排列方向（Eagle 布局弹层 升序/降序切换）；false=降序（默认） */
    sortAsc: false,
    thumbSize: "md",
    display: makeDisplayOptions()
  };
}
const FILTER_FIELD_KEYS = [
  "kindFilter",
  "colorFilter",
  "colorClose",
  "formatInclude",
  "formatExclude",
  "resolutionFilter",
  "timeFilter",
  "ratingInclude",
  "ratingExclude",
  "sizeRange",
  "shapeInclude",
  "shapeExclude",
  "ratioFilter",
  "tagFilter",
  "tagMatchAny",
  "tagMatchExact",
  "tagExclude",
  "untaggedOnly",
  "folderFilter",
  "folderFilterIds",
  "folderExcludeIds",
  "folderMatchAll",
  "customTime",
  "modifiedTimeRange",
  "durationRange",
  "noteKeyword",
  "noteKeywordExact",
  "urlKeyword",
  "urlKeywordExact",
  "excludeKeyword"
];
function pickFilterFields(tab) {
  const out = {};
  for (const k of FILTER_FIELD_KEYS) {
    const v = tab[k];
    out[k] = Array.isArray(v) ? [...v] : v;
  }
  return out;
}
function applyFreshFilterFields(tab) {
  const fresh = makeTab(tab.view, tab.title);
  for (const k of FILTER_FIELD_KEYS) {
    tab[k] = fresh[k];
  }
}
function migrateLegacyFilterFields(tab) {
  if (!Array.isArray(tab.formatInclude)) tab.formatInclude = [];
  if (!Array.isArray(tab.formatExclude)) tab.formatExclude = [];
  if (!Array.isArray(tab.shapeInclude)) tab.shapeInclude = [];
  if (!Array.isArray(tab.shapeExclude)) tab.shapeExclude = [];
  if (!Array.isArray(tab.ratingInclude)) tab.ratingInclude = [];
  if (!Array.isArray(tab.ratingExclude)) tab.ratingExclude = [];
  if (tab.colorMatch !== "close") tab.colorMatch = "bucket";
  const legacyClose = tab.colorClose;
  if (!legacyClose || typeof legacyClose.hex !== "string" || typeof legacyClose.accuracy !== "number") {
    tab.colorClose = null;
  }
  const legacyFormat = tab.formatFilter;
  if (typeof legacyFormat === "string" && legacyFormat && tab.formatInclude.length === 0) {
    tab.formatInclude = [legacyFormat];
  }
  const legacyOrientation = tab.orientation;
  if (typeof legacyOrientation === "string" && legacyOrientation && tab.shapeInclude.length === 0) {
    tab.shapeInclude = [legacyOrientation];
  }
  const legacyRating = tab.ratingFilter;
  if (typeof legacyRating === "number" && legacyRating > 0 && tab.ratingInclude.length === 0) {
    tab.ratingInclude = [
      legacyRating,
      legacyRating + 1,
      legacyRating + 2,
      legacyRating + 3,
      legacyRating + 4
    ].filter((r) => r <= 5);
  }
  delete tab.formatFilter;
  delete tab.orientation;
  delete tab.ratingFilter;
}
function loadPersisted() {
  try {
    const needHoverbarMigration = !localStorage.getItem("leaf.hoverbar-migrated-v1");
    const needLayoutMigration = !localStorage.getItem("leaf.layout-migrated-v4");
    const needDisplayMigration = !localStorage.getItem("leaf.display-migrated-v2");
    if (needHoverbarMigration) localStorage.setItem("leaf.hoverbar-migrated-v1", "1");
    if (needLayoutMigration) localStorage.setItem("leaf.layout-migrated-v4", "1");
    if (needDisplayMigration) localStorage.setItem("leaf.display-migrated-v2", "1");
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.tab || typeof parsed.tab.view !== "string") return null;
    migrateLegacyFilterFields(parsed.tab);
    if (needHoverbarMigration) {
      if (parsed.tab.display) parsed.tab.display.showHoverBar = false;
    }
    if (needLayoutMigration) {
      if (parsed.tab.layout === "waterfall") parsed.tab.layout = "auto";
    }
    if (needDisplayMigration) {
      if (parsed.tab.display) {
        parsed.tab.display.showName = false;
        parsed.tab.display.showSummary = "none";
      }
    }
    return {
      tab: {
        ...makeTab(parsed.tab.view, parsed.tab.title),
        ...parsed.tab,
        display: { ...makeDisplayOptions(), ...parsed.tab.display ?? {} }
      },
      history: Array.isArray(parsed.history) && parsed.history.length > 0 ? parsed.history.slice(-HISTORY_LIMIT) : [parsed.tab.view],
      histIdx: typeof parsed.histIdx === "number" ? parsed.histIdx : 0
    };
  } catch {
    return null;
  }
}
function consumeBootView() {
  try {
    const m = /boot-view=([^&]+)/.exec(window.location.hash);
    if (!m) return null;
    const view = decodeURIComponent(m[1]);
    const cleaned = window.location.hash.replace(/[?&]boot-view=[^&]+/, "");
    window.history.replaceState(null, "", window.location.pathname + cleaned);
    sessionStorage.setItem("leaf.boot-window", "1");
    return view;
  } catch {
    return null;
  }
}
export const useLibraryTabs = defineStore("libraryTabs", {
  state: () => {
    const persisted = loadPersisted();
    const bootView = consumeBootView();
    const tab = bootView ? makeTab(bootView, bootView) : persisted?.tab ?? makeTab();
    const history = bootView ? [bootView] : persisted?.history ?? ["all"];
    return {
      tab,
      /** 视图历史栈（view 字符串；标题由视图层按数据解析） */
      history,
      histIdx: bootView ? 0 : persisted?.histIdx ?? 0,
      /** 二十六轮：锁定筛选（Eagle ic-filter-lock）——切换视图时维度筛选跟随 */
      filterLocked: persisted?.filterLocked ?? false
    };
  },
  getters: {
    /** 兼容消费方命名（原多标签时代的 active） */
    active(state) {
      return state.tab;
    },
    activeView(state) {
      return state.tab.view;
    },
    canBack(state) {
      return state.histIdx > 0;
    },
    canForward(state) {
      return state.histIdx < state.history.length - 1;
    }
  },
  actions: {
    persist() {
      try {
        if (sessionStorage.getItem("leaf.boot-window") === "1") return;
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            tab: this.tab,
            history: this.history,
            histIdx: this.histIdx,
            filterLocked: this.filterLocked
          })
        );
      } catch {
      }
    },
    /**
     * 切换视图并压入历史栈（默认行为）。
     * back/forward 内部走 pushHistory=false，不重复入栈。
     * 二十六轮：Eagle 锁定语义——锁定时维度筛选跨视图携带；未锁定且视图变化时清空
     * （审查 I3：此前 filterLocked 无 observable 行为，未锁定分支与已锁分支同义）。
     */
    setView(view, title, opts) {
      const viewChanged = this.tab.view !== view;
      const carried = this.filterLocked ? pickFilterFields(this.tab) : null;
      this.tab.view = view;
      this.tab.title = title;
      if (carried) {
        Object.assign(this.tab, carried);
      } else if (viewChanged) {
        applyFreshFilterFields(this.tab);
      }
      if (opts?.history !== false) {
        if (this.history[this.histIdx] !== view) {
          this.history = this.history.slice(0, this.histIdx + 1);
          this.history.push(view);
          if (this.history.length > HISTORY_LIMIT) {
            this.history = this.history.slice(-HISTORY_LIMIT);
          }
          this.histIdx = this.history.length - 1;
        }
      }
      this.persist();
    },
    /** 侧栏/树点击打开视角（保留旧 API 名，等价 setView） */
    openView(view, title) {
      this.setView(view, title);
    },
    back() {
      if (!this.canBack) return;
      const prevView = this.tab.view;
      const carried = this.filterLocked ? pickFilterFields(this.tab) : null;
      this.histIdx -= 1;
      const view = this.history[this.histIdx];
      this.tab.view = view;
      this.tab.title = defaultTitleForView(view);
      if (carried) {
        Object.assign(this.tab, carried);
      } else if (view !== prevView) {
        applyFreshFilterFields(this.tab);
      }
      this.persist();
    },
    forward() {
      if (!this.canForward) return;
      const prevView = this.tab.view;
      const carried = this.filterLocked ? pickFilterFields(this.tab) : null;
      this.histIdx += 1;
      const view = this.history[this.histIdx];
      this.tab.view = view;
      this.tab.title = defaultTitleForView(view);
      if (carried) {
        Object.assign(this.tab, carried);
      } else if (view !== prevView) {
        applyFreshFilterFields(this.tab);
      }
      this.persist();
    },
    /** 二十六轮：清除全部维度筛选（Eagle ic-filter-reset） */
    clearDimensionFilters() {
      applyFreshFilterFields(this.tab);
      this.persist();
    },
    /** 二十六轮：切换锁定筛选 */
    toggleFilterLock() {
      this.filterLocked = !this.filterLocked;
      this.persist();
    },
    /** 轻量持久化：筛选/布局等字段被外部直接改写后调用（FilterBar/TitleBar） */
    touch() {
      this.persist();
    },
    /** 视图层数据就绪后修正标题（相册/文件夹/智能夹真名） */
    syncTitle(title) {
      if (this.tab.title !== title) {
        this.tab.title = title;
        this.persist();
      }
    },
    /** 数据驱动标题：相册/智能夹/文件夹更名后由视图层调用 */
    retitleByViewPrefix(prefix, id, title) {
      if (this.tab.view === `${prefix}${id}`) {
        this.tab.title = title;
      }
      this.persist();
    },
    /** 视角失效（相册/智能夹/文件夹被删）：回退图库并截断历史 */
    invalidateViews(check) {
      if (check(this.tab.view)) {
        if (!this.filterLocked) applyFreshFilterFields(this.tab);
        this.tab.view = "all";
        this.tab.title = "全部";
      }
      this.history = this.history.filter((v) => !check(v));
      if (this.history.length === 0) this.history = ["all"];
      this.histIdx = Math.min(this.histIdx, this.history.length - 1);
      if (this.history[this.histIdx] !== this.tab.view) {
        this.histIdx = this.history.indexOf(this.tab.view);
        if (this.histIdx < 0) {
          this.histIdx = this.history.length - 1;
          this.tab.view = this.history[this.histIdx];
          this.tab.title = defaultTitleForView(this.tab.view);
        }
      }
      this.persist();
    },
    /** 测试辅助：清空持久化并重置为默认视图 */
    resetForTests() {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
      }
      this.tab = makeTab();
      this.history = ["all"];
      this.histIdx = 0;
      this.filterLocked = false;
    }
  }
});
export function defaultTitleForView(view) {
  if (view === "all") return "全部";
  if (view === "untagged") return "未加标签";
  if (view === "favorites") return "收藏";
  if (view === "map") return "地图";
  if (view === "trash") return "回收站";
  if (view === "duplicates") return "相似查重";
  if (view === "unsorted") return "未分类";
  if (view === "recent") return "最近添加";
  if (view === "recents") return "最近查看";
  if (view.startsWith("similar:")) return "相似图片";
  if (view.startsWith("smart:")) return "智能文件夹";
  if (view.startsWith("album:")) return "相册";
  if (view.startsWith("folder:")) return "文件夹";
  if (view.startsWith("tag:")) return "标签";
  return "图库";
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYnJhcnlUYWJzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTGVhZiDntKDmnZDlupMgwrcg5Zu+5bqT6KeG5Zu+54q25oCB77yIRC0wMTEgRWFnbGUg5biD5bGA77yJXG4gKlxuICogRC0wMDgg55qE5aSa5qCH562+5py65Yi25bey56e76Zmk77yIRWFnbGUg5peg5qCH562+6aG177yJ77ya5Y2V5LiA6KeG5Zu+54q25oCBICsg6KeG5Zu+5Y6G5Y+y5qCIXG4gKiDvvIjmlK/mkpHlt6XlhbfmoI8g4oC5IOKAuiDliY3ov5sv5ZCO6YCA77yJ44CC5Zu+5bqT5pWw5o2u55SxIHVzZVBob3RvRGF0YSDmj5DkvpvvvIzmnKwgc3RvcmVcbiAqIOWPqueuoeOAjOW9k+WJjeWcqOeci+WTquS4quinhuinkiArIOivpeinhuinkueahOetm+mAiS/luIPlsYDnirbmgIHjgI3jgIJcbiAqXG4gKiDmjIHkuYXljJbvvJpsb2NhbFN0b3JhZ2XvvIjmuLLmn5Pnq6/mnKzlnLAgVUkg54q25oCB77yM5LiN6L+bIFNRTGl0Ze+8ieOAglxuICog5aWR57qm77yadmlldyDlrZfnrKbkuLLkuI4gaW5kZXgudnVlIOeahOinhuWbvuWIhuaUr+S4gOiHtFxuICog77yIYWxsL2Zhdm9yaXRlcy9tYXAvdHJhc2gvZHVwbGljYXRlcy91bnNvcnRlZC9yZWNlbnQvcmVjZW50cy9cbiAqICAgc2ltaWxhcjppZC9zbWFydDppZC9hbGJ1bTppZC9mb2xkZXI6aWTvvInjgIJcbiAqL1xuaW1wb3J0IHsgZGVmaW5lU3RvcmUgfSBmcm9tICdwaW5pYSdcbmltcG9ydCB0eXBlIHsgQXNzZXRLaW5kIH0gZnJvbSAnQHNoYXJlZC9hc3NldFR5cGVzJ1xuaW1wb3J0IHR5cGUgeyBIdWVCdWNrZXQgfSBmcm9tICdAdXRpbHMvcGhvdG9Db2xvcidcblxuLyoqIOW4g+WxgO+8iEVhZ2xlIOWunua1iyA0IOenjSArIEYxMCDoh6rnlLHnvZHmoLzigJTigJTku4Xmlofku7blpLnop4blm77lj6/pgInvvIkgKi9cbmV4cG9ydCB0eXBlIExpYnJhcnlMYXlvdXQgPSAnZ3JpZCcgfCAnd2F0ZXJmYWxsJyB8ICdsaXN0JyB8ICdhdXRvJyB8ICdmcmVlZm9ybSdcbi8qKlxuICog5o6S5YiX5pa55byP77yIRC0wMTLvvIzlr7npvZAgRWFnbGUgMTAg56eN77yJ44CCXG4gKiAtIG1vZGlmaWVkL2NyZWF0ZWQg55SoIDAwMyDnmoTmlofku7bns7vnu5/ml7bpl7TvvIjnvLrlpLHml7blm57pgIAgaW1wb3J0ZWQvdXBkYXRlZO+8iVxuICogLSDpmo/mnLrmqKHlvI/msr/nlKggc2h1ZmZsZSDlrZfmrrXpqbHliqjvvIhMYXlvdXRQb3BvdmVyIOmHjOS9nOS4uuaOkuW6j+mhueWRiOeOsO+8iVxuICovXG5leHBvcnQgdHlwZSBMaWJyYXJ5U29ydCA9XG4gIHwgJ2ltcG9ydGVkJ1xuICB8ICduYW1lJ1xuICB8ICdzaXplJ1xuICB8ICdyYXRpbmcnXG4gIHwgJ21vZGlmaWVkJ1xuICB8ICdjcmVhdGVkJ1xuICB8ICdleHRlbnNpb24nXG4gIHwgJ2RpbWVuc2lvbnMnXG4gIHwgJ2R1cmF0aW9uJ1xuLyoqIOe8qeeVpeWbvuWwuuWvuOaho+S9jSAqL1xuZXhwb3J0IHR5cGUgVGh1bWJTaXplID0gJ3NtJyB8ICdtZCcgfCAnbGcnIHwgJ3hsJ1xuLyoqIOW9oueKtuetm+mAie+8iOWFq+i9ruWvuem9kCBFYWdsZe+8muaoqi/nq5Yv5pa55b2iICsg57uG6ZW/5qiqL+e7humVv+erlu+8iSAqL1xuZXhwb3J0IHR5cGUgT3JpZW50YXRpb24gPVxuICB8ICcnXG4gIHwgJ2xhbmRzY2FwZSdcbiAgfCAncG9ydHJhaXQnXG4gIHwgJ3NxdWFyZSdcbiAgfCAncGFub3JhbWljJ1xuICB8ICdwYW5vcmFtaWNQb3J0cmFpdCdcbi8qKiDkuozljYHlha3ova7vvJrlvaLnirblj5blgLzvvIjkuI3lkKvnqbrlgLzvvJvnqbrmlbDnu4QgPSDkuI3pmZDvvInigJTigJRFYWdsZSDlvaLnirblvLnlsYLlpJrpgIkv5o6S6ZmkICovXG5leHBvcnQgdHlwZSBPcmllbnRhdGlvblZhbHVlID0gRXhjbHVkZTxPcmllbnRhdGlvbiwgJyc+XG5cbi8qKlxuICog5pi+56S65byA5YWz77yIRC0wMTLvvIxFYWdsZSDluIPlsYDlvLnlsYLlrp7mtYsgOCDpobnvvInjgIJcbiAqIOmaj+inhuWbvuaMgeS5heWMlu+8m3Nob3dIb3ZlckJhci9zaG93SW5zcGVjdG9yIOWxnuWjs+Wxgue6p+ihjOS4uu+8jOS7jeaUvui/memHjOS/neaMgeWNlea6kOOAglxuICovXG5leHBvcnQgaW50ZXJmYWNlIERpc3BsYXlPcHRpb25zIHtcbiAgLyoqIOaYvuekuuWQjeensCAqL1xuICBzaG93TmFtZTogYm9vbGVhblxuICAvKiog5pi+56S6566A5LuL77yIRWFnbGXvvJrljaHniYfnrKzkuozooYzljZXlgLzvvIzpmo/kuIvmi4nliIfmjaLlhoXlrrnvvIkgKi9cbiAgc2hvd1N1bW1hcnk6ICdub25lJyB8ICdkaW1lbnNpb25zJyB8ICdzaXplJyB8ICdhZGRlZCcgfCAnbW9kaWZpZWQnIHwgJ2NyZWF0ZWQnXG4gIC8qKiDmmL7npLrmianlsZXlkI3vvIjmlofku7blkI3lsL7nvIDvvIkgKi9cbiAgc2hvd0V4dGVuc2lvbjogYm9vbGVhblxuICAvKiog5pi+56S65omp5bGV5ZCN5qCH562+77yI5Y2h54mH6KeS5qCH77yMRWFnbGUg5Zyo57yp55Wl5Zu+5bem5LiK77yJICovXG4gIHNob3dFeHRlbnNpb25MYWJlbDogYm9vbGVhblxuICAvKiog5pi+56S65qCH5rOo77yI5o+P6L+w6KeS5qCH77yJICovXG4gIHNob3dBbm5vdGF0aW9uOiBib29sZWFuXG4gIC8qKiDmlofku7blpLnop4blm77ljIXlkKvlrZDmlofku7blpLnlhoXlrrkgKi9cbiAgaW5jbHVkZVN1YmZvbGRlcnM6IGJvb2xlYW5cbiAgLyoqIOaYvuekuuaoquagj++8iOaCrOWBnOS/oeaBr+agj++8iSAqL1xuICBzaG93SG92ZXJCYXI6IGJvb2xlYW5cbiAgLyoqIOaYvuekuuajgOafpeWZqCAqL1xuICBzaG93SW5zcGVjdG9yOiBib29sZWFuXG4gIC8qKiDikaMtNO+8iEVhZ2xlIDQg5paH5Lu25YiX6KGo6YCJ6aG577yJ77yaR0lGL1dlYlAg57yp55Wl5Zu+6Ieq5Yqo5pKt5pS+77yI5YWzPemdmeaAge+8jOaCrOWBnOaJjeWKqO+8iSAqL1xuICBhdXRvUGxheUdpZjogYm9vbGVhblxuICAvKiog5Y2B5YWr6L2uIFAz77ya57yp55Wl5Zu+6IOM5pmv77yIRWFnbGUg57yp55Wl5Zu+6IOM5pmv5a2Q6I+c5Y2V77yJ4oCU4oCUYXV0bz3ot5/pmo/kuLvpopgvd2hpdGU957qv55m9L2Rhcms95rex5qOL55uYL3RyYW5zcGFyZW50PemAj+aYjiAqL1xuICB0aHVtYkJhY2tncm91bmQ6ICdhdXRvJyB8ICd3aGl0ZScgfCAnZGFyaycgfCAndHJhbnNwYXJlbnQnXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYWtlRGlzcGxheU9wdGlvbnMoKTogRGlzcGxheU9wdGlvbnMge1xuICByZXR1cm4ge1xuICAgIHNob3dOYW1lOiB0cnVlLFxuICAgIHNob3dTdW1tYXJ5OiAnZGltZW5zaW9ucycsXG4gICAgc2hvd0V4dGVuc2lvbjogdHJ1ZSxcbiAgICAvLyDkuozljYHkuIDova7vvJrop5LmoIfmuLLmn5Plt7Lpmo8gRWFnbGUg5a+56b2Q56e76Zmk77yM5a2X5q615L+d55WZ5LuF5Li65pen5oyB5LmF5YyW5pWw5o2u5YW85a65XG4gICAgc2hvd0V4dGVuc2lvbkxhYmVsOiBmYWxzZSxcbiAgICBzaG93QW5ub3RhdGlvbjogZmFsc2UsXG4gICAgaW5jbHVkZVN1YmZvbGRlcnM6IGZhbHNlLFxuICAgIC8vIOWNgeWFq+i9ru+8mkVhZ2xlIOaXoOWNoeeJhyBob3ZlciDmk43kvZzmnaHvvIzpu5jorqTlhbPpl61cbiAgICBzaG93SG92ZXJCYXI6IGZhbHNlLFxuICAgIHNob3dJbnNwZWN0b3I6IHRydWUsXG4gICAgLy8g4pGjLTTvvJrpu5jorqTpnZnmgIHnvKnnlaXlm77vvIhFYWdsZSDpu5jorqTooYzkuLrvvIzmgqzlgZzmiY3mkq3liqjlm77vvIlcbiAgICBhdXRvUGxheUdpZjogZmFsc2UsXG4gICAgdGh1bWJCYWNrZ3JvdW5kOiAnYXV0bydcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIExpYnJhcnlUYWIge1xuICAvKiog6KeG5Zu+5qCH6K+GICovXG4gIHZpZXc6IHN0cmluZ1xuICB0aXRsZTogc3RyaW5nXG4gIGtpbmRGaWx0ZXI6IEFzc2V0S2luZCB8IG51bGxcbiAgY29sb3JGaWx0ZXI6IEh1ZUJ1Y2tldCB8IG51bGxcbiAgLyoqXG4gICAqIOS6jOWNgeS5nei9riBHM++8muminOiJsuWMuemFjeaWueW8j+OAguiJsuezuz05IOahtuetieWAvO+8iOi1sCBjb2xvcl9odWUg57Si5byV5YiX77yM5b+r77yJ77ybXG4gICAqIOi/keS8vOiJsj1FYWdsZSDnmoTjgIzlkLjnrqEgKyDlh4bnoa7luqbjgI3vvIzotbAgY29sb3JfY2xvc2UoKSDnmoQgQ0lFREUyMDAwIOWIpOWumuOAglxuICAgKi9cbiAgY29sb3JNYXRjaDogJ2J1Y2tldCcgfCAnY2xvc2UnXG4gIC8qKiDov5HkvLzoibLmoaPvvJrlj5bliLDnmoToibIgKyDlh4bnoa7luqbvvIg14oCTNDDvvIzotorlpKfotorkuKXvvIzlkIwgRWFnbGXvvIkgKi9cbiAgY29sb3JDbG9zZTogeyBoZXg6IHN0cmluZzsgYWNjdXJhY3k6IG51bWJlciB9IHwgbnVsbFxuICAvKiog5LqM5Y2B5YWt6L2u77ya5qC85byP5aSa6YCJ5YyF5ZCr77yI5omp5bGV5ZCN5bCP5YaZ77yM56m6ID0g5LiN6ZmQ77ybRWFnbGUg5qC85byP5by55bGCIOW3pumUrumAieaLqe+8iSAqL1xuICBmb3JtYXRJbmNsdWRlOiBzdHJpbmdbXVxuICAvKiog5LqM5Y2B5YWt6L2u77ya5qC85byP5Y+z6ZSu5o6S6Zmk77yIRWFnbGUg5qC85byP5by55bGCIOaOkumZpCDlj7PplK7vvIkgKi9cbiAgZm9ybWF0RXhjbHVkZTogc3RyaW5nW11cbiAgcmVzb2x1dGlvbkZpbHRlcjogJycgfCAnMWsnIHwgJzJrJyB8ICc0aydcbiAgdGltZUZpbHRlcjogJycgfCAndG9kYXknIHwgJ3llc3RlcmRheScgfCAnN2QnIHwgJzMwZCcgfCAnOTBkJyB8ICczNjVkJ1xuICBsYXlvdXQ6IExpYnJhcnlMYXlvdXRcbiAgc29ydEJ5OiBMaWJyYXJ5U29ydFxuICBzZWFyY2hLZXl3b3JkOiBzdHJpbmdcbiAgLy8g4pSA4pSAIOajgOe0ouetm+mAieaJqeWxlSDilIDilIBcbiAgLyoqIOS6jOWNgeWFrei9ru+8mueyvuehruivhOWIhuWkmumAie+8iEVhZ2xlIOivhOWIhuW8ueWxguaMieaYn+e6p+WkjemAie+8m+WQqyAwID0g44CM5bCa5pyq6K+E5YiG44CN6KGM77yJICovXG4gIHJhdGluZ0luY2x1ZGU6IG51bWJlcltdXG4gIC8qKiDkuozljYHlha3ova7vvJrmjpLpmaTnmoTmmJ/nuqfvvIgwID0g5o6S6Zmk5pyq6K+E5YiG77yJICovXG4gIHJhdGluZ0V4Y2x1ZGU6IG51bWJlcltdXG4gIC8qKiDmlofku7blpKflsI/ljLrpl7QgW21pbiwgbWF4Xe+8iOWtl+iKgu+8jG51bGwgPSDkuI3pmZDvvIkgKi9cbiAgc2l6ZVJhbmdlOiBbbnVtYmVyLCBudW1iZXJdIHwgbnVsbFxuICAvKiog5LqM5Y2B5YWt6L2u77ya5b2i54q25aSa6YCJ5YyF5ZCr77yIRWFnbGUg5b2i54q25by55bGCIOWkjemAie+8iSAqL1xuICBzaGFwZUluY2x1ZGU6IE9yaWVudGF0aW9uVmFsdWVbXVxuICAvKiog5LqM5Y2B5YWt6L2u77ya5b2i54q25Y+z6ZSu5o6S6ZmkICovXG4gIHNoYXBlRXhjbHVkZTogT3JpZW50YXRpb25WYWx1ZVtdXG4gIC8qKiDkuozljYHlha3ova7vvJrmr5TkvovnrZvpgInvvIhFYWdsZSDlvaLnirblvLnlsYIgMzo0L+iHquWumu+8m1t3LGhd77yMMiUg5a655beu5Yy56YWN77yJICovXG4gIHJhdGlvRmlsdGVyOiBbbnVtYmVyLCBudW1iZXJdIHwgbnVsbFxuICAvKiog5qCH562+5aSa6YCJ77yIQU5EIOivreS5ie+8jOaMieWQjeensO+8iSAqL1xuICB0YWdGaWx0ZXI6IHN0cmluZ1tdXG4gIC8qKiDkupTova7vvJrmoIfnrb7ljLnphY3pgLvovpHvvIhmYWxzZT3miYDmnIkgQU5E77yMdHJ1ZT3ku7vkuIAgT1LvvIxFYWdsZSDmoIfnrb7lvLnlsYLjgIzpgLvovpHjgI3vvIkgKi9cbiAgdGFnTWF0Y2hBbnk6IGJvb2xlYW5cbiAgLyoqIOS6jOWNgeWFrei9ru+8muagh+etvuWMuemFjeOAjOetieWQjOOAje+8iEVhZ2xlIGljLWxvZ2ljLWVxdWFs77ya5qCH562+6ZuG5ZCI5LiO6YCJ5Lit5a6M5YWo5LiA6Ie077yJICovXG4gIHRhZ01hdGNoRXhhY3Q6IGJvb2xlYW5cbiAgLyoqIOS6lOi9ru+8muWPs+mUruaOkumZpOeahOagh+etvu+8iEVhZ2xlIOagh+etvi/mlofku7blpLnlvLnlsYLjgIzmjpLpmaQg5Y+z6ZSu44CN77yJICovXG4gIHRhZ0V4Y2x1ZGU6IHN0cmluZ1tdXG4gIC8qKiDkupTova7vvJrku4XnnIvmnKrmoIfnrb7vvIhFYWdsZSDmoIfnrb7lvLnlsYLjgIzmnKrmoIfnrb7jgI3ooYzvvIkgKi9cbiAgdW50YWdnZWRPbmx5OiBib29sZWFuXG4gIC8qKiBELTAxMiDmlofku7blpLnnrZvpgInvvIhmb2xkZXIgaWTvvJsnJyA9IOS4jemZkO+8jCdub25lJyA9IOacquWIhuexu+WIsOaWh+S7tuWkue+8iSAqL1xuICBmb2xkZXJGaWx0ZXI6IHN0cmluZ1xuICAvKiog5LqU6L2u77ya5paH5Lu25aS55aSa6YCJ5YyF5ZCr77yIaWQg5YiX6KGo5ZCrICdub25lJ++8jOepuj3kuI3pmZDvvIkgKi9cbiAgZm9sZGVyRmlsdGVySWRzOiBzdHJpbmdbXVxuICAvKiog5LqU6L2u77ya5Y+z6ZSu5o6S6Zmk55qE5paH5Lu25aS5ICovXG4gIGZvbGRlckV4Y2x1ZGVJZHM6IHN0cmluZ1tdXG4gIC8qKiDkupTova7vvJrmlofku7blpLnlpJrpgInpgLvovpHvvIhmYWxzZT3ku7vkuIAgT1LvvIx0cnVlPeaJgOaciSBBTkTvvIkgKi9cbiAgZm9sZGVyTWF0Y2hBbGw6IGJvb2xlYW5cbiAgLyoqIOiHquWumuS5ieaXtumXtOWMuumXtCBbZnJvbSwgdG9d77yIdW5peCBtc++8jG51bGwgPSDkuI3pmZDvvIzmjInlr7zlhaXml7bpl7TvvIkgKi9cbiAgY3VzdG9tVGltZTogW251bWJlciwgbnVtYmVyXSB8IG51bGxcbiAgLyoqIEQtMDEyIOS/ruaUueaXpeacn+WMuumXtCBbZnJvbSwgdG9d77yIdW5peCBtc++8jG51bGwgPSDkuI3pmZDvvIzmjInmlofku7bns7vnu5/kv67mlLnml7bpl7TvvIkgKi9cbiAgbW9kaWZpZWRUaW1lUmFuZ2U6IFtudW1iZXIsIG51bWJlcl0gfCBudWxsXG4gIC8qKiBELTAxMiDml7bplb/ljLrpl7QgW21pbiwgbWF4Xe+8iG1z77yMbnVsbCA9IOS4jemZkO+8iSAqL1xuICBkdXJhdGlvblJhbmdlOiBbbnVtYmVyLCBudW1iZXJdIHwgbnVsbFxuICAvKiogRC0wMTIg5o+P6L+wL+Wkh+azqOWFs+mUruivjSAqL1xuICBub3RlS2V5d29yZDogc3RyaW5nXG4gIC8qKiDikaTvvIhFYWdsZSA0LjAg562b6YCJ5Zmo44CM5a6M5YWo55u4562J44CN77yJ77ya5rOo6YeK5YWz6ZSu6K+N57K+56Gu5Yy56YWN77yI5YWzPeWMheWQq++8iSAqL1xuICBub3RlS2V5d29yZEV4YWN0OiBib29sZWFuXG4gIC8qKiDkuozljYHlha3ova7vvJrpk77mjqXnrZvpgInvvIjmnaXmupAgVVJMIOWMheWQq+WFs+mUruivje+8jEVhZ2xl44CM6ZO+5o6l44CN57u05bqm77yJICovXG4gIHVybEtleXdvcmQ6IHN0cmluZ1xuICAvKiog4pGk77yIRWFnbGUgNC4wIOetm+mAieWZqOOAjOWujOWFqOebuOetieOAje+8ie+8mumTvuaOpeWFs+mUruivjeeyvuehruWMuemFje+8iOWFsz3ljIXlkKvvvIkgKi9cbiAgdXJsS2V5d29yZEV4YWN0OiBib29sZWFuXG4gIC8qKiDmjpLpmaTlhbPplK7or43vvIjmlofku7blkI0v5o+P6L+wL+agh+etvu+8iSAqL1xuICBleGNsdWRlS2V5d29yZDogc3RyaW5nXG4gIC8qKiDpmo/mnLrmiZPmlaMgKi9cbiAgc2h1ZmZsZTogYm9vbGVhblxuICAvKiog5Y2B5LqU6L2u5om5Nu+8muaOkuWIl+aWueWQke+8iEVhZ2xlIOW4g+WxgOW8ueWxgiDljYfluo8v6ZmN5bqP77yJ77ybZmFsc2U96ZmN5bqP77yI6buY6K6k77yJICovXG4gIHNvcnRBc2M6IGJvb2xlYW5cbiAgLy8g4pSA4pSAIOe8qeeVpeWbvuWwuuWvuOaho+S9jSDilIDilIBcbiAgdGh1bWJTaXplOiBUaHVtYlNpemVcbiAgLy8g4pSA4pSAIOaYvuekuuW8gOWFs++8iEQtMDEy77yJ4pSA4pSAXG4gIGRpc3BsYXk6IERpc3BsYXlPcHRpb25zXG59XG5cbmNvbnN0IFNUT1JBR0VfS0VZID0gJ2xpYnJhcnkudGFiLnYyJ1xuY29uc3QgTEVHQUNZX1NUT1JBR0VfS0VZID0gJ2xpYnJhcnkudGFicy52MSdcbi8qKiDljoblj7LmoIjkuIrpmZDvvIjpmLLml6DpmZDlop7plb/vvIkgKi9cbmNvbnN0IEhJU1RPUllfTElNSVQgPSA1MFxuXG5leHBvcnQgZnVuY3Rpb24gbWFrZVRhYih2aWV3ID0gJ2FsbCcsIHRpdGxlID0gJ+WFqOmDqCcpOiBMaWJyYXJ5VGFiIHtcbiAgcmV0dXJuIHtcbiAgICB2aWV3LFxuICAgIHRpdGxlLFxuICAgIGtpbmRGaWx0ZXI6IG51bGwsXG4gICAgY29sb3JGaWx0ZXI6IG51bGwsXG4gICAgY29sb3JNYXRjaDogJ2J1Y2tldCcsXG4gICAgY29sb3JDbG9zZTogbnVsbCxcbiAgICBmb3JtYXRJbmNsdWRlOiBbXSxcbiAgICBmb3JtYXRFeGNsdWRlOiBbXSxcbiAgICByZXNvbHV0aW9uRmlsdGVyOiAnJyxcbiAgICB0aW1lRmlsdGVyOiAnJyxcbiAgICBsYXlvdXQ6ICd3YXRlcmZhbGwnLFxuICAgIHNvcnRCeTogJ2ltcG9ydGVkJyxcbiAgICBzZWFyY2hLZXl3b3JkOiAnJyxcbiAgICByYXRpbmdJbmNsdWRlOiBbXSxcbiAgICByYXRpbmdFeGNsdWRlOiBbXSxcbiAgICBzaXplUmFuZ2U6IG51bGwsXG4gICAgc2hhcGVJbmNsdWRlOiBbXSxcbiAgICBzaGFwZUV4Y2x1ZGU6IFtdLFxuICAgIHJhdGlvRmlsdGVyOiBudWxsLFxuICAgIHRhZ0ZpbHRlcjogW10sXG4gICAgdGFnTWF0Y2hBbnk6IGZhbHNlLFxuICAgIHRhZ01hdGNoRXhhY3Q6IGZhbHNlLFxuICAgIHRhZ0V4Y2x1ZGU6IFtdLFxuICAgIHVudGFnZ2VkT25seTogZmFsc2UsXG4gICAgY3VzdG9tVGltZTogbnVsbCxcbiAgICBtb2RpZmllZFRpbWVSYW5nZTogbnVsbCxcbiAgICBkdXJhdGlvblJhbmdlOiBudWxsLFxuICAgIG5vdGVLZXl3b3JkOiAnJyxcbiAgICBub3RlS2V5d29yZEV4YWN0OiBmYWxzZSxcbiAgICB1cmxLZXl3b3JkOiAnJyxcbiAgICB1cmxLZXl3b3JkRXhhY3Q6IGZhbHNlLFxuICAgIGZvbGRlckZpbHRlcjogJycsXG4gICAgZm9sZGVyRmlsdGVySWRzOiBbXSxcbiAgICBmb2xkZXJFeGNsdWRlSWRzOiBbXSxcbiAgICBmb2xkZXJNYXRjaEFsbDogZmFsc2UsXG4gICAgZXhjbHVkZUtleXdvcmQ6ICcnLFxuICAgIHNodWZmbGU6IGZhbHNlLFxuICAgIC8qKiDljYHkupTova7mibk277ya5o6S5YiX5pa55ZCR77yIRWFnbGUg5biD5bGA5by55bGCIOWNh+W6jy/pmY3luo/liIfmjaLvvInvvJtmYWxzZT3pmY3luo/vvIjpu5jorqTvvIkgKi9cbiAgICBzb3J0QXNjOiBmYWxzZSxcbiAgICB0aHVtYlNpemU6ICdtZCcsXG4gICAgZGlzcGxheTogbWFrZURpc3BsYXlPcHRpb25zKClcbiAgfVxufVxuXG4vKipcbiAqIOS6jOWNgeWFrei9ru+8mue7tOW6puetm+mAieWtl+autembhu+8iEVhZ2xlIGljLWZpbHRlci1sb2Nr44CM6ZSB5a6a562b6YCJ44CN6Leo6KeG5Zu+5pC65bimICtcbiAqIGljLWZpbHRlci1yZXNldOOAjOa4hemZpOWFqOmDqOOAjeeahOS9nOeUqOiMg+WbtO+8ieOAguS4jeWQq+W4g+WxgC/mmL7npLrlvIDlhbMv5pCc57Si5YWz6ZSu6K+N44CCXG4gKi9cbmNvbnN0IEZJTFRFUl9GSUVMRF9LRVlTID0gW1xuICAna2luZEZpbHRlcicsXG4gICdjb2xvckZpbHRlcicsXG4gICdjb2xvckNsb3NlJyxcbiAgJ2Zvcm1hdEluY2x1ZGUnLFxuICAnZm9ybWF0RXhjbHVkZScsXG4gICdyZXNvbHV0aW9uRmlsdGVyJyxcbiAgJ3RpbWVGaWx0ZXInLFxuICAncmF0aW5nSW5jbHVkZScsXG4gICdyYXRpbmdFeGNsdWRlJyxcbiAgJ3NpemVSYW5nZScsXG4gICdzaGFwZUluY2x1ZGUnLFxuICAnc2hhcGVFeGNsdWRlJyxcbiAgJ3JhdGlvRmlsdGVyJyxcbiAgJ3RhZ0ZpbHRlcicsXG4gICd0YWdNYXRjaEFueScsXG4gICd0YWdNYXRjaEV4YWN0JyxcbiAgJ3RhZ0V4Y2x1ZGUnLFxuICAndW50YWdnZWRPbmx5JyxcbiAgJ2ZvbGRlckZpbHRlcicsXG4gICdmb2xkZXJGaWx0ZXJJZHMnLFxuICAnZm9sZGVyRXhjbHVkZUlkcycsXG4gICdmb2xkZXJNYXRjaEFsbCcsXG4gICdjdXN0b21UaW1lJyxcbiAgJ21vZGlmaWVkVGltZVJhbmdlJyxcbiAgJ2R1cmF0aW9uUmFuZ2UnLFxuICAnbm90ZUtleXdvcmQnLFxuICAnbm90ZUtleXdvcmRFeGFjdCcsXG4gICd1cmxLZXl3b3JkJyxcbiAgJ3VybEtleXdvcmRFeGFjdCcsXG4gICdleGNsdWRlS2V5d29yZCdcbl0gYXMgY29uc3RcblxuLyoqIOS7jiB0YWIg5LiK5pGY5Ye657u05bqm562b6YCJ5a2X5q6177yI6ZSB5a6a5YiH5o2i6KeG5Zu+5pe25pCs6L+Q55So77yJICovXG5mdW5jdGlvbiBwaWNrRmlsdGVyRmllbGRzKHRhYjogTGlicmFyeVRhYik6IFBhcnRpYWw8TGlicmFyeVRhYj4ge1xuICBjb25zdCBvdXQgPSB7fSBhcyBSZWNvcmQ8KHR5cGVvZiBGSUxURVJfRklFTERfS0VZUylbbnVtYmVyXSwgdW5rbm93bj5cbiAgZm9yIChjb25zdCBrIG9mIEZJTFRFUl9GSUVMRF9LRVlTKSB7XG4gICAgY29uc3QgdiA9IHRhYltrXVxuICAgIG91dFtrXSA9IEFycmF5LmlzQXJyYXkodikgPyBbLi4udl0gOiB2XG4gIH1cbiAgcmV0dXJuIG91dCBhcyBQYXJ0aWFsPExpYnJhcnlUYWI+XG59XG5cbi8qKiDmiornu7TluqbnrZvpgInlrZfmrrXph43nva7kuLrpu5jorqTlgLzvvIjmuIXpmaTlhajpg6ggLyDmnKrplIHlrprliIfmjaLop4blm77lhbHnlKjvvJvlrqHmn6UgSTPvvIkgKi9cbmZ1bmN0aW9uIGFwcGx5RnJlc2hGaWx0ZXJGaWVsZHModGFiOiBMaWJyYXJ5VGFiKTogdm9pZCB7XG4gIGNvbnN0IGZyZXNoID0gbWFrZVRhYih0YWIudmlldywgdGFiLnRpdGxlKVxuICBmb3IgKGNvbnN0IGsgb2YgRklMVEVSX0ZJRUxEX0tFWVMpIHtcbiAgICB0YWJba10gPSBmcmVzaFtrXSBhcyBuZXZlclxuICB9XG59XG5cbmludGVyZmFjZSBQZXJzaXN0ZWRTdGF0ZSB7XG4gIHRhYjogTGlicmFyeVRhYlxuICBoaXN0b3J5OiBzdHJpbmdbXVxuICBoaXN0SWR4OiBudW1iZXJcbiAgLyoqIOS6jOWNgeWFrei9ru+8mumUgeWumuetm+mAie+8iEVhZ2xlIGljLWZpbHRlci1sb2Nr77yM6Leo6KeG5Zu+5pC65bim57u05bqm562b6YCJ77yJICovXG4gIGZpbHRlckxvY2tlZD86IGJvb2xlYW5cbn1cblxuLyoqIOS6jOWNgeWFrei9ruS4gOasoeaAp+i/geenu++8muWNleWAvOetm+mAieWtl+autSDihpIg5aSa6YCJ5YyF5ZCrL+aOkumZpO+8iEVhZ2xlIOW8ueWxguivreS5ie+8iSAqL1xuZnVuY3Rpb24gbWlncmF0ZUxlZ2FjeUZpbHRlckZpZWxkcyh0YWI6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogdm9pZCB7XG4gIC8vIOWuoeafpSBDMe+8muaXp+aMgeS5heWMliBKU09OIOayoeacieS7u+S9leaWsOaVsOe7hOmUru+8iG1ha2VUYWIg6buY6K6k5YC85Zyo5YW25ZCO55qE5bGV5byA5omN5ZCI5bm277yJ77yMXG4gIC8vIOW/hemhu+WFiOaKiue8uuWkseeahOaVsOe7hOmUruW9kuS4gOWMluS4uuepuuaVsOe7hO+8jOWQpuWImeWuiOWNq+awuOi/nOS4jeaIkOeri+OAgeaXp+etm+mAieiiq+mdmem7mOS4ouW8g1xuICBpZiAoIUFycmF5LmlzQXJyYXkodGFiLmZvcm1hdEluY2x1ZGUpKSB0YWIuZm9ybWF0SW5jbHVkZSA9IFtdXG4gIGlmICghQXJyYXkuaXNBcnJheSh0YWIuZm9ybWF0RXhjbHVkZSkpIHRhYi5mb3JtYXRFeGNsdWRlID0gW11cbiAgaWYgKCFBcnJheS5pc0FycmF5KHRhYi5zaGFwZUluY2x1ZGUpKSB0YWIuc2hhcGVJbmNsdWRlID0gW11cbiAgaWYgKCFBcnJheS5pc0FycmF5KHRhYi5zaGFwZUV4Y2x1ZGUpKSB0YWIuc2hhcGVFeGNsdWRlID0gW11cbiAgaWYgKCFBcnJheS5pc0FycmF5KHRhYi5yYXRpbmdJbmNsdWRlKSkgdGFiLnJhdGluZ0luY2x1ZGUgPSBbXVxuICBpZiAoIUFycmF5LmlzQXJyYXkodGFiLnJhdGluZ0V4Y2x1ZGUpKSB0YWIucmF0aW5nRXhjbHVkZSA9IFtdXG4gIC8vIOS6jOWNgeS5nei9riBHMyDnmoTkuKTkuKrmlrDplK7lkIzmoLfopoHlvZLkuIDvvJrml6fmjIHkuYXljJbmoIfnrb7kuIrlroPku6zmmK8gdW5kZWZpbmVk77yMXG4gIC8vIOS4jeW9kuS4gOeahOivneOAjOi/keS8vOiJsuOAjeaho+S4gOWIt+aWsOWwseaOieWbnuiJsuezu++8jOW9oueKtuWDj+ayoeeUn+aViFxuICBpZiAodGFiLmNvbG9yTWF0Y2ggIT09ICdjbG9zZScpIHRhYi5jb2xvck1hdGNoID0gJ2J1Y2tldCdcbiAgY29uc3QgbGVnYWN5Q2xvc2UgPSB0YWIuY29sb3JDbG9zZSBhcyB7IGhleD86IHVua25vd247IGFjY3VyYWN5PzogdW5rbm93biB9IHwgbnVsbFxuICBpZiAoXG4gICAgIWxlZ2FjeUNsb3NlIHx8XG4gICAgdHlwZW9mIGxlZ2FjeUNsb3NlLmhleCAhPT0gJ3N0cmluZycgfHxcbiAgICB0eXBlb2YgbGVnYWN5Q2xvc2UuYWNjdXJhY3kgIT09ICdudW1iZXInXG4gICkge1xuICAgIHRhYi5jb2xvckNsb3NlID0gbnVsbFxuICB9XG4gIGNvbnN0IGxlZ2FjeUZvcm1hdCA9IHRhYi5mb3JtYXRGaWx0ZXJcbiAgaWYgKFxuICAgIHR5cGVvZiBsZWdhY3lGb3JtYXQgPT09ICdzdHJpbmcnICYmXG4gICAgbGVnYWN5Rm9ybWF0ICYmXG4gICAgKHRhYi5mb3JtYXRJbmNsdWRlIGFzIHN0cmluZ1tdKS5sZW5ndGggPT09IDBcbiAgKSB7XG4gICAgdGFiLmZvcm1hdEluY2x1ZGUgPSBbbGVnYWN5Rm9ybWF0XVxuICB9XG4gIGNvbnN0IGxlZ2FjeU9yaWVudGF0aW9uID0gdGFiLm9yaWVudGF0aW9uXG4gIGlmIChcbiAgICB0eXBlb2YgbGVnYWN5T3JpZW50YXRpb24gPT09ICdzdHJpbmcnICYmXG4gICAgbGVnYWN5T3JpZW50YXRpb24gJiZcbiAgICAodGFiLnNoYXBlSW5jbHVkZSBhcyBzdHJpbmdbXSkubGVuZ3RoID09PSAwXG4gICkge1xuICAgIHRhYi5zaGFwZUluY2x1ZGUgPSBbbGVnYWN5T3JpZW50YXRpb25dXG4gIH1cbiAgY29uc3QgbGVnYWN5UmF0aW5nID0gdGFiLnJhdGluZ0ZpbHRlclxuICBpZiAoXG4gICAgdHlwZW9mIGxlZ2FjeVJhdGluZyA9PT0gJ251bWJlcicgJiZcbiAgICBsZWdhY3lSYXRpbmcgPiAwICYmXG4gICAgKHRhYi5yYXRpbmdJbmNsdWRlIGFzIG51bWJlcltdKS5sZW5ndGggPT09IDBcbiAgKSB7XG4gICAgLy8g5pen6K+t5LmJ5Li644CM4omlIE7jgI3vvIzlsZXlvIDkuLrnsr7noa7mmJ/nuqfpm4blkIjkv53mjIHnrZvpgInnu5PmnpzkuI3lj5hcbiAgICB0YWIucmF0aW5nSW5jbHVkZSA9IFtcbiAgICAgIGxlZ2FjeVJhdGluZyxcbiAgICAgIGxlZ2FjeVJhdGluZyArIDEsXG4gICAgICBsZWdhY3lSYXRpbmcgKyAyLFxuICAgICAgbGVnYWN5UmF0aW5nICsgMyxcbiAgICAgIGxlZ2FjeVJhdGluZyArIDRcbiAgICBdLmZpbHRlcigocikgPT4gciA8PSA1KVxuICB9XG4gIGRlbGV0ZSB0YWIuZm9ybWF0RmlsdGVyXG4gIGRlbGV0ZSB0YWIub3JpZW50YXRpb25cbiAgZGVsZXRlIHRhYi5yYXRpbmdGaWx0ZXJcbn1cblxuZnVuY3Rpb24gbG9hZFBlcnNpc3RlZCgpOiBQZXJzaXN0ZWRTdGF0ZSB8IG51bGwge1xuICB0cnkge1xuICAgIC8vIOS4ieadoeS4gOasoeaAp+i/geenu+agh+W/l+W/hemhu+aXoOadoeS7tuWFiOWGme+8iOWuoeafpSBQMi0yMu+8ie+8muaXp+WunueOsOWPquWcqOivu+WIsOaMgeS5heWMluaVsOaNruaXtlxuICAgIC8vIOaJjeWGmeagh+W/l+KAlOKAlOaWsOijheeUqOaIt+mmlui9ruaXoCByYXcg5o+Q5YmNIHJldHVybu+8jOagh+W/l+awuOS4jeiQveebmO+8jOesrOS6jOasoeWQr+WKqOaXtlxuICAgIC8vIOmmlui9ruS6p+eUn+eahOm7mOiupOWAvO+8iHdhdGVyZmFsbC9zaG93TmFtZS/mkZjopoHvvInooqvor6/liKTkuLrjgIzml6fmlbDmja7jgI3pga3liLDmlLnlhplcbiAgICBjb25zdCBuZWVkSG92ZXJiYXJNaWdyYXRpb24gPSAhbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2xlYWYuaG92ZXJiYXItbWlncmF0ZWQtdjEnKVxuICAgIGNvbnN0IG5lZWRMYXlvdXRNaWdyYXRpb24gPSAhbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2xlYWYubGF5b3V0LW1pZ3JhdGVkLXY0JylcbiAgICBjb25zdCBuZWVkRGlzcGxheU1pZ3JhdGlvbiA9ICFsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnbGVhZi5kaXNwbGF5LW1pZ3JhdGVkLXYyJylcbiAgICBpZiAobmVlZEhvdmVyYmFyTWlncmF0aW9uKSBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnbGVhZi5ob3ZlcmJhci1taWdyYXRlZC12MScsICcxJylcbiAgICBpZiAobmVlZExheW91dE1pZ3JhdGlvbikgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2xlYWYubGF5b3V0LW1pZ3JhdGVkLXY0JywgJzEnKVxuICAgIGlmIChuZWVkRGlzcGxheU1pZ3JhdGlvbikgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2xlYWYuZGlzcGxheS1taWdyYXRlZC12MicsICcxJylcblxuICAgIGNvbnN0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFNUT1JBR0VfS0VZKVxuICAgIGlmICghcmF3KSByZXR1cm4gbnVsbFxuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBQZXJzaXN0ZWRTdGF0ZVxuICAgIGlmICghcGFyc2VkLnRhYiB8fCB0eXBlb2YgcGFyc2VkLnRhYi52aWV3ICE9PSAnc3RyaW5nJykgcmV0dXJuIG51bGxcbiAgICAvLyDkuozljYHlha3ova7vvJrml6fljZXlgLzlrZfmrrXov4HlhaXlpJrpgInmlbDnu4RcbiAgICBtaWdyYXRlTGVnYWN5RmlsdGVyRmllbGRzKHBhcnNlZC50YWIgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilcbiAgICAvLyDljYHlhavova7kuIDmrKHmgKfov4Hnp7vvvJpFYWdsZSDml6DljaHniYcgaG92ZXIg5pON5L2c5p2h77yM5pen55So5oi36buY6K6k5byA5ZCv55qE57uf5LiA5YWz6Zet44CCXG4gICAgaWYgKG5lZWRIb3ZlcmJhck1pZ3JhdGlvbikge1xuICAgICAgaWYgKHBhcnNlZC50YWIuZGlzcGxheSkgcGFyc2VkLnRhYi5kaXNwbGF5LnNob3dIb3ZlckJhciA9IGZhbHNlXG4gICAgfVxuICAgIC8vIOS6jOWNgeS4iei9ruS4gOasoeaAp+i/geenu++8muW4g+WxgOivreS5ieWvuem9kCBFYWdsZeKAlOKAlOOAjOiHqumAguW6lOOAjT1qdXN0aWZpZWQg6KGM5byP77yI6KGM6auY4omI5Zu65a6a44CBXG4gICAgLy8g5a695bqm5oiQ5q+U5L6L44CB5pW06KGM5aGr5ruh77yJ77yM5pen54CR5biD5rWB5YGP5aW977yIZmxleCDlrprpq5jooYzvvInov4HlhaXoh6rpgILlupTvvJvngJHluIPmtYHmlLnkuLogbWFzb25yeSDliJflvI/jgIJcbiAgICBpZiAobmVlZExheW91dE1pZ3JhdGlvbikge1xuICAgICAgaWYgKChwYXJzZWQudGFiLmxheW91dCBhcyBzdHJpbmcpID09PSAnd2F0ZXJmYWxsJykgcGFyc2VkLnRhYi5sYXlvdXQgPSAnYXV0bydcbiAgICB9XG4gICAgLy8g5LqM5Y2B5LiJ6L2u5LiA5qyh5oCn6L+B56e777ya5Y2h54mH5LiL5pa55ZCN56ewL+eugOS7i+m7mOiupOmakOiXj++8iOWvuem9kOeUqOaItyBFYWdsZSDlvZPliY3nirbmgIHigJTigJTnuq/lh4DngJHluIPmtYHvvJtcbiAgICAvLyDpnIDopoHml7blj6/lnKjluIPlsYDlvLnlsYLjgIzmmL7npLrlkI3np7AgLyDmmL7npLrnroDku4vjgI3ph43mlrDmiZPlvIDvvIlcbiAgICBpZiAobmVlZERpc3BsYXlNaWdyYXRpb24pIHtcbiAgICAgIGlmIChwYXJzZWQudGFiLmRpc3BsYXkpIHtcbiAgICAgICAgcGFyc2VkLnRhYi5kaXNwbGF5LnNob3dOYW1lID0gZmFsc2VcbiAgICAgICAgcGFyc2VkLnRhYi5kaXNwbGF5LnNob3dTdW1tYXJ5ID0gJ25vbmUnXG4gICAgICB9XG4gICAgfVxuICAgIC8vIOWtl+auteWuuemUme+8mue8uuWtl+auteihpem7mOiupOWAvO+8m2Rpc3BsYXkg5bWM5aWX5a+56LGh6YCQ5a2X5q615ZCI5bm277yI5YW85a655pen54mI5pys5aKe6YeP5Yqg5byA5YWz77yJXG4gICAgcmV0dXJuIHtcbiAgICAgIHRhYjoge1xuICAgICAgICAuLi5tYWtlVGFiKHBhcnNlZC50YWIudmlldywgcGFyc2VkLnRhYi50aXRsZSksXG4gICAgICAgIC4uLnBhcnNlZC50YWIsXG4gICAgICAgIGRpc3BsYXk6IHsgLi4ubWFrZURpc3BsYXlPcHRpb25zKCksIC4uLihwYXJzZWQudGFiLmRpc3BsYXkgPz8ge30pIH1cbiAgICAgIH0sXG4gICAgICBoaXN0b3J5OlxuICAgICAgICBBcnJheS5pc0FycmF5KHBhcnNlZC5oaXN0b3J5KSAmJiBwYXJzZWQuaGlzdG9yeS5sZW5ndGggPiAwXG4gICAgICAgICAgPyBwYXJzZWQuaGlzdG9yeS5zbGljZSgtSElTVE9SWV9MSU1JVClcbiAgICAgICAgICA6IFtwYXJzZWQudGFiLnZpZXddLFxuICAgICAgaGlzdElkeDogdHlwZW9mIHBhcnNlZC5oaXN0SWR4ID09PSAnbnVtYmVyJyA/IHBhcnNlZC5oaXN0SWR4IDogMFxuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG4vKiog5Y2B5LqU6L2uIEQxOO+8mua2iOi0ueeql+WPoyBVUkwg6YeM55qE5Yid5aeL6KeG5Zu+5Y+C5pWw77yIIy9waG90b3M/Ym9vdC12aWV3PWZvbGRlcjo8aWQ+77yJ77yM55So5a6M5Y2z5riFICovXG5mdW5jdGlvbiBjb25zdW1lQm9vdFZpZXcoKTogc3RyaW5nIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgY29uc3QgbSA9IC9ib290LXZpZXc9KFteJl0rKS8uZXhlYyh3aW5kb3cubG9jYXRpb24uaGFzaClcbiAgICBpZiAoIW0pIHJldHVybiBudWxsXG4gICAgY29uc3QgdmlldyA9IGRlY29kZVVSSUNvbXBvbmVudChtWzFdKVxuICAgIGNvbnN0IGNsZWFuZWQgPSB3aW5kb3cubG9jYXRpb24uaGFzaC5yZXBsYWNlKC9bPyZdYm9vdC12aWV3PVteJl0rLywgJycpXG4gICAgd2luZG93Lmhpc3RvcnkucmVwbGFjZVN0YXRlKG51bGwsICcnLCB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyBjbGVhbmVkKVxuICAgIC8vIOagh+iusOOAjOW8leWvvOeql+WPo+OAje+8muS4jeWbnuWGmeaMgeS5heWMlu+8iGxvY2FsU3RvcmFnZSDot6jnqpflj6PlhbHkuqvvvIzpgb/lhY3opobnm5bkuLvnqpflj6Pop4blm77nirbmgIHvvIlcbiAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKCdsZWFmLmJvb3Qtd2luZG93JywgJzEnKVxuICAgIHJldHVybiB2aWV3XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsXG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IHVzZUxpYnJhcnlUYWJzID0gZGVmaW5lU3RvcmUoJ2xpYnJhcnlUYWJzJywge1xuICBzdGF0ZTogKCkgPT4ge1xuICAgIGNvbnN0IHBlcnNpc3RlZCA9IGxvYWRQZXJzaXN0ZWQoKVxuICAgIGNvbnN0IGJvb3RWaWV3ID0gY29uc3VtZUJvb3RWaWV3KClcbiAgICBjb25zdCB0YWIgPSBib290VmlldyA/IG1ha2VUYWIoYm9vdFZpZXcsIGJvb3RWaWV3KSA6IChwZXJzaXN0ZWQ/LnRhYiA/PyBtYWtlVGFiKCkpXG4gICAgY29uc3QgaGlzdG9yeSA9IGJvb3RWaWV3ID8gW2Jvb3RWaWV3XSA6IChwZXJzaXN0ZWQ/Lmhpc3RvcnkgPz8gWydhbGwnXSlcbiAgICByZXR1cm4ge1xuICAgICAgdGFiLFxuICAgICAgLyoqIOinhuWbvuWOhuWPsuagiO+8iHZpZXcg5a2X56ym5Liy77yb5qCH6aKY55Sx6KeG5Zu+5bGC5oyJ5pWw5o2u6Kej5p6Q77yJICovXG4gICAgICBoaXN0b3J5LFxuICAgICAgaGlzdElkeDogYm9vdFZpZXcgPyAwIDogKHBlcnNpc3RlZD8uaGlzdElkeCA/PyAwKSxcbiAgICAgIC8qKiDkuozljYHlha3ova7vvJrplIHlrprnrZvpgInvvIhFYWdsZSBpYy1maWx0ZXItbG9ja++8ieKAlOKAlOWIh+aNouinhuWbvuaXtue7tOW6puetm+mAiei3n+majyAqL1xuICAgICAgZmlsdGVyTG9ja2VkOiBwZXJzaXN0ZWQ/LmZpbHRlckxvY2tlZCA/PyBmYWxzZVxuICAgIH1cbiAgfSxcblxuICBnZXR0ZXJzOiB7XG4gICAgLyoqIOWFvOWuuea2iOi0ueaWueWRveWQje+8iOWOn+Wkmuagh+etvuaXtuS7o+eahCBhY3RpdmXvvIkgKi9cbiAgICBhY3RpdmUoc3RhdGUpOiBMaWJyYXJ5VGFiIHtcbiAgICAgIHJldHVybiBzdGF0ZS50YWJcbiAgICB9LFxuICAgIGFjdGl2ZVZpZXcoc3RhdGUpOiBzdHJpbmcge1xuICAgICAgcmV0dXJuIHN0YXRlLnRhYi52aWV3XG4gICAgfSxcbiAgICBjYW5CYWNrKHN0YXRlKTogYm9vbGVhbiB7XG4gICAgICByZXR1cm4gc3RhdGUuaGlzdElkeCA+IDBcbiAgICB9LFxuICAgIGNhbkZvcndhcmQoc3RhdGUpOiBib29sZWFuIHtcbiAgICAgIHJldHVybiBzdGF0ZS5oaXN0SWR4IDwgc3RhdGUuaGlzdG9yeS5sZW5ndGggLSAxXG4gICAgfVxuICB9LFxuXG4gIGFjdGlvbnM6IHtcbiAgICBwZXJzaXN0KCk6IHZvaWQge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8g5Y2B5LqU6L2uIEQxOO+8muW8leWvvOeql+WPo++8iOaWsOeql+WPo+aJk+W8gO+8ieS4jeWbnuWGmeaMgeS5heWMlu+8jOS4u+eql+WPo+S/neaMgeaMgeS5heWMluecn+eQhua6kFxuICAgICAgICBpZiAoc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbSgnbGVhZi5ib290LXdpbmRvdycpID09PSAnMScpIHJldHVyblxuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcbiAgICAgICAgICBTVE9SQUdFX0tFWSxcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICB0YWI6IHRoaXMudGFiLFxuICAgICAgICAgICAgaGlzdG9yeTogdGhpcy5oaXN0b3J5LFxuICAgICAgICAgICAgaGlzdElkeDogdGhpcy5oaXN0SWR4LFxuICAgICAgICAgICAgZmlsdGVyTG9ja2VkOiB0aGlzLmZpbHRlckxvY2tlZFxuICAgICAgICAgIH0gc2F0aXNmaWVzIFBlcnNpc3RlZFN0YXRlKVxuICAgICAgICApXG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLyog6ZqQ56eB5qih5byP562J5Zy65pmv5b+955WlICovXG4gICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIOWIh+aNouinhuWbvuW5tuWOi+WFpeWOhuWPsuagiO+8iOm7mOiupOihjOS4uu+8ieOAglxuICAgICAqIGJhY2svZm9yd2FyZCDlhoXpg6jotbAgcHVzaEhpc3Rvcnk9ZmFsc2XvvIzkuI3ph43lpI3lhaXmoIjjgIJcbiAgICAgKiDkuozljYHlha3ova7vvJpFYWdsZSDplIHlrpror63kuYnigJTigJTplIHlrprml7bnu7TluqbnrZvpgInot6jop4blm77mkLrluKbvvJvmnKrplIHlrprkuJTop4blm77lj5jljJbml7bmuIXnqbpcbiAgICAgKiDvvIjlrqHmn6UgSTPvvJrmraTliY0gZmlsdGVyTG9ja2VkIOaXoCBvYnNlcnZhYmxlIOihjOS4uu+8jOacqumUgeWumuWIhuaUr+S4juW3sumUgeWIhuaUr+WQjOS5ie+8ieOAglxuICAgICAqL1xuICAgIHNldFZpZXcodmlldzogc3RyaW5nLCB0aXRsZTogc3RyaW5nLCBvcHRzPzogeyBoaXN0b3J5PzogYm9vbGVhbiB9KTogdm9pZCB7XG4gICAgICBjb25zdCB2aWV3Q2hhbmdlZCA9IHRoaXMudGFiLnZpZXcgIT09IHZpZXdcbiAgICAgIGNvbnN0IGNhcnJpZWQgPSB0aGlzLmZpbHRlckxvY2tlZCA/IHBpY2tGaWx0ZXJGaWVsZHModGhpcy50YWIpIDogbnVsbFxuICAgICAgdGhpcy50YWIudmlldyA9IHZpZXdcbiAgICAgIHRoaXMudGFiLnRpdGxlID0gdGl0bGVcbiAgICAgIGlmIChjYXJyaWVkKSB7XG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50YWIsIGNhcnJpZWQpXG4gICAgICB9IGVsc2UgaWYgKHZpZXdDaGFuZ2VkKSB7XG4gICAgICAgIGFwcGx5RnJlc2hGaWx0ZXJGaWVsZHModGhpcy50YWIpXG4gICAgICB9XG4gICAgICBpZiAob3B0cz8uaGlzdG9yeSAhPT0gZmFsc2UpIHtcbiAgICAgICAgLy8g5oiq5pat5YmN6L+b5YiG5pSv5ZCO5Y6L5qCI77yb5ZCM6KeG5Zu+6L+e57ut6Lez6L2s5LiN6YeN5aSN6K6w5b2VXG4gICAgICAgIGlmICh0aGlzLmhpc3RvcnlbdGhpcy5oaXN0SWR4XSAhPT0gdmlldykge1xuICAgICAgICAgIHRoaXMuaGlzdG9yeSA9IHRoaXMuaGlzdG9yeS5zbGljZSgwLCB0aGlzLmhpc3RJZHggKyAxKVxuICAgICAgICAgIHRoaXMuaGlzdG9yeS5wdXNoKHZpZXcpXG4gICAgICAgICAgaWYgKHRoaXMuaGlzdG9yeS5sZW5ndGggPiBISVNUT1JZX0xJTUlUKSB7XG4gICAgICAgICAgICB0aGlzLmhpc3RvcnkgPSB0aGlzLmhpc3Rvcnkuc2xpY2UoLUhJU1RPUllfTElNSVQpXG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuaGlzdElkeCA9IHRoaXMuaGlzdG9yeS5sZW5ndGggLSAxXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMucGVyc2lzdCgpXG4gICAgfSxcblxuICAgIC8qKiDkvqfmoI8v5qCR54K55Ye75omT5byA6KeG6KeS77yI5L+d55WZ5penIEFQSSDlkI3vvIznrYnku7cgc2V0Vmlld++8iSAqL1xuICAgIG9wZW5WaWV3KHZpZXc6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgdGhpcy5zZXRWaWV3KHZpZXcsIHRpdGxlKVxuICAgIH0sXG5cbiAgICBiYWNrKCk6IHZvaWQge1xuICAgICAgaWYgKCF0aGlzLmNhbkJhY2spIHJldHVyblxuICAgICAgY29uc3QgcHJldlZpZXcgPSB0aGlzLnRhYi52aWV3XG4gICAgICBjb25zdCBjYXJyaWVkID0gdGhpcy5maWx0ZXJMb2NrZWQgPyBwaWNrRmlsdGVyRmllbGRzKHRoaXMudGFiKSA6IG51bGxcbiAgICAgIHRoaXMuaGlzdElkeCAtPSAxXG4gICAgICBjb25zdCB2aWV3ID0gdGhpcy5oaXN0b3J5W3RoaXMuaGlzdElkeF1cbiAgICAgIHRoaXMudGFiLnZpZXcgPSB2aWV3XG4gICAgICB0aGlzLnRhYi50aXRsZSA9IGRlZmF1bHRUaXRsZUZvclZpZXcodmlldylcbiAgICAgIGlmIChjYXJyaWVkKSB7XG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50YWIsIGNhcnJpZWQpXG4gICAgICB9IGVsc2UgaWYgKHZpZXcgIT09IHByZXZWaWV3KSB7XG4gICAgICAgIGFwcGx5RnJlc2hGaWx0ZXJGaWVsZHModGhpcy50YWIpXG4gICAgICB9XG4gICAgICB0aGlzLnBlcnNpc3QoKVxuICAgIH0sXG5cbiAgICBmb3J3YXJkKCk6IHZvaWQge1xuICAgICAgaWYgKCF0aGlzLmNhbkZvcndhcmQpIHJldHVyblxuICAgICAgY29uc3QgcHJldlZpZXcgPSB0aGlzLnRhYi52aWV3XG4gICAgICBjb25zdCBjYXJyaWVkID0gdGhpcy5maWx0ZXJMb2NrZWQgPyBwaWNrRmlsdGVyRmllbGRzKHRoaXMudGFiKSA6IG51bGxcbiAgICAgIHRoaXMuaGlzdElkeCArPSAxXG4gICAgICBjb25zdCB2aWV3ID0gdGhpcy5oaXN0b3J5W3RoaXMuaGlzdElkeF1cbiAgICAgIHRoaXMudGFiLnZpZXcgPSB2aWV3XG4gICAgICB0aGlzLnRhYi50aXRsZSA9IGRlZmF1bHRUaXRsZUZvclZpZXcodmlldylcbiAgICAgIGlmIChjYXJyaWVkKSB7XG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50YWIsIGNhcnJpZWQpXG4gICAgICB9IGVsc2UgaWYgKHZpZXcgIT09IHByZXZWaWV3KSB7XG4gICAgICAgIGFwcGx5RnJlc2hGaWx0ZXJGaWVsZHModGhpcy50YWIpXG4gICAgICB9XG4gICAgICB0aGlzLnBlcnNpc3QoKVxuICAgIH0sXG5cbiAgICAvKiog5LqM5Y2B5YWt6L2u77ya5riF6Zmk5YWo6YOo57u05bqm562b6YCJ77yIRWFnbGUgaWMtZmlsdGVyLXJlc2V077yJICovXG4gICAgY2xlYXJEaW1lbnNpb25GaWx0ZXJzKCk6IHZvaWQge1xuICAgICAgYXBwbHlGcmVzaEZpbHRlckZpZWxkcyh0aGlzLnRhYilcbiAgICAgIHRoaXMucGVyc2lzdCgpXG4gICAgfSxcblxuICAgIC8qKiDkuozljYHlha3ova7vvJrliIfmjaLplIHlrprnrZvpgIkgKi9cbiAgICB0b2dnbGVGaWx0ZXJMb2NrKCk6IHZvaWQge1xuICAgICAgdGhpcy5maWx0ZXJMb2NrZWQgPSAhdGhpcy5maWx0ZXJMb2NrZWRcbiAgICAgIHRoaXMucGVyc2lzdCgpXG4gICAgfSxcblxuICAgIC8qKiDovbvph4/mjIHkuYXljJbvvJrnrZvpgIkv5biD5bGA562J5a2X5q616KKr5aSW6YOo55u05o6l5pS55YaZ5ZCO6LCD55So77yIRmlsdGVyQmFyL1RpdGxlQmFy77yJICovXG4gICAgdG91Y2goKTogdm9pZCB7XG4gICAgICB0aGlzLnBlcnNpc3QoKVxuICAgIH0sXG5cbiAgICAvKiog6KeG5Zu+5bGC5pWw5o2u5bCx57uq5ZCO5L+u5q2j5qCH6aKY77yI55u45YaML+aWh+S7tuWkuS/mmbrog73lpLnnnJ/lkI3vvIkgKi9cbiAgICBzeW5jVGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgaWYgKHRoaXMudGFiLnRpdGxlICE9PSB0aXRsZSkge1xuICAgICAgICB0aGlzLnRhYi50aXRsZSA9IHRpdGxlXG4gICAgICAgIHRoaXMucGVyc2lzdCgpXG4gICAgICB9XG4gICAgfSxcblxuICAgIC8qKiDmlbDmja7pqbHliqjmoIfpopjvvJrnm7jlhowv5pm66IO95aS5L+aWh+S7tuWkueabtOWQjeWQjueUseinhuWbvuWxguiwg+eUqCAqL1xuICAgIHJldGl0bGVCeVZpZXdQcmVmaXgocHJlZml4OiBzdHJpbmcsIGlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgIGlmICh0aGlzLnRhYi52aWV3ID09PSBgJHtwcmVmaXh9JHtpZH1gKSB7XG4gICAgICAgIHRoaXMudGFiLnRpdGxlID0gdGl0bGVcbiAgICAgIH1cbiAgICAgIHRoaXMucGVyc2lzdCgpXG4gICAgfSxcblxuICAgIC8qKiDop4bop5LlpLHmlYjvvIjnm7jlhowv5pm66IO95aS5L+aWh+S7tuWkueiiq+WIoO+8ie+8muWbnumAgOWbvuW6k+W5tuaIquaWreWOhuWPsiAqL1xuICAgIGludmFsaWRhdGVWaWV3cyhjaGVjazogKHZpZXc6IHN0cmluZykgPT4gYm9vbGVhbik6IHZvaWQge1xuICAgICAgaWYgKGNoZWNrKHRoaXMudGFiLnZpZXcpKSB7XG4gICAgICAgIC8vIOS4jiBzZXRWaWV3IOivreS5ieWvuem9kO+8iOWuoeafpSBQMy0zMe+8ie+8muacqumUgeWumuaXtua4heaOiee7tOW6puetm+mAie+8jFxuICAgICAgICAvLyDlkKbliJnlpLHmlYjop4blm77lhoXnmoTnrZvpgInooqvljp/moLfluKbov5vjgIzlhajpg6jjgI3vvIzntKDmnZDojqvlkI3lj5jlsJFcbiAgICAgICAgaWYgKCF0aGlzLmZpbHRlckxvY2tlZCkgYXBwbHlGcmVzaEZpbHRlckZpZWxkcyh0aGlzLnRhYilcbiAgICAgICAgdGhpcy50YWIudmlldyA9ICdhbGwnXG4gICAgICAgIHRoaXMudGFiLnRpdGxlID0gJ+WFqOmDqCdcbiAgICAgIH1cbiAgICAgIHRoaXMuaGlzdG9yeSA9IHRoaXMuaGlzdG9yeS5maWx0ZXIoKHYpID0+ICFjaGVjayh2KSlcbiAgICAgIGlmICh0aGlzLmhpc3RvcnkubGVuZ3RoID09PSAwKSB0aGlzLmhpc3RvcnkgPSBbJ2FsbCddXG4gICAgICB0aGlzLmhpc3RJZHggPSBNYXRoLm1pbih0aGlzLmhpc3RJZHgsIHRoaXMuaGlzdG9yeS5sZW5ndGggLSAxKVxuICAgICAgaWYgKHRoaXMuaGlzdG9yeVt0aGlzLmhpc3RJZHhdICE9PSB0aGlzLnRhYi52aWV3KSB7XG4gICAgICAgIHRoaXMuaGlzdElkeCA9IHRoaXMuaGlzdG9yeS5pbmRleE9mKHRoaXMudGFiLnZpZXcpXG4gICAgICAgIGlmICh0aGlzLmhpc3RJZHggPCAwKSB7XG4gICAgICAgICAgdGhpcy5oaXN0SWR4ID0gdGhpcy5oaXN0b3J5Lmxlbmd0aCAtIDFcbiAgICAgICAgICB0aGlzLnRhYi52aWV3ID0gdGhpcy5oaXN0b3J5W3RoaXMuaGlzdElkeF1cbiAgICAgICAgICB0aGlzLnRhYi50aXRsZSA9IGRlZmF1bHRUaXRsZUZvclZpZXcodGhpcy50YWIudmlldylcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5wZXJzaXN0KClcbiAgICB9LFxuXG4gICAgLyoqIOa1i+ivlei+heWKqe+8mua4heepuuaMgeS5heWMluW5tumHjee9ruS4uum7mOiupOinhuWbviAqL1xuICAgIHJlc2V0Rm9yVGVzdHMoKTogdm9pZCB7XG4gICAgICB0cnkge1xuICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShTVE9SQUdFX0tFWSlcbiAgICAgICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oTEVHQUNZX1NUT1JBR0VfS0VZKVxuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8qIGlnbm9yZSAqL1xuICAgICAgfVxuICAgICAgdGhpcy50YWIgPSBtYWtlVGFiKClcbiAgICAgIHRoaXMuaGlzdG9yeSA9IFsnYWxsJ11cbiAgICAgIHRoaXMuaGlzdElkeCA9IDBcbiAgICAgIHRoaXMuZmlsdGVyTG9ja2VkID0gZmFsc2VcbiAgICB9XG4gIH1cbn0pXG5cbi8qKiDop4blm77pu5jorqTmoIfpopjvvIjmlbDmja7pqbHliqjmoIfpopjopobnm5bliY3lhYjnu5nkuKrlhZzlupXvvIkgKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWZhdWx0VGl0bGVGb3JWaWV3KHZpZXc6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICh2aWV3ID09PSAnYWxsJykgcmV0dXJuICflhajpg6gnXG4gIGlmICh2aWV3ID09PSAndW50YWdnZWQnKSByZXR1cm4gJ+acquWKoOagh+etvidcbiAgaWYgKHZpZXcgPT09ICdmYXZvcml0ZXMnKSByZXR1cm4gJ+aUtuiXjydcbiAgaWYgKHZpZXcgPT09ICdtYXAnKSByZXR1cm4gJ+WcsOWbvidcbiAgaWYgKHZpZXcgPT09ICd0cmFzaCcpIHJldHVybiAn5Zue5pS256uZJ1xuICBpZiAodmlldyA9PT0gJ2R1cGxpY2F0ZXMnKSByZXR1cm4gJ+ebuOS8vOafpemHjSdcbiAgaWYgKHZpZXcgPT09ICd1bnNvcnRlZCcpIHJldHVybiAn5pyq5YiG57G7J1xuICBpZiAodmlldyA9PT0gJ3JlY2VudCcpIHJldHVybiAn5pyA6L+R5re75YqgJ1xuICBpZiAodmlldyA9PT0gJ3JlY2VudHMnKSByZXR1cm4gJ+acgOi/keafpeeciydcbiAgaWYgKHZpZXcuc3RhcnRzV2l0aCgnc2ltaWxhcjonKSkgcmV0dXJuICfnm7jkvLzlm77niYcnXG4gIGlmICh2aWV3LnN0YXJ0c1dpdGgoJ3NtYXJ0OicpKSByZXR1cm4gJ+aZuuiDveaWh+S7tuWkuSdcbiAgaWYgKHZpZXcuc3RhcnRzV2l0aCgnYWxidW06JykpIHJldHVybiAn55u45YaMJ1xuICBpZiAodmlldy5zdGFydHNXaXRoKCdmb2xkZXI6JykpIHJldHVybiAn5paH5Lu25aS5J1xuICBpZiAodmlldy5zdGFydHNXaXRoKCd0YWc6JykpIHJldHVybiAn5qCH562+J1xuICByZXR1cm4gJ+WbvuW6kydcbn1cbiJdLCJtYXBwaW5ncyI6IkFBWUEsU0FBUyxtQkFBbUI7QUE2RHJCLGdCQUFTLHFCQUFxQztBQUNuRCxTQUFPO0FBQUEsSUFDTCxVQUFVO0FBQUEsSUFDVixhQUFhO0FBQUEsSUFDYixlQUFlO0FBQUE7QUFBQSxJQUVmLG9CQUFvQjtBQUFBLElBQ3BCLGdCQUFnQjtBQUFBLElBQ2hCLG1CQUFtQjtBQUFBO0FBQUEsSUFFbkIsY0FBYztBQUFBLElBQ2QsZUFBZTtBQUFBO0FBQUEsSUFFZixhQUFhO0FBQUEsSUFDYixpQkFBaUI7QUFBQSxFQUNuQjtBQUNGO0FBaUZBLE1BQU0sY0FBYztBQUNwQixNQUFNLHFCQUFxQjtBQUUzQixNQUFNLGdCQUFnQjtBQUVmLGdCQUFTLFFBQVEsT0FBTyxPQUFPLFFBQVEsTUFBa0I7QUFDOUQsU0FBTztBQUFBLElBQ0w7QUFBQSxJQUNBO0FBQUEsSUFDQSxZQUFZO0FBQUEsSUFDWixhQUFhO0FBQUEsSUFDYixZQUFZO0FBQUEsSUFDWixZ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