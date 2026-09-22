/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$B = /* @__PURE__ */ defineComponent(
*/
{
  __name: "FilterBar",
  setup(__props, { expose: __expose }) {
    const tabs = useLibraryTabs();
    const actions = usePhotoActions();
    const filters = usePhotoFilters();
    const scan = useDuplicateScan();
    const tab = computed(() => tabs.active);
    const semantic = useSemanticSearch();
    const pool = filters.currentPool;
    const showKindChips = computed(() => filters.showFilters.value && tab.value.view !== "map");
    const showAlbumActions = computed(() => !!filters.activeAlbum.value);
    const showFolderActions = computed(() => !!filters.activeFolder.value);
    const showSmartActions = computed(() => !!filters.activeSmartAlbum.value);
    function editActiveSmart() {
      if (filters.activeSmartAlbum.value) actions.openSmartAlbumModal(filters.activeSmartAlbum.value);
    }
    function deleteActiveSmart() {
      if (filters.activeSmartAlbum.value) actions.deleteSmartAlbumById(filters.activeSmartAlbum.value);
    }
    function renameActiveAlbum() {
      const album = filters.activeAlbum.value;
      if (album) actions.renameAlbumById(album.id, album.name);
    }
    function deleteActiveAlbum() {
      const album = filters.activeAlbum.value;
      if (album) actions.deleteAlbumById(album.id, album.name);
    }
    function deleteActiveFolder() {
      const folder = filters.activeFolder.value;
      if (folder) actions.deleteFolderById(folder.id, folder.name);
    }
    const pinned = ref(loadPinnedDimensions());
    const dimOrder = ref(loadDimensionOrder());
    const pinnedOrdered = computed(() => dimOrder.value.filter((id3) => pinned.value.includes(id3)));
    const tagsChipRef = ref(null);
    function openTagFilter() {
      const chip = Array.isArray(tagsChipRef.value) ? tagsChipRef.value[0] : tagsChipRef.value;
      chip?.show();
    }
    __expose({ openTagFilter });
    function togglePin(id3) {
      const i2 = pinned.value.indexOf(id3);
      if (i2 >= 0) pinned.value.splice(i2, 1);
      else pinned.value.push(id3);
      savePinnedDimensions([...pinned.value]);
      window.dispatchEvent(new CustomEvent("leaf:dimensions-changed"));
    }
    function onReorder(from, to2) {
      dimOrder.value = reorderDimension(from, to2);
      window.dispatchEvent(new CustomEvent("leaf:dimensions-changed"));
    }
    function onDimsChanged() {
      pinned.value = loadPinnedDimensions();
      dimOrder.value = loadDimensionOrder();
    }
    onMounted(() => window.addEventListener("leaf:dimensions-changed", onDimsChanged));
    onBeforeUnmount(() => window.removeEventListener("leaf:dimensions-changed", onDimsChanged));
    function arrayRowState(include, exclude, key) {
      if (include.includes(key)) return "include";
      if (exclude.includes(key)) return "exclude";
      return "off";
    }
    function toggleIn(list2, key, opposite) {
      const i2 = list2.indexOf(key);
      if (i2 >= 0) list2.splice(i2, 1);
      else list2.push(key);
      const j2 = opposite.indexOf(key);
      if (j2 >= 0) opposite.splice(j2, 1);
      tabs.persist();
    }
    const ORIENTATIONS = [
      { key: "landscape", label: "横图" },
      { key: "portrait", label: "竖图" },
      { key: "square", label: "方形" },
      { key: "panoramic", label: "细长横图" },
      { key: "panoramicPortrait", label: "细长竖图" }
    ];
    const SHAPE_LABEL = Object.fromEntries(
      ORIENTATIONS.map((o2) => [o2.key, o2.label])
    );
    const RATIO_PRESETS = [
      { label: "1:1", ratio: [1, 1] },
      { label: "4:3", ratio: [4, 3] },
      { label: "3:4", ratio: [3, 4] },
      { label: "3:2", ratio: [3, 2] },
      { label: "2:3", ratio: [2, 3] },
      { label: "16:9", ratio: [16, 9] },
      { label: "9:16", ratio: [9, 16] }
    ];
    const customW = ref(null);
    const customH = ref(null);
    function applyCustomRatio() {
      const w2 = customW.value;
      const h2 = customH.value;
      if (w2 && h2 && w2 > 0 && h2 > 0) {
        tab.value.ratioFilter = [w2, h2];
      } else {
        tab.value.ratioFilter = null;
      }
      tabs.persist();
    }
    function isRatioActive(ratio) {
      const r2 = tab.value.ratioFilter;
      return !!r2 && r2[0] === ratio[0] && r2[1] === ratio[1];
    }
    function toggleRatioPreset(ratio) {
      tab.value.ratioFilter = isRatioActive(ratio) ? null : ratio;
      tabs.persist();
    }
    function ratioVisible(label) {
      return (ratioCounts.value[label] ?? 0) > 0 || RATIO_PRESETS.some((p2) => p2.label === label && isRatioActive(p2.ratio));
    }
    function shapeRowState(key) {
      return arrayRowState(tab.value.shapeInclude, tab.value.shapeExclude, key);
    }
    function toggleShapeInclude(key) {
      toggleIn(tab.value.shapeInclude, key, tab.value.shapeExclude);
    }
    function toggleShapeExclude(key) {
      toggleIn(tab.value.shapeExclude, key, tab.value.shapeInclude);
    }
    const RATING_OPTIONS = [1, 2, 3, 4, 5, 0];
    function ratingLabel(r2) {
      if (r2 === 0) return "尚未评分";
      return "★".repeat(r2) + "☆".repeat(5 - r2);
    }
    function ratingRowState(r2) {
      if (tab.value.ratingInclude.includes(r2)) return "include";
      if (tab.value.ratingExclude.includes(r2)) return "exclude";
      return "off";
    }
    function toggleNumIn(list2, key, opposite) {
      const i2 = list2.indexOf(key);
      if (i2 >= 0) list2.splice(i2, 1);
      else list2.push(key);
      const j2 = opposite.indexOf(key);
      if (j2 >= 0) opposite.splice(j2, 1);
      tabs.persist();
    }
    function toggleRatingInclude(r2) {
      toggleNumIn(tab.value.ratingInclude, r2, tab.value.ratingExclude);
    }
    function toggleRatingExclude(r2) {
      toggleNumIn(tab.value.ratingExclude, r2, tab.value.ratingInclude);
    }
    const formatSearch = ref("");
    const visibleFormats = computed(() => {
      const q3 = formatSearch.value.trim().toLowerCase();
      if (!q3) return filters.availableFormats.value;
      return filters.availableFormats.value.filter((f2) => f2.toLowerCase().includes(q3));
    });
    function formatRowState(f2) {
      return arrayRowState(tab.value.formatInclude, tab.value.formatExclude, f2);
    }
    function toggleFormatInclude(f2) {
      toggleIn(tab.value.formatInclude, f2, tab.value.formatExclude);
    }
    function toggleFormatExclude(f2) {
      toggleIn(tab.value.formatExclude, f2, tab.value.formatInclude);
    }
    const formatCounts = computed(() => {
      const out = {};
      for (const p2 of pool.value) {
        const ext = extOfFile(p2);
        if (!ext) continue;
        out[ext] = (out[ext] ?? 0) + 1;
      }
      return out;
    });
    const ratingCounts = computed(() => {
      const out = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const p2 of pool.value) out[p2.rating] = (out[p2.rating] ?? 0) + 1;
      return out;
    });
    const shapeCounts = computed(() => {
      const c2 = {
        landscape: 0,
        portrait: 0,
        square: 0,
        panoramic: 0,
        panoramicPortrait: 0
      };
      for (const p2 of pool.value) {
        const v2 = shapeOf(p2);
        if (v2) c2[v2]++;
      }
      return c2;
    });
    const ratioCounts = computed(() => {
      const out = {};
      for (const preset of RATIO_PRESETS) out[preset.label] = 0;
      for (const p2 of pool.value) {
        for (const preset of RATIO_PRESETS) {
          if (ratioMatches(p2, preset.ratio)) out[preset.label]++;
        }
      }
      return out;
    });
    const resolutionCounts = computed(() => {
      const out = { "1k": 0, "2k": 0, "4k": 0 };
      for (const p2 of pool.value) {
        const maxDim = Math.max(p2.width ?? 0, p2.height ?? 0);
        if (maxDim >= RESOLUTION_MIN["1k"]) out["1k"]++;
        if (maxDim >= RESOLUTION_MIN["2k"]) out["2k"]++;
        if (maxDim >= RESOLUTION_MIN["4k"]) out["4k"]++;
      }
      return out;
    });
    const TIME_PRESET_KEYS = ["today", "yesterday", "7d", "30d", "90d", "365d"];
    const TIME_PRESET_LABEL = {
      today: "今日",
      yesterday: "昨日",
      "7d": "最近 7 日",
      "30d": "最近 30 日",
      "90d": "最近 90 日",
      "365d": "最近 365 日"
    };
    const timeCounts = computed(() => {
      const out = {};
      for (const t3 of TIME_PRESET_KEYS) out[t3] = 0;
      for (const p2 of pool.value) {
        for (const t3 of TIME_PRESET_KEYS) {
          if (matchImportTimePreset(p2, t3)) out[t3]++;
        }
      }
      return out;
    });
    const SIZE_PRESETS = [
      { key: "lt1", label: "< 1 MB", range: [0, 1048576] },
      { key: "1to10", label: "1 ~ 10 MB", range: [1048576, 10485760] },
      { key: "10to100", label: "10 ~ 100 MB", range: [10485760, 104857600] },
      { key: "gt100", label: "> 100 MB", range: [104857600, Number.MAX_SAFE_INTEGER] }
    ];
    const sizeCounts = computed(() => {
      const out = {};
      for (const preset of SIZE_PRESETS) out[preset.key] = 0;
      for (const p2 of pool.value) {
        for (const preset of SIZE_PRESETS) {
          if (p2.fileSize >= preset.range[0] && p2.fileSize <= preset.range[1]) out[preset.key]++;
        }
      }
      return out;
    });
    const DURATION_PRESETS = [
      { key: "lt30s", label: "< 30 秒", range: [0, 3e4] },
      { key: "30s5m", label: "30 秒 ~ 5 分钟", range: [3e4, 3e5] },
      { key: "gt5m", label: "> 5 分钟", range: [3e5, Number.MAX_SAFE_INTEGER] }
    ];
    const durationCounts = computed(() => {
      const out = {};
      for (const preset of DURATION_PRESETS) out[preset.key] = 0;
      for (const p2 of pool.value) {
        if (p2.durationMs == null) continue;
        for (const preset of DURATION_PRESETS) {
          if (p2.durationMs >= preset.range[0] && p2.durationMs <= preset.range[1]) out[preset.key]++;
        }
      }
      return out;
    });
    const nowTick = ref(Date.now());
    const midnightTimer = window.setInterval(() => {
      nowTick.value = Date.now();
    }, 6e4);
    onBeforeUnmount(() => window.clearInterval(midnightTimer));
    function dayStart(offsetDays) {
      const base2 = new Date(nowTick.value);
      const today = base2.setHours(0, 0, 0, 0);
      if (offsetDays === 0) return today;
      return today - offsetDays * 864e5;
    }
    const MOD_PRESETS = computed(() => [
      { key: "today", label: "今日修改", from: dayStart(0) },
      { key: "7d", label: "最近 7 日修改", from: dayStart(7) },
      { key: "30d", label: "最近 30 日修改", from: dayStart(30) }
    ]);
    const modCounts = computed(() => {
      const out = {};
      for (const preset of MOD_PRESETS.value) out[preset.key] = 0;
      for (const p2 of pool.value) {
        if (p2.fsModifiedAt == null) continue;
        for (const preset of MOD_PRESETS.value) {
          if (p2.fsModifiedAt >= preset.from) out[preset.key]++;
        }
      }
      return out;
    });
    function clearResolution(close) {
      tab.value.resolutionFilter = "";
      tabs.persist();
      close();
    }
    function pickResolution(v2, close) {
      tab.value.resolutionFilter = tab.value.resolutionFilter === v2 ? "" : v2;
      tabs.persist();
      close();
    }
    function clearTime(close) {
      tab.value.timeFilter = "";
      tabs.persist();
      close();
    }
    function pickTime(t3, close) {
      tab.value.timeFilter = tab.value.timeFilter === t3 ? "" : t3;
      tabs.persist();
      close();
    }
    function clearSize(close) {
      tab.value.sizeRange = null;
      tabs.persist();
      close();
    }
    const sizeKey = computed(() => {
      const r2 = tab.value.sizeRange;
      if (!r2) return "";
      const hit = SIZE_PRESETS.find((p2) => p2.range[0] === r2[0] && p2.range[1] === r2[1]);
      return hit ? hit.key : "custom";
    });
    function pickSize(key, close) {
      if (tab.value.sizeRange && sizeKey.value === key) {
        tab.value.sizeRange = null;
      } else {
        const hit = SIZE_PRESETS.find((p2) => p2.key === key);
        tab.value.sizeRange = hit ? hit.range : null;
      }
      tabs.persist();
      close();
    }
    const minKb = computed(() => Math.round((tab.value.sizeRange?.[0] ?? 0) / 1024));
    const maxKb = computed(() => Math.round((tab.value.sizeRange?.[1] ?? 0) / 1024));
    function onMinKb(e64) {
      const v2 = Number(e64.target.value) * 1024;
      tab.value.sizeRange = [v2, tab.value.sizeRange?.[1] ?? 0];
      tabs.persist();
    }
    function onMaxKb(e64) {
      const v2 = Number(e64.target.value) * 1024;
      tab.value.sizeRange = [tab.value.sizeRange?.[0] ?? 0, v2];
      tabs.persist();
    }
    function clearDuration(close) {
      tab.value.durationRange = null;
      tabs.persist();
      close();
    }
    const durationKey = computed(() => {
      const r2 = tab.value.durationRange;
      if (!r2) return "";
      const hit = DURATION_PRESETS.find((p2) => p2.range[0] === r2[0] && p2.range[1] === r2[1]);
      return hit ? hit.key : "custom";
    });
    function pickDuration(key, close) {
      if (tab.value.durationRange && durationKey.value === key) {
        tab.value.durationRange = null;
      } else {
        const hit = DURATION_PRESETS.find((p2) => p2.key === key);
        tab.value.durationRange = hit ? hit.range : null;
      }
      tabs.persist();
      close();
    }
    function toDateInput(ms2) {
      if (!ms2) return "";
      const d2 = new Date(ms2);
      return `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}-${String(d2.getDate()).padStart(2, "0")}`;
    }
    function onFromDate(e64) {
      const v2 = e64.target.value;
      const ms2 = v2 ? new Date(v2).getTime() : 0;
      tab.value.customTime = [ms2, tab.value.customTime?.[1] ?? 0];
      tabs.persist();
    }
    function onToDate(e64) {
      const v2 = e64.target.value;
      const ms2 = v2 ? new Date(v2).getTime() + 86399e3 : 0;
      tab.value.customTime = [tab.value.customTime?.[0] ?? 0, ms2];
      tabs.persist();
    }
    function clearCustomTime() {
      tab.value.customTime = null;
      tabs.persist();
    }
    function clearModified(close) {
      tab.value.modifiedTimeRange = null;
      tabs.persist();
      close();
    }
    function onModFrom(e64) {
      const v2 = e64.target.value;
      const ms2 = v2 ? new Date(v2).getTime() : 0;
      tab.value.modifiedTimeRange = [ms2, tab.value.modifiedTimeRange?.[1] ?? 0];
      tabs.persist();
    }
    function onModTo(e64) {
      const v2 = e64.target.value;
      const ms2 = v2 ? new Date(v2).getTime() + 86399e3 : 0;
      tab.value.modifiedTimeRange = [tab.value.modifiedTimeRange?.[0] ?? 0, ms2];
      tabs.persist();
    }
    const modKey = computed(() => {
      const r2 = tab.value.modifiedTimeRange;
      if (!r2) return "";
      const hit = MOD_PRESETS.value.find((p2) => p2.from === r2[0]);
      return hit ? hit.key : "custom";
    });
    function pickMod(key, close) {
      if (tab.value.modifiedTimeRange && modKey.value === key) {
        tab.value.modifiedTimeRange = null;
      } else {
        const hit = MOD_PRESETS.value.find((p2) => p2.key === key);
        tab.value.modifiedTimeRange = hit ? [hit.from, 0] : null;
      }
      tabs.persist();
      close();
    }
    function clearNoteKeyword() {
      tab.value.noteKeyword = "";
      tabs.persist();
    }
    function clearUrlKeyword() {
      tab.value.urlKeyword = "";
      tabs.persist();
    }
    const hasFilters = filters.hasDimensionFilters;
    const formatToken = computed(() => {
      const inc = tab.value.formatInclude;
      const ex2 = tab.value.formatExclude;
      if (inc.length > 0) return inc.join("/");
      if (ex2.length > 0) return `-${ex2.join("/")}`;
      return void 0;
    });
    const shapeToken = computed(() => {
      const inc = tab.value.shapeInclude;
      const ex2 = tab.value.shapeExclude;
      if (inc.length > 0) return inc.map((v2) => SHAPE_LABEL[v2]).join("/");
      if (ex2.length > 0) return `-${ex2.map((v2) => SHAPE_LABEL[v2]).join("/")}`;
      return void 0;
    });
    const ratingToken = computed(() => {
      const inc = tab.value.ratingInclude;
      const ex2 = tab.value.ratingExclude;
      const fmt = (r2) => r2 === 0 ? "未评分" : `${r2}★`;
      if (inc.length > 0) return inc.map(fmt).join("/");
      if (ex2.length > 0) return `-${ex2.map(fmt).join("/")}`;
      return void 0;
    });
    const tagsToken = computed(() => {
      const t3 = tab.value;
      const parts = [];
      if (t3.tagFilter.length > 0) parts.push(t3.tagFilter.join("/"));
      if (t3.untaggedOnly) parts.push("未标签");
      if (parts.length > 0) return parts.join("+");
      if (t3.tagExclude.length > 0) return `-${t3.tagExclude.join("/")}`;
      return void 0;
    });
    const foldersToken = computed(() => {
      const t3 = tab.value;
      if (t3.folderFilterIds.length > 0) return `${t3.folderFilterIds.length} 项`;
      if (t3.folderExcludeIds.length > 0) return `-${t3.folderExcludeIds.length} 项`;
      return void 0;
    });
    function saveAsSmartAlbum() {
      const rules = buildFiltersSpec();
      const unmapped = [];
      const kw = tab.value.searchKeyword.trim();
      if (kw && semantic.enabled.value && semantic.state.value.ranQuery === kw) {
        rules.semanticQuery = kw;
      } else if (kw) {
        unmapped.push("搜索关键词");
      }
      if (Object.keys(rules).length === 0) {
        useToast().info("当前没有可保存的筛选条件");
        return;
      }
      if (unmapped.length > 0) {
        useToast().info(`以下筛选条件不会带入智能文件夹：${unmapped.join("、")}`);
      }
      actions.openSmartAlbumModal(null, rules);
    }
    function applySavedFilterRules(rules) {
      const { fields, scopes, unsupported } = rulesToFilters(rules);
      tabs.clearDimensionFilters();
      Object.assign(tabs.active, fields);
      if (!("searchKeyword" in fields)) tabs.active.searchKeyword = "";
      if (scopes) saveSearchScopes(scopes);
      tabs.persist();
      if (unsupported.length > 0) {
        useToast().info(`预设里有 ${unsupported.length} 项没法在筛选行显示：${unsupported.join("、")}`);
      }
    }
    const unpinnedActive = computed(() => {
      return dimOrder.value.filter(
        (id3) => !pinned.value.includes(id3) && id3 !== "aiImage" && isDimActive(id3)
      );
    });
    function isDimActive(id3) {
      switch (id3) {
        case "color":
          return !!tab.value.colorFilter || !!tab.value.colorClose;
        case "tags":
          return tab.value.tagFilter.length > 0 || tab.value.tagExclude.length > 0 || tab.value.untaggedOnly;
        case "folders":
          return !!tab.value.folderFilter || tab.value.folderFilterIds.length > 0 || tab.value.folderExcludeIds.length > 0;
        case "shape":
          return tab.value.shapeInclude.length > 0 || tab.value.shapeExclude.length > 0 || !!tab.value.ratioFilter;
        case "rating":
          return tab.value.ratingInclude.length > 0 || tab.value.ratingExclude.length > 0;
        case "format":
          return tab.value.formatInclude.length > 0 || tab.value.formatExclude.length > 0;
        case "resolution":
          return !!tab.value.resolutionFilter;
        case "size":
          return !!tab.value.sizeRange;
        case "duration":
          return !!tab.value.durationRange;
        case "notes":
          return !!tab.value.noteKeyword;
        case "url":
          return !!tab.value.urlKeyword;
        case "time":
          return !!tab.value.timeFilter || !!tab.value.customTime;
        case "modifiedDate":
          return !!tab.value.modifiedTimeRange;
        case "aiImage":
          return false;
      }
    }
    function clearDim(id3) {
      switch (id3) {
        case "color":
          tab.value.colorFilter = null;
          tab.value.colorClose = null;
          break;
        case "tags":
          tab.value.tagFilter = [];
          tab.value.tagExclude = [];
          tab.value.untaggedOnly = false;
          break;
        case "folders":
          tab.value.folderFilter = "";
          tab.value.folderFilterIds = [];
          tab.value.folderExcludeIds = [];
          break;
        case "shape":
          tab.value.shapeInclude = [];
          tab.value.shapeExclude = [];
          tab.value.ratioFilter = null;
          break;
        case "rating":
          tab.value.ratingInclude = [];
          tab.value.ratingExclude = [];
          break;
        case "format":
          tab.value.formatInclude = [];
          tab.value.formatExclude = [];
          break;
        case "resolution":
          tab.value.resolutionFilter = "";
          break;
        case "size":
          tab.value.sizeRange = null;
          break;
        case "duration":
          tab.value.durationRange = null;
          break;
        case "notes":
          tab.value.noteKeyword = "";
          break;
        case "url":
          tab.value.urlKeyword = "";
          break;
        case "time":
          tab.value.timeFilter = "";
          tab.value.customTime = null;
          break;
        case "modifiedDate":
          tab.value.modifiedTimeRange = null;
          break;
      }
      tabs.persist();
    }
    const isTagsActive = computed(
      () => tab.value.tagFilter.length > 0 || tab.value.tagExclude.length > 0 || tab.value.untaggedOnly
    );
    const isFoldersActive = computed(
      () => !!tab.value.folderFilter || tab.value.folderFilterIds.length > 0 || tab.value.folderExcludeIds.length > 0
    );
    let persistTimer;
    watch(
      tab,
      () => {
        window.clearTimeout(persistTimer);
        persistTimer = window.setTimeout(() => tabs.persist(), 250);
      },
      { deep: true }
    );
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$B, [
        showSmartActions.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
          createBaseVNode("span", _hoisted_2$A, toDisplayString(unref(filters).activeSmartAlbum.value?.name), 1),
          createBaseVNode("button", {
            class: "bar-action",
            onClick: editActiveSmart
          }, "编辑规则"),
          createBaseVNode("button", {
            class: "bar-action text-danger",
            onClick: deleteActiveSmart
          }, "删除收藏夹")
        ], 64)) : showAlbumActions.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          createBaseVNode("span", _hoisted_3$w, toDisplayString(unref(filters).activeAlbum.value?.name), 1),
          createBaseVNode("button", {
            class: "bar-action",
            onClick: renameActiveAlbum
          }, "重命名"),
          createBaseVNode("button", {
            class: "bar-action text-danger",
            onClick: deleteActiveAlbum
          }, "删除相册")
        ], 64)) : showFolderActions.value ? (openBlock(), createElementBlock("button", {
          key: 2,
          class: "bar-action text-danger",
          onClick: deleteActiveFolder
        }, "删除文件夹")) : unref(filters).isTrashView.value ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
          _cache[11] || (_cache[11] = createBaseVNode("span", { class: "text-sm font-medium text-fg-primary" }, "回收站", -1)),
          createBaseVNode("button", {
            class: "bar-action text-danger",
            onClick: _cache[0] || (_cache[0] = ($event) => unref(actions).handleClearRecycleBin())
          }, " 清空回收站 ")
        ], 64)) : unref(filters).isDuplicateView.value ? (openBlock(), createElementBlock("span", _hoisted_4$t, "相似查重")) : unref(filters).isSimilarView.value ? (openBlock(), createElementBlock("span", _hoisted_5$t, " 与「" + toDisplayString(unref(scan).similarSourceName.value) + "」相似 ", 1)) : createCommentVNode("", true),
        showKindChips.value ? (openBlock(), createElementBlock(Fragment, { key: 6 }, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(pinnedOrdered.value, (dimId) => {
            return openBlock(), createElementBlock(Fragment, { key: dimId }, [
              dimId === "color" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 0,
                label: "颜色",
                icon: "context-menu/ic-filter-item-color",
                active: !!tab.value.colorFilter || !!tab.value.colorClose
              }, {
                panel: withCtx(() => [
                  createVNode(_sfc_main$E)
                ]),
                _: 1
              }, 8, ["active"])) : dimId === "tags" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 1,
                ref_for: true,
                ref_key: "tagsChipRef",
                ref: tagsChipRef,
                label: "标签",
                icon: "context-menu/ic-filter-item-tag",
                active: isTagsActive.value,
                token: tagsToken.value
              }, {
                panel: withCtx(() => [
                  createVNode(_sfc_main$D)
                ]),
                _: 1
              }, 8, ["active", "token"])) : dimId === "folders" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 2,
                label: "文件夹",
                icon: "context-menu/ic-filter-item-folder",
                active: isFoldersActive.value,
                token: foldersToken.value
              }, {
                panel: withCtx(() => [
                  createVNode(_sfc_main$C)
                ]),
                _: 1
              }, 8, ["active", "token"])) : dimId === "shape" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 3,
                label: "形状",
                icon: "context-menu/ic-filter-item-shape",
                active: isDimActive("shape"),
                token: shapeToken.value
              }, {
                panel: withCtx(() => [
                  createBaseVNode("div", _hoisted_6$t, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(ORIENTATIONS, (o2) => {
                      return createVNode(_sfc_main$G, {
                        key: o2.key,
                        multiselect: "",
                        label: o2.label,
                        state: shapeRowState(o2.key),
                        count: shapeCounts.value[o2.key],
                        title: shapeRowState(o2.key) === "exclude" ? "右键取消排除" : "左键包含 / 右键排除",
                        onPick: ($event) => toggleShapeInclude(o2.key),
                        onExclude: ($event) => toggleShapeExclude(o2.key)
                      }, null, 8, ["label", "state", "count", "title", "onPick", "onExclude"]);
                    }), 64)),
                    _cache[14] || (_cache[14] = createBaseVNode("div", { class: "my-1 border-t border-line-subtle" }, null, -1)),
                    (openBlock(), createElementBlock(Fragment, null, renderList(RATIO_PRESETS, (preset) => {
                      return openBlock(), createElementBlock(Fragment, {
                        key: preset.label
                      }, [
                        ratioVisible(preset.label) ? (openBlock(), createBlock(_sfc_main$G, {
                          key: 0,
                          selected: isRatioActive(preset.ratio),
                          label: preset.label,
                          count: ratioCounts.value[preset.label],
                          onPick: ($event) => toggleRatioPreset(preset.ratio)
                        }, null, 8, ["selected", "label", "count", "onPick"])) : createCommentVNode("", true)
                      ], 64);
                    }), 64)),
                    createBaseVNode("div", _hoisted_7$q, [
                      _cache[12] || (_cache[12] = createBaseVNode("span", { class: "leaf-radio" }, null, -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => customW.value = $event),
                        type: "number",
                        min: "1",
                        placeholder: "宽",
                        class: "h-5 w-12 rounded-sm border border-line-default bg-surface-0 px-1 text-[11px] text-fg-primary focus:border-brand-500 focus:outline-none"
                      }, null, 512), [
                        [
                          vModelText,
                          customW.value,
                          void 0,
                          { number: true }
                        ]
                      ]),
                      _cache[13] || (_cache[13] = createBaseVNode("span", { class: "text-fg-muted" }, ":", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => customH.value = $event),
                        type: "number",
                        min: "1",
                        placeholder: "高",
                        class: "h-5 w-12 rounded-sm border border-line-default bg-surface-0 px-1 text-[11px] text-fg-primary focus:border-brand-500 focus:outline-none"
                      }, null, 512), [
                        [
                          vModelText,
                          customH.value,
                          void 0,
                          { number: true }
                        ]
                      ]),
                      createBaseVNode("button", {
                        type: "button",
                        class: "h-5 rounded-sm border border-line-default px-1.5 text-[10px] text-fg-secondary transition-colors duration-fast hover:border-brand-400 hover:text-fg-primary",
                        title: customW.value && customH.value ? "应用自定义比例" : "清除比例筛选",
                        onClick: applyCustomRatio
                      }, toDisplayString(customW.value && customH.value ? "应用" : "清除"), 9, _hoisted_8$o)
                    ]),
                    createVNode(_sfc_main$F, { esc: false })
                  ])
                ]),
                _: 1
              }, 8, ["active", "token"])) : dimId === "rating" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 4,
                label: "评分",
                icon: "context-menu/ic-filter-item-rating",
                active: isDimActive("rating"),
                token: ratingToken.value
              }, {
                panel: withCtx(() => [
                  createBaseVNode("div", _hoisted_9$l, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(RATING_OPTIONS, (r2) => {
                      return createVNode(_sfc_main$G, {
                        key: r2,
                        multiselect: "",
                        label: ratingLabel(r2),
                        state: ratingRowState(r2),
                        count: ratingCounts.value[r2] ?? 0,
                        title: ratingRowState(r2) === "exclude" ? "右键取消排除" : "左键包含 / 右键排除",
                        onPick: ($event) => toggleRatingInclude(r2),
                        onExclude: ($event) => toggleRatingExclude(r2)
                      }, null, 8, ["label", "state", "count", "title", "onPick", "onExclude"]);
                    }), 64))
                  ])
                ]),
                _: 1
              }, 8, ["active", "token"])) : dimId === "format" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 5,
                label: "格式",
                icon: "context-menu/ic-filter-item-ext",
                active: isDimActive("format"),
                token: formatToken.value
              }, {
                panel: withCtx(() => [
                  createBaseVNode("div", _hoisted_10$l, [
                    createBaseVNode("div", _hoisted_11$h, [
                      createVNode(_sfc_main$L, {
                        icon: "ic_search",
                        size: 13,
                        class: "shrink-0 text-fg-muted"
                      }),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => formatSearch.value = $event),
                        type: "text",
                        placeholder: "搜索...",
                        class: "h-5 min-w-0 flex-1 bg-transparent text-[11px] text-fg-primary placeholder:text-fg-muted focus:outline-none"
                      }, null, 512), [
                        [vModelText, formatSearch.value]
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_12$h, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(visibleFormats.value, (f2) => {
                        return openBlock(), createBlock(_sfc_main$G, {
                          key: f2,
                          multiselect: "",
                          label: f2,
                          state: formatRowState(f2),
                          count: formatCounts.value[f2] ?? 0,
                          title: formatRowState(f2) === "exclude" ? "右键取消排除" : "左键包含 / 右键排除",
                          onPick: ($event) => toggleFormatInclude(f2),
                          onExclude: ($event) => toggleFormatExclude(f2)
                        }, null, 8, ["label", "state", "count", "title", "onPick", "onExclude"]);
                      }), 128)),
                      visibleFormats.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_13$f, " 暂无格式 ")) : createCommentVNode("", true)
                    ]),
                    createVNode(_sfc_main$F)
                  ])
                ]),
                _: 1
              }, 8, ["active", "token"])) : dimId === "resolution" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 6,
                label: "尺寸",
                icon: "context-menu/ic-filter-item-resolution",
                active: !!tab.value.resolutionFilter
              }, {
                panel: withCtx(({ close }) => [
                  createBaseVNode("div", _hoisted_14$e, [
                    createVNode(_sfc_main$G, {
                      selected: !tab.value.resolutionFilter,
                      label: "任意尺寸",
                      onPick: ($event) => clearResolution(close)
                    }, null, 8, ["selected", "onPick"]),
                    (openBlock(), createElementBlock(Fragment, null, renderList(["1k", "2k", "4k"], (r2) => {
                      return createVNode(_sfc_main$G, {
                        key: r2,
                        selected: tab.value.resolutionFilter === r2,
                        label: `≥ ${r2.toUpperCase()}`,
                        count: resolutionCounts.value[r2],
                        onPick: ($event) => pickResolution(r2, close)
                      }, null, 8, ["selected", "label", "count", "onPick"]);
                    }), 64))
                  ])
                ]),
                _: 1
              }, 8, ["active"])) : dimId === "time" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 7,
                label: "添加日期",
                icon: "context-menu/ic-filter-item-import",
                active: !!tab.value.timeFilter || !!tab.value.customTime
              }, {
                panel: withCtx(({ close }) => [
                  createBaseVNode("div", _hoisted_15$e, [
                    createVNode(_sfc_main$G, {
                      selected: !tab.value.timeFilter,
                      label: "全部时间",
                      onPick: ($event) => clearTime(close)
                    }, null, 8, ["selected", "onPick"]),
                    (openBlock(), createElementBlock(Fragment, null, renderList(TIME_PRESET_KEYS, (t3) => {
                      return createVNode(_sfc_main$G, {
                        key: t3,
                        selected: tab.value.timeFilter === t3,
                        label: TIME_PRESET_LABEL[t3],
                        count: timeCounts.value[t3],
                        onPick: ($event) => pickTime(t3, close)
                      }, null, 8, ["selected", "label", "count", "onPick"]);
                    }), 64)),
                    _cache[16] || (_cache[16] = createBaseVNode("div", { class: "my-1 border-t border-line-subtle" }, null, -1)),
                    createBaseVNode("div", _hoisted_16$c, [
                      createBaseVNode("input", {
                        type: "date",
                        value: toDateInput(tab.value.customTime?.[0] ?? null),
                        class: "h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none",
                        onChange: onFromDate
                      }, null, 40, _hoisted_17$a),
                      _cache[15] || (_cache[15] = createBaseVNode("span", { class: "text-fg-muted" }, "~", -1)),
                      createBaseVNode("input", {
                        type: "date",
                        value: toDateInput(tab.value.customTime?.[1] ?? null),
                        class: "h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none",
                        onChange: onToDate
                      }, null, 40, _hoisted_18$9)
                    ]),
                    tab.value.customTime ? (openBlock(), createElementBlock("button", {
                      key: 0,
                      type: "button",
                      class: "mx-2 mt-0.5 text-left text-[10px] text-fg-muted transition-colors duration-fast hover:text-danger",
                      onClick: clearCustomTime
                    }, " 清除自定义区间 ")) : createCommentVNode("", true)
                  ])
                ]),
                _: 1
              }, 8, ["active"])) : dimId === "size" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 8,
                label: "大小",
                icon: "context-menu/ic-filter-item-size",
                active: !!tab.value.sizeRange
              }, {
                panel: withCtx(({ close }) => [
                  createBaseVNode("div", _hoisted_19$8, [
                    createVNode(_sfc_main$G, {
                      selected: !tab.value.sizeRange,
                      label: "任意大小",
                      onPick: ($event) => clearSize(close)
                    }, null, 8, ["selected", "onPick"]),
                    (openBlock(), createElementBlock(Fragment, null, renderList(SIZE_PRESETS, (p2) => {
                      return createVNode(_sfc_main$G, {
                        key: p2.key,
                        selected: sizeKey.value === p2.key,
                        label: p2.label,
                        count: sizeCounts.value[p2.key],
                        onPick: ($event) => pickSize(p2.key, close)
                      }, null, 8, ["selected", "label", "count", "onPick"]);
                    }), 64)),
                    _cache[18] || (_cache[18] = createBaseVNode("div", { class: "my-1 border-t border-line-subtle" }, null, -1)),
                    createBaseVNode("div", _hoisted_20$8, [
                      createBaseVNode("input", {
                        type: "number",
                        min: "0",
                        value: minKb.value,
                        placeholder: "最小 KB",
                        class: "h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none",
                        onInput: onMinKb
                      }, null, 40, _hoisted_21$8),
                      _cache[17] || (_cache[17] = createBaseVNode("span", { class: "text-fg-muted" }, "~", -1)),
                      createBaseVNode("input", {
                        type: "number",
                        min: "0",
                        value: maxKb.value,
                        placeholder: "最大 KB",
                        class: "h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none",
                        onInput: onMaxKb
                      }, null, 40, _hoisted_22$6)
                    ])
                  ])
                ]),
                _: 1
              }, 8, ["active"])) : dimId === "duration" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 9,
                label: "时长",
                icon: "context-menu/ic-filter-item-duration",
                active: !!tab.value.durationRange
              }, {
                panel: withCtx(({ close }) => [
                  createBaseVNode("div", _hoisted_23$5, [
                    createVNode(_sfc_main$G, {
                      selected: !tab.value.durationRange,
                      label: "任意时长",
                      onPick: ($event) => clearDuration(close)
                    }, null, 8, ["selected", "onPick"]),
                    (openBlock(), createElementBlock(Fragment, null, renderList(DURATION_PRESETS, (p2) => {
                      return createVNode(_sfc_main$G, {
                        key: p2.key,
                        selected: durationKey.value === p2.key,
                        label: p2.label,
                        count: durationCounts.value[p2.key],
                        onPick: ($event) => pickDuration(p2.key, close)
                      }, null, 8, ["selected", "label", "count", "onPick"]);
                    }), 64))
                  ])
                ]),
                _: 1
              }, 8, ["active"])) : dimId === "notes" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 10,
                label: "注释",
                icon: "context-menu/ic-filter-item-note",
                active: !!tab.value.noteKeyword
              }, {
                panel: withCtx(() => [
                  createBaseVNode("div", _hoisted_24$4, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => tab.value.noteKeyword = $event),
                      type: "text",
                      placeholder: "描述包含…",
                      class: "h-6 w-full rounded-sm border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-primary placeholder:text-fg-muted focus:border-brand-500 focus:outline-none"
                    }, null, 512), [
                      [vModelText, tab.value.noteKeyword]
                    ]),
                    createBaseVNode("label", _hoisted_25$4, [
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => tab.value.noteKeywordExact = $event),
                        type: "checkbox",
                        class: "accent-brand-500"
                      }, null, 512), [
                        [vModelCheckbox, tab.value.noteKeywordExact]
                      ]),
                      _cache[19] || (_cache[19] = createTextVNode(" 完全相等 ", -1))
                    ]),
                    tab.value.noteKeyword ? (openBlock(), createElementBlock("button", {
                      key: 0,
                      type: "button",
                      class: "text-left text-[10px] text-fg-muted transition-colors duration-fast hover:text-danger",
                      onClick: clearNoteKeyword
                    }, " 清除 ")) : createCommentVNode("", true)
                  ])
                ]),
                _: 1
              }, 8, ["active"])) : dimId === "url" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 11,
                label: "链接",
                icon: "context-menu/ic-filter-item-url",
                active: !!tab.value.urlKeyword
              }, {
                panel: withCtx(() => [
                  createBaseVNode("div", _hoisted_26$4, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => tab.value.urlKeyword = $event),
                      type: "text",
                      placeholder: "来源 URL 包含…",
                      class: "h-6 w-full rounded-sm border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-primary placeholder:text-fg-muted focus:border-brand-500 focus:outline-none"
                    }, null, 512), [
                      [vModelText, tab.value.urlKeyword]
                    ]),
                    createBaseVNode("label", _hoisted_27$4, [
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => tab.value.urlKeywordExact = $event),
                        type: "checkbox",
                        class: "accent-brand-500"
                      }, null, 512), [
                        [vModelCheckbox, tab.value.urlKeywordExact]
                      ]),
                      _cache[20] || (_cache[20] = createTextVNode(" 完全相等 ", -1))
                    ]),
                    tab.value.urlKeyword ? (openBlock(), createElementBlock("button", {
                      key: 0,
                      type: "button",
                      class: "text-left text-[10px] text-fg-muted transition-colors duration-fast hover:text-danger",
                      onClick: clearUrlKeyword
                    }, " 清除 ")) : createCommentVNode("", true)
                  ])
                ]),
                _: 1
              }, 8, ["active"])) : dimId === "modifiedDate" ? (openBlock(), createBlock(_sfc_main$H, {
                key: 12,
                label: "修改日期",
                icon: "context-menu/ic-filter-item-modify",
                active: !!tab.value.modifiedTimeRange
              }, {
                panel: withCtx(({ close }) => [
                  createBaseVNode("div", _hoisted_28$3, [
                    createVNode(_sfc_main$G, {
                      selected: !tab.value.modifiedTimeRange,
                      label: "全部修改时间",
                      onPick: ($event) => clearModified(close)
                    }, null, 8, ["selected", "onPick"]),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(MOD_PRESETS.value, (p2) => {
                      return openBlock(), createBlock(_sfc_main$G, {
                        key: p2.key,
                        selected: modKey.value === p2.key,
                        label: p2.label,
                        count: modCounts.value[p2.key],
                        onPick: ($event) => pickMod(p2.key, close)
                      }, null, 8, ["selected", "label", "count", "onPick"]);
                    }), 128)),
                    _cache[22] || (_cache[22] = createBaseVNode("div", { class: "my-1 border-t border-line-subtle" }, null, -1)),
                    createBaseVNode("div", _hoisted_29$3, [
                      createBaseVNode("input", {
                        type: "date",
                        value: toDateInput(tab.value.modifiedTimeRange?.[0] ?? null),
                        class: "h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none",
                        onChange: onModFrom
                      }, null, 40, _hoisted_30$3),
                      _cache[21] || (_cache[21] = createBaseVNode("span", { class: "text-fg-muted" }, "~", -1)),
                      createBaseVNode("input", {
                        type: "date",
                        value: toDateInput(tab.value.modifiedTimeRange?.[1] ?? null),
                        class: "h-5 w-full rounded-sm border border-line-default bg-surface-0 px-1 text-[10px] text-fg-primary focus:border-brand-500 focus:outline-none",
                        onChange: onModTo
                      }, null, 40, _hoisted_31$3)
                    ])
                  ])
                ]),
                _: 1
              }, 8, ["active"])) : dimId === "aiImage" ? (openBlock(), createElementBlock("button", {
                key: 13,
                type: "button",
                class: "flex h-6 items-center gap-1 rounded-sm border border-transparent px-1.5 text-[11px] text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary",
                title: "以图找图（选择外部图片，搜索引擎搜图）",
                onClick: _cache[8] || (_cache[8] = ($event) => unref(actions).reverseImageSearch())
              }, [
                createVNode(_sfc_main$L, {
                  icon: "context-menu/ic-filter-item-image",
                  size: 14
                }),
                _cache[23] || (_cache[23] = createTextVNode(" 以图找图 ", -1)),
                _cache[24] || (_cache[24] = createBaseVNode("span", { class: "rounded-sm bg-brand-500/15 px-0.5 text-[9px] leading-3 text-brand-600 dark:text-brand-400" }, "AI", -1))
              ])) : createCommentVNode("", true)
            ], 64);
          }), 128)),
          createVNode(_sfc_main$I, {
            pinned: pinned.value,
            onToggle: togglePin,
            onReorder
          }, {
            default: withCtx(({ toggle }) => [
              createBaseVNode("button", {
                type: "button",
                class: "flex h-6 items-center gap-1 rounded-sm border border-line-default px-1.5 text-[11px] text-fg-secondary transition-colors duration-fast hover:border-brand-400",
                title: "添加筛选维度",
                onClick: toggle
              }, [
                createVNode(_sfc_main$L, {
                  icon: "ic-filter-add",
                  size: 13
                })
              ], 8, _hoisted_32$3)
            ]),
            _: 1
          }, 8, ["pinned"]),
          (openBlock(true), createElementBlock(Fragment, null, renderList(unpinnedActive.value, (id3) => {
            return openBlock(), createElementBlock("button", {
              key: `active-${id3}`,
              type: "button",
              class: "flex h-6 items-center gap-1 rounded-full border border-brand-500 bg-brand-500/10 px-2 text-[11px] text-brand-600 dark:text-brand-400",
              title: `${unref(DIMENSION_LABEL)[id3]}筛选生效，点击清除`,
              onClick: ($event) => clearDim(id3)
            }, [
              createTextVNode(toDisplayString(unref(DIMENSION_LABEL)[id3]) + " ", 1),
              createVNode(_sfc_main$L, {
                icon: "ic-modal-close",
                size: 11
              })
            ], 8, _hoisted_33$3);
          }), 128))
        ], 64)) : createCommentVNode("", true),
        _cache[25] || (_cache[25] = createBaseVNode("div", { class: "min-w-2 flex-1" }, null, -1)),
        createVNode(_sfc_main$J, {
          "current-rules": unref(buildFiltersSpec)(),
          onApply: applySavedFilterRules
        }, null, 8, ["current-rules"]),
        showKindChips.value && (unref(hasFilters) || unref(tabs).filterLocked) ? (openBlock(), createElementBlock(Fragment, { key: 7 }, [
          createBaseVNode("button", {
            type: "button",
            class: "flex h-6 items-center rounded-sm px-1.5 text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary",
            title: "保存当前筛选为智能文件夹",
            onClick: saveAsSmartAlbum
          }, [
            createVNode(_sfc_main$L, {
              icon: "ic-filter-saved",
              size: 14
            })
          ]),
          createBaseVNode("button", {
            type: "button",
            class: normalizeClass([
              "flex h-6 items-center rounded-sm px-1.5 transition-colors duration-fast hover:bg-surface-hover",
              unref(tabs).filterLocked ? "text-brand-600 dark:text-brand-400" : "text-fg-secondary hover:text-fg-primary"
            ]),
            title: unref(tabs).filterLocked ? "已锁定：切换视图时保留筛选" : "锁定筛选（切换视图时保留）",
            onClick: _cache[9] || (_cache[9] = ($event) => unref(tabs).toggleFilterLock())
          }, [
            createVNode(_sfc_main$L, {
              icon: "ic-filter-lock",
              size: 14
            })
          ], 10, _hoisted_34$3),
          unref(hasFilters) ? (openBlock(), createElementBlock("button", {
            key: 0,
            type: "button",
            class: "flex h-6 items-center rounded-sm px-1.5 text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-danger",
            title: "清除全部筛选",
            onClick: _cache[10] || (_cache[10] = ($event) => unref(tabs).clearDimensionFilters())
          }, [
            createVNode(_sfc_main$L, {
              icon: "ic-filter-reset",
              size: 14
            })
          ])) : createCommentVNode("", true)
        ], 64)) : createCommentVNode("", true)
      ]);
    };
  }
}
