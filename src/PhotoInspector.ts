/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$h = /* @__PURE__ */ defineComponent(
*/
{
  __name: "PhotoInspector",
  props: {
    photos: {},
    expanded: { type: Boolean, default: false }
  },
  emits: ["close", "open-folder", "add-to-folder", "relinked"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const data = usePhotoData();
    const actions = usePhotoActions();
    const wallpaper = useWallpaper();
    const palette = useLibraryCommandPalette();
    const photos = computed(() => props.photos);
    const single = computed(() => photos.value.length === 1 ? photos.value[0] : null);
    const folderChain = computed(() => {
      const fid = single.value?.folderId;
      if (!fid) return [];
      const byId = new Map(data.folders.value.map((f2) => [f2.id, f2]));
      const chain = [];
      let cur = byId.get(fid);
      let guard = 0;
      while (cur && guard < 32) {
        chain.unshift({ id: cur.id, name: cur.name });
        cur = cur.parentId ? byId.get(cur.parentId) : void 0;
        guard += 1;
      }
      return chain;
    });
    const isBatch = computed(() => photos.value.length > 1);
    const inspectorPlugins = ref([]);
    onMounted(async () => {
      try {
        const list2 = await window.api.plugins.list();
        inspectorPlugins.value = list2.filter((p2) => p2.category === "inspector");
      } catch {
        inspectorPlugins.value = [];
      }
    });
    const pluginPayload = computed(() => {
      const p2 = single.value;
      if (!p2) return null;
      return {
        id: p2.id,
        fileName: p2.fileName,
        kind: p2.kind,
        width: p2.width ?? null,
        height: p2.height ?? null,
        fileSize: p2.fileSize,
        rating: p2.rating,
        isFavorite: p2.isFavorite,
        tags: p2.tags,
        description: p2.description ?? null,
        durationMs: p2.durationMs ?? null,
        thumbUrl: `thumb://256/${p2.id}`,
        bigThumbUrl: `thumb://1024/${p2.id}`,
        // F20 插件扩展字段（白名单元数据，不含任何磁盘路径）
        ext: (p2.fileName.split(".").pop() ?? "").toLowerCase(),
        cameraModel: p2.cameraModel ?? null,
        lensModel: p2.lensModel ?? null,
        iso: p2.iso ?? null,
        aperture: p2.aperture ?? null,
        shutter: p2.shutter ?? null,
        focalLength: p2.focalLength ?? null,
        latitude: p2.latitude ?? null,
        longitude: p2.longitude ?? null,
        takenAt: p2.takenAt ?? null,
        importedAt: p2.importedAt,
        sourceUrl: p2.sourceUrl ?? null
      };
    });
    const descDraft = ref("");
    watch(
      () => single.value?.id,
      () => {
        descDraft.value = single.value?.description ?? "";
      },
      { immediate: true }
    );
    const newSingleTag = ref("");
    const newBatchTag = ref("");
    const batchDesc = ref("");
    const batchRating = ref(0);
    const tagInputOpen = ref(false);
    const tagInputEl = ref(null);
    watch(tagInputOpen, (open) => {
      if (open) nextTick(() => tagInputEl.value?.focus());
    });
    function toggleRating(r2) {
      void setRating(single.value?.rating === r2 ? 0 : r2);
    }
    function fmtSize(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }
    function fmtDate(ms2, full = false) {
      if (!ms2) return "—";
      const d2 = new Date(ms2);
      const p2 = (n2) => String(n2).padStart(2, "0");
      const ymd = `${d2.getFullYear()}/${p2(d2.getMonth() + 1)}/${p2(d2.getDate())}`;
      const hms = `${p2(d2.getHours())}:${p2(d2.getMinutes())}${full ? `:${p2(d2.getSeconds())}` : ""}`;
      return `${ymd} ${hms}`;
    }
    function fmtDuration(ms2) {
      if (!ms2) return "—";
      const s2 = Math.round(ms2 / 1e3);
      return `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, "0")}`;
    }
    async function saveDescription() {
      if (!single.value) return;
      await actions.handleSetDescription(single.value.id, descDraft.value.trim());
    }
    async function addSingleTag() {
      if (!single.value || !newSingleTag.value.trim()) return;
      await actions.handleAddTag(single.value.id, newSingleTag.value.trim());
      newSingleTag.value = "";
      tagInputOpen.value = false;
    }
    async function removeSingleTag(tag) {
      if (!single.value) return;
      await actions.handleRemoveTag(single.value.id, tag);
    }
    async function setRating(r2) {
      if (!single.value) return;
      await actions.handleSetRating(single.value.id, r2);
    }
    function pureNameOf(fileName) {
      const i2 = fileName.lastIndexOf(".");
      return i2 > 0 ? fileName.slice(0, i2) : fileName;
    }
    function extWithDotOf(fileName) {
      const i2 = fileName.lastIndexOf(".");
      return i2 > 0 ? fileName.slice(i2) : "";
    }
    const nameDraft = ref("");
    watch(
      () => single.value?.id,
      () => {
        nameDraft.value = single.value ? pureNameOf(single.value.fileName) : "";
      },
      { immediate: true }
    );
    let committedName = null;
    watch(
      () => single.value?.id,
      () => {
        committedName = null;
      }
    );
    async function commitName() {
      const p2 = single.value;
      if (!p2) return;
      const trimmed = nameDraft.value.trim();
      const ext = extWithDotOf(p2.fileName);
      const target = ext && trimmed.toLowerCase().endsWith(ext.toLowerCase()) ? trimmed : trimmed + ext;
      if (!trimmed || target === p2.fileName) return;
      if (committedName === target) return;
      committedName = target;
      try {
        const result2 = await window.api.photos.renamePhotos([{ id: p2.id, pattern: target, start: 1 }]);
        if (result2.renamed.length > 0) {
          toast2.success("已重命名", { description: result2.renamed[0].fileName });
          await data.loadPhotos();
        } else if (result2.conflicts.length > 0) {
          toast2.error("重命名失败", { description: "同目录下已存在同名文件" });
          nameDraft.value = pureNameOf(p2.fileName);
          committedName = null;
        }
      } catch (error2) {
        committedName = null;
        toast2.error("重命名失败", { description: error2.message });
      }
    }
    async function togglePinned() {
      const p2 = single.value;
      if (!p2) return;
      try {
        const updated = await window.api.photos.setPinned(p2.id, !p2.pinnedAt);
        if (updated) data.replacePhotoLocal(updated);
      } catch (error2) {
        toast2.error("置顶失败", { description: error2.message });
      }
    }
    const annotations = ref([]);
    const annotationDraft = ref("");
    const annotationBusy = ref(false);
    const annotationError = ref("");
    watch(
      () => single.value?.id,
      async (id3) => {
        annotations.value = [];
        annotationDraft.value = "";
        annotationError.value = "";
        if (!id3) return;
        try {
          annotations.value = await window.api.annotations.list(id3);
        } catch {
        }
      },
      { immediate: true }
    );
    function annotationStamp(a2) {
      if (a2.atMs !== void 0) {
        const total = Math.round(a2.atMs / 1e3);
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
      }
      if (a2.rect) return `${Math.round(a2.rect.w)}×${Math.round(a2.rect.h)}`;
      return "";
    }
    async function addAnnotation() {
      const p2 = single.value;
      const body = annotationDraft.value.trim();
      if (!p2 || !body || annotationBusy.value) return;
      annotationBusy.value = true;
      annotationError.value = "";
      try {
        const r2 = await window.api.annotations.create(p2.id, { body });
        if (!r2.ok) {
          annotationError.value = r2.error ?? "保存失败";
          return;
        }
        annotations.value = r2.items ?? [];
        annotationDraft.value = "";
      } catch (error2) {
        annotationError.value = error2.message;
      } finally {
        annotationBusy.value = false;
      }
    }
    async function removeAnnotation(id3) {
      const p2 = single.value;
      if (!p2) return;
      try {
        const r2 = await window.api.annotations.remove(id3, p2.id);
        if (!r2.ok) {
          toast2.error("没能删除标注", { description: r2.error });
          return;
        }
        annotations.value = r2.items ?? [];
      } catch (error2) {
        toast2.error("没能删除标注", { description: error2.message });
      }
    }
    const urlDraft = ref("");
    watch(
      () => single.value?.id,
      () => {
        urlDraft.value = single.value?.sourceUrl ?? "";
      },
      { immediate: true }
    );
    async function saveSourceUrl() {
      const p2 = single.value;
      if (!p2) return;
      const trimmed = urlDraft.value.trim();
      if ((p2.sourceUrl ?? "") === trimmed) return;
      const updated = await window.api.photos.update(p2.id, { sourceUrl: trimmed || null });
      if (updated) data.replacePhotoLocal(updated);
      toast2.success("已保存链接");
    }
    async function removeFromFolder() {
      const p2 = single.value;
      if (!p2?.folderId) return;
      await window.api.photos.assignPhotosToFolder(null, [p2.id]);
      await data.loadFolders();
      await data.loadPhotos();
      toast2.success("已移出文件夹");
    }
    async function exportSingle() {
      const p2 = single.value;
      if (p2) void actions.exportSelected([p2.id]);
    }
    const paletteColors = computed(() => {
      const p2 = single.value;
      if (!p2) return [];
      if (p2.palette && p2.palette.length > 0) return p2.palette;
      return p2.colorDominant ? [p2.colorDominant] : [];
    });
    function openHelp() {
      palette.open();
    }
    const kindBadge = computed(() => {
      const p2 = single.value;
      if (!p2) return "";
      const i2 = p2.fileName.lastIndexOf(".");
      return i2 >= 0 ? p2.fileName.slice(i2 + 1).toUpperCase() : KIND_LABELS[p2.kind];
    });
    function extLabel(p2) {
      const i2 = p2.fileName.lastIndexOf(".");
      return i2 >= 0 ? p2.fileName.slice(i2 + 1).toUpperCase() : "—";
    }
    async function applyBatchTag() {
      if (!newBatchTag.value.trim()) return;
      await actions.addTagToMany(
        props.photos.map((p2) => p2.id),
        newBatchTag.value.trim()
      );
      newBatchTag.value = "";
    }
    async function applyBatchRating(r2) {
      await actions.handleBatchUpdate(
        props.photos.map((p2) => p2.id),
        { rating: r2 }
      );
      batchRating.value = r2;
    }
    async function applyBatchDescription() {
      await actions.handleBatchUpdate(
        props.photos.map((p2) => p2.id),
        {
          description: batchDesc.value.trim()
        }
      );
    }
    const hasExif = computed(() => {
      const p2 = single.value;
      if (!p2) return false;
      return Boolean(
        p2.cameraModel || p2.lensModel || p2.iso || p2.aperture || p2.shutter || p2.focalLength || hasGps.value
      );
    });
    const hasGps = computed(() => {
      const p2 = single.value;
      return p2 != null && p2.latitude != null && p2.longitude != null;
    });
    const exifRows = computed(() => {
      const p2 = single.value;
      if (!p2) return [];
      const rows = [];
      if (p2.takenAt) rows.push({ label: "拍摄", value: fmtDate(p2.takenAt, props.expanded) });
      if (p2.cameraModel) rows.push({ label: "相机", value: p2.cameraModel });
      if (p2.lensModel) rows.push({ label: "镜头", value: p2.lensModel });
      if (p2.iso) rows.push({ label: "ISO", value: String(p2.iso) });
      if (p2.aperture) rows.push({ label: "光圈", value: `f/${p2.aperture}` });
      if (p2.shutter) rows.push({ label: "快门", value: p2.shutter });
      if (p2.focalLength) rows.push({ label: "焦距", value: `${p2.focalLength}mm` });
      if (hasGps.value) {
        rows.push({
          label: "GPS",
          value: `${p2.latitude.toFixed(props.expanded ? 6 : 4)}, ${p2.longitude.toFixed(
            props.expanded ? 6 : 4
          )}`
        });
      }
      return rows;
    });
    const advancedRows = computed(() => {
      const p2 = single.value;
      if (!p2 || !props.expanded) return [];
      const rows = [{ label: "文件路径", value: p2.filePath }];
      if (p2.sourcePath) rows.push({ label: "原始路径", value: p2.sourcePath });
      if (p2.width && p2.height) {
        rows.push({
          label: "像素总数",
          value: `${(p2.width * p2.height / 1e6).toFixed(1)} MP`
        });
      }
      if (p2.phash) rows.push({ label: "感知哈希", value: p2.phash });
      if (p2.hash) rows.push({ label: "内容哈希", value: p2.hash });
      return rows;
    });
    function loadInspectorCollapsed() {
      try {
        const raw = localStorage.getItem(COLLAPSE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    }
    const inspectorCollapsed = ref(loadInspectorCollapsed());
    const tabs = useLibraryTabs();
    const { theme } = useTheme();
    const miniMapEl = ref(null);
    let miniMap = null;
    const cityLabel = ref("");
    function isDarkNow() {
      if (theme.value === "dark") return true;
      if (theme.value === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    function destroyMiniMap() {
      miniMap?.remove();
      miniMap = null;
    }
    function initMiniMap() {
      const p2 = single.value;
      if (!miniMapEl.value || !p2 || p2.latitude == null || p2.longitude == null) return;
      destroyMiniMap();
      const tile = isDarkNow() ? "dark_all" : "light_all";
      miniMap = new zp({
        container: miniMapEl.value,
        style: {
          version: 8,
          sources: {
            carto: {
              type: "raster",
              tiles: [
                `https://a.basemaps.cartocdn.com/${tile}/{z}/{x}/{y}@2x.png`,
                `https://b.basemaps.cartocdn.com/${tile}/{z}/{x}/{y}@2x.png`,
                `https://c.basemaps.cartocdn.com/${tile}/{z}/{x}/{y}@2x.png`
              ],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors © CARTO",
              maxzoom: 20
            }
          },
          layers: [{ id: "basemap", type: "raster", source: "carto" }]
        },
        center: [p2.longitude, p2.latitude],
        zoom: 10,
        // 小地图仅供定位，禁用交互让点击落到覆盖层（跳地图视图）
        interactive: false,
        attributionControl: false
      });
      miniMap.on("load", () => {
        if (!miniMap) return;
        new Zp({ color: "#10b981" }).setLngLat([p2.longitude, p2.latitude]).addTo(miniMap);
      });
    }
    function openInMapView() {
      tabs.setView("map", "地图");
    }
    watch(
      () => [single.value?.id, hasGps.value, inspectorCollapsed.value.exif],
      async ([id3, gps, exifOpen]) => {
        cityLabel.value = "";
        if (!id3 || !gps || !exifOpen) {
          destroyMiniMap();
          return;
        }
        const p2 = single.value;
        await nextTick();
        initMiniMap();
        if (p2?.latitude == null || p2?.longitude == null) return;
        const info = await window.api.photos.reverseGeocode(p2.latitude, p2.longitude).catch(() => null);
        if (info && single.value?.id === id3) cityLabel.value = info.city;
      },
      { immediate: true }
    );
    onUnmounted(destroyMiniMap);
    const toast2 = useToast();
    const canSetWallpaper = computed(() => single.value?.kind === "image");
    function revealInFolder() {
      actions.revealInFolder(photos.value);
    }
    async function copyFiles() {
      const paths = photos.value.map((p2) => p2.filePath);
      if (paths.length === 0) return;
      try {
        const ok = await window.api.photos.copyToClipboard(paths);
        if (ok) toast2.success(`已复制 ${paths.length} 个文件`, { description: "可在 Finder 粘贴" });
        else toast2.error("复制失败", { description: "文件不存在或已被移动" });
      } catch (error2) {
        toast2.error("复制失败", { description: error2.message });
      }
    }
    async function copyDocText() {
      const text2 = single.value?.docText;
      if (!text2) return;
      try {
        const ok = await window.api.photos.copyText(text2);
        if (ok) toast2.success("已复制文档正文");
        else toast2.error("复制失败");
      } catch (error2) {
        toast2.error("复制失败", { description: error2.message });
      }
    }
    async function copyOcrText() {
      const text2 = single.value?.ocrText;
      if (!text2) return;
      try {
        const ok = await window.api.photos.copyText(text2);
        if (ok) toast2.success("已复制图片文字");
        else toast2.error("复制失败");
      } catch (error2) {
        toast2.error("复制失败", { description: error2.message });
      }
    }
    const deepLink = computed(() => single.value ? buildItemLink(single.value.id) : "");
    async function copyDeepLink() {
      if (!deepLink.value) return;
      try {
        const ok = await window.api.photos.copyText(deepLink.value);
        if (ok) toast2.success("已复制素材链接");
        else toast2.error("复制失败");
      } catch (error2) {
        toast2.error("复制失败", { description: error2.message });
      }
    }
    function toggleInspectorSection(key) {
      inspectorCollapsed.value = { ...inspectorCollapsed.value, [key]: !inspectorCollapsed.value[key] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(inspectorCollapsed.value));
      } catch {
      }
    }
    async function relinkFromInspector() {
      const p2 = single.value;
      if (!p2?.missingAt) return;
      try {
        const res = await window.api.storage.relinkPhoto(p2.id);
        if (res.ok) {
          toast2.success("已重新定位", {
            description: res.photo?.filePath
          });
          emit("relinked");
        } else if (res.error !== "已取消") {
          toast2.error("重新定位失败", { description: res.error });
        }
      } catch (error2) {
        toast2.error("重新定位失败", { description: error2.message });
      }
    }
    function renameBatch() {
      actions.batchRenameOpen.value = true;
    }
    const EDIT_MENU = [
      { key: "rot-l", label: "向左旋转 90°", icon: "ic-toolbar-rotate" },
      { key: "rot-r", label: "向右旋转 90°", icon: "ic-toolbar-rotate" },
      { key: "rot-180", label: "旋转 180°", icon: "ic-toolbar-rotate" },
      { key: "sep", divider: true },
      { key: "flip-h", label: "水平翻转", icon: "ic-toolbar-flip" },
      { key: "flip-v", label: "垂直翻转", icon: "ic-toolbar-flip" }
    ];
    const editMenu = useContextMenu();
    const editing = ref(false);
    const canEditImage = computed(() => {
      const p2 = single.value;
      return !!p2 && isEditableImageFile(p2.fileName);
    });
    function pickImageEdit(event) {
      const p2 = single.value;
      if (!p2 || editing.value) return;
      editMenu.open(event.clientX, event.clientY, EDIT_MENU, (key) => void applyImageEdit(p2, key));
    }
    async function applyImageEdit(p2, key) {
      editing.value = true;
      try {
        const r2 = key === "rot-l" ? await window.api.edit.rotate(p2.id, 270) : key === "rot-r" ? await window.api.edit.rotate(p2.id, 90) : key === "rot-180" ? await window.api.edit.rotate(p2.id, 180) : key === "flip-h" ? await window.api.edit.flip(p2.id, "horizontal") : key === "flip-v" ? await window.api.edit.flip(p2.id, "vertical") : { ok: false, error: "未知操作" };
        if (!r2.ok) {
          toast2.error("就地编辑失败", { description: r2.error });
          return;
        }
        toast2.success("已就地修改库内文件", { description: "缩略图与相似度/颜色/向量正在重算" });
        const updated = await window.api.photos.getById(p2.id);
        if (updated) data.replacePhotoLocal(updated);
      } finally {
        editing.value = false;
      }
    }
    function pickWallpaper(event) {
      const p2 = single.value;
      if (!p2) return;
      void wallpaper.openMenu(p2, event.clientX, event.clientY);
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("aside", _hoisted_1$h, [
        createBaseVNode("header", _hoisted_2$h, [
          single.value ? (openBlock(), createElementBlock("button", {
            key: 0,
            type: "button",
            class: normalizeClass(["flex size-6 items-center justify-center rounded-sm transition-colors hover:bg-surface-hover", single.value.pinnedAt ? "text-brand-500" : "text-fg-muted hover:text-fg-primary"]),
            title: single.value.pinnedAt ? "取消置顶" : "置顶",
            onClick: togglePinned
          }, [
            createVNode(_sfc_main$L, { icon: "ic-toolbar-pin" })
          ], 10, _hoisted_3$f)) : createCommentVNode("", true)
        ]),
        createBaseVNode("div", _hoisted_4$d, [
          single.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createBaseVNode("div", _hoisted_5$d, [
              kindBadge.value ? (openBlock(), createElementBlock("span", _hoisted_6$d, toDisplayString(kindBadge.value), 1)) : createCommentVNode("", true),
              single.value.kind === "image" ? (openBlock(), createElementBlock("img", {
                key: 1,
                src: `thumb://1024/${single.value.id}`,
                class: "max-h-full max-w-full object-contain",
                alt: ""
              }, null, 8, _hoisted_7$c)) : single.value.kind === "video" ? (openBlock(), createElementBlock("video", {
                key: 2,
                src: unref(mediaUrl)("video", single.value.filePath),
                class: "max-h-full max-w-full object-contain",
                muted: "",
                controls: ""
              }, null, 8, _hoisted_8$a)) : (openBlock(), createElementBlock("div", _hoisted_9$a, "🎵"))
            ]),
            paletteColors.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_10$a, [
              createBaseVNode("div", _hoisted_11$6, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(paletteColors.value, (c2, i2) => {
                  return openBlock(), createElementBlock("span", {
                    key: `${c2}-${i2}`,
                    class: "size-4 rounded-full border border-black/10 shadow-sm",
                    style: normalizeStyle({ backgroundColor: c2 })
                  }, null, 4);
                }), 128))
              ])
            ])) : createCommentVNode("", true),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => nameDraft.value = $event),
              type: "text",
              "aria-label": "名称",
              class: "h-8 w-full rounded-[10px] border border-transparent bg-surface-hover px-3 text-sm font-medium text-fg-primary focus:outline-none focus:border-brand-500 dark:bg-surface-0",
              onKeyup: withKeys(commitName, ["enter"]),
              onBlur: commitName
            }, null, 544), [
              [vModelText, nameDraft.value]
            ]),
            withDirectives(createBaseVNode("textarea", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => descDraft.value = $event),
              rows: "1",
              placeholder: "添加注释",
              class: "mt-2 h-8 w-full resize-none rounded-[10px] border border-transparent bg-surface-hover px-3 py-[6px] text-xs leading-[18px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500 dark:bg-surface-0",
              onBlur: saveDescription
            }, null, 544), [
              [vModelText, descDraft.value]
            ]),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => urlDraft.value = $event),
              type: "text",
              placeholder: "http://",
              spellcheck: "false",
              class: "mt-2 h-8 w-full rounded-[10px] border border-transparent bg-surface-hover px-3 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500 dark:bg-surface-0",
              onKeyup: withKeys(saveSourceUrl, ["enter"]),
              onBlur: saveSourceUrl
            }, null, 544), [
              [vModelText, urlDraft.value]
            ]),
            createBaseVNode("div", _hoisted_12$6, [
              createBaseVNode("p", _hoisted_13$6, "标注（" + toDisplayString(annotations.value.length) + "）", 1),
              annotations.value.length ? (openBlock(), createElementBlock("ul", _hoisted_14$5, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(annotations.value, (a2) => {
                  return openBlock(), createElementBlock("li", {
                    key: a2.id,
                    class: "flex items-start gap-1.5 text-[11px] text-fg-secondary"
                  }, [
                    annotationStamp(a2) ? (openBlock(), createElementBlock("span", _hoisted_15$5, toDisplayString(annotationStamp(a2)), 1)) : createCommentVNode("", true),
                    createBaseVNode("span", _hoisted_16$4, toDisplayString(a2.body), 1),
                    createBaseVNode("button", {
                      type: "button",
                      class: "shrink-0 text-fg-muted hover:text-danger",
                      title: "删除这条标注",
                      onClick: ($event) => removeAnnotation(a2.id)
                    }, " × ", 8, _hoisted_17$2)
                  ]);
                }), 128))
              ])) : createCommentVNode("", true),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => annotationDraft.value = $event),
                type: "text",
                placeholder: "写一条标注，回车保存",
                class: "h-8 w-full rounded-[10px] border border-transparent bg-surface-hover px-3 text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500 dark:bg-surface-0",
                onKeyup: withKeys(addAnnotation, ["enter"])
              }, null, 544), [
                [vModelText, annotationDraft.value]
              ]),
              annotationError.value ? (openBlock(), createElementBlock("p", _hoisted_18$1, toDisplayString(annotationError.value), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_19$1, [
              createBaseVNode("span", {
                class: "min-w-0 flex-1 truncate rounded-[10px] bg-surface-hover px-3 py-1.5 font-mono text-[11px] text-fg-secondary",
                title: deepLink.value
              }, toDisplayString(deepLink.value), 9, _hoisted_20$1),
              createBaseVNode("button", {
                type: "button",
                class: "shrink-0 text-[11px] text-fg-brand hover:underline",
                onClick: copyDeepLink
              }, " 复制 ")
            ]),
            createBaseVNode("div", _hoisted_21$1, [
              _cache[18] || (_cache[18] = createBaseVNode("p", { class: "mb-2 text-xs text-fg-tertiary" }, "标签", -1)),
              createBaseVNode("div", _hoisted_22$1, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(single.value.tags, (t3) => {
                  return openBlock(), createElementBlock("span", {
                    key: t3,
                    class: "group flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-600 dark:text-brand-400"
                  }, [
                    createTextVNode(toDisplayString(t3) + " ", 1),
                    createBaseVNode("button", {
                      class: "hover:text-danger",
                      onClick: ($event) => removeSingleTag(t3)
                    }, [
                      createVNode(_sfc_main$L, {
                        icon: "ic-modal-close",
                        size: 11
                      })
                    ], 8, _hoisted_23$1)
                  ]);
                }), 128))
              ]),
              tagInputOpen.value ? withDirectives((openBlock(), createElementBlock("input", {
                key: 0,
                ref_key: "tagInputEl",
                ref: tagInputEl,
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => newSingleTag.value = $event),
                type: "text",
                placeholder: "输入标签，回车添加",
                class: "h-8 w-full rounded-[10px] border border-line-default bg-surface-hover px-3 text-xs text-fg-primary focus:outline-none focus:border-brand-500",
                onKeyup: withKeys(addSingleTag, ["enter"]),
                onBlur: _cache[5] || (_cache[5] = ($event) => tagInputOpen.value = false)
              }, null, 544)), [
                [vModelText, newSingleTag.value]
              ]) : (openBlock(), createElementBlock("button", {
                key: 1,
                type: "button",
                class: "flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] bg-surface-2 text-xs text-fg-primary transition-colors duration-fast hover:bg-surface-3",
                onClick: _cache[6] || (_cache[6] = ($event) => tagInputOpen.value = true)
              }, [
                createVNode(_sfc_main$L, { icon: "ic-inspector-add-label" }),
                _cache[17] || (_cache[17] = createTextVNode(" 添加标签 ", -1))
              ]))
            ]),
            createBaseVNode("div", _hoisted_24$1, [
              _cache[19] || (_cache[19] = createBaseVNode("p", { class: "mb-2 text-xs text-fg-tertiary" }, "文件夹", -1)),
              createBaseVNode("div", _hoisted_25$1, [
                folderChain.value.length > 0 ? (openBlock(), createElementBlock("span", {
                  key: 0,
                  class: "flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs text-fg-primary",
                  title: `位于 ${folderChain.value.map((f2) => f2.name).join(" / ")}`
                }, [
                  createTextVNode(toDisplayString(folderChain.value[folderChain.value.length - 1].name) + " ", 1),
                  createBaseVNode("button", {
                    type: "button",
                    class: "text-fg-muted transition-colors hover:text-danger",
                    title: "移出文件夹",
                    onClick: removeFromFolder
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "ic-modal-close",
                      size: 11
                    })
                  ])
                ], 8, _hoisted_26$1)) : createCommentVNode("", true),
                single.value.folderId ? (openBlock(), createElementBlock("button", {
                  key: 1,
                  type: "button",
                  class: "flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary",
                  title: "前往所属文件夹",
                  onClick: _cache[7] || (_cache[7] = ($event) => _ctx.$emit("open-folder", single.value.folderId))
                }, [
                  createVNode(_sfc_main$L, {
                    icon: "ic-arrow-right",
                    size: 12
                  })
                ])) : createCommentVNode("", true),
                !single.value.folderId ? (openBlock(), createElementBlock("button", {
                  key: 2,
                  type: "button",
                  class: "flex items-center justify-center rounded-sm px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary",
                  title: "添加至文件夹",
                  onClick: _cache[8] || (_cache[8] = ($event) => emit("add-to-folder"))
                }, [
                  createVNode(_sfc_main$L, { icon: "ic-inspector-add-label" })
                ])) : createCommentVNode("", true)
              ])
            ]),
            createBaseVNode("div", _hoisted_27$1, [
              createBaseVNode("button", {
                type: "button",
                class: "mb-2 flex w-full items-center justify-between text-xs text-fg-tertiary hover:text-fg-secondary",
                onClick: _cache[9] || (_cache[9] = ($event) => toggleInspectorSection("info"))
              }, [
                _cache[20] || (_cache[20] = createBaseVNode("span", null, "基本信息", -1)),
                createBaseVNode("span", _hoisted_28$1, toDisplayString(inspectorCollapsed.value.info ? "▸" : "▾"), 1)
              ]),
              single.value.missingAt ? (openBlock(), createElementBlock("div", _hoisted_29$1, [
                _cache[21] || (_cache[21] = createBaseVNode("span", { class: "flex-1 text-[11px] text-amber-600 dark:text-amber-400" }, " 原文件丢失（路径不可访问） ", -1)),
                createBaseVNode("button", {
                  type: "button",
                  class: "shrink-0 text-[11px] text-fg-brand hover:underline",
                  onClick: relinkFromInspector
                }, " 重新定位… ")
              ])) : createCommentVNode("", true),
              withDirectives(createBaseVNode("dl", _hoisted_30$1, [
                createBaseVNode("div", _hoisted_31$1, [
                  _cache[22] || (_cache[22] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "评分", -1)),
                  createBaseVNode("dd", _hoisted_32$1, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(5, (r2) => {
                      return createBaseVNode("button", {
                        key: r2,
                        type: "button",
                        class: normalizeClass([
                          "text-[13px] leading-none transition-colors",
                          r2 <= single.value.rating ? "text-amber-400" : "text-fg-muted hover:text-amber-300"
                        ]),
                        "aria-label": `评 ${r2} 星`,
                        onClick: ($event) => toggleRating(r2)
                      }, " ★ ", 10, _hoisted_33$1);
                    }), 64))
                  ])
                ]),
                single.value.width || single.value.height ? (openBlock(), createElementBlock("div", _hoisted_34$1, [
                  _cache[23] || (_cache[23] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "尺寸", -1)),
                  createBaseVNode("dd", _hoisted_35$1, toDisplayString(single.value.width || "—") + " × " + toDisplayString(single.value.height || "—"), 1)
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_36, [
                  _cache[24] || (_cache[24] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "文件大小", -1)),
                  createBaseVNode("dd", _hoisted_37, toDisplayString(fmtSize(single.value.fileSize)), 1)
                ]),
                createBaseVNode("div", _hoisted_38, [
                  _cache[25] || (_cache[25] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "格式", -1)),
                  createBaseVNode("dd", _hoisted_39, toDisplayString(extLabel(single.value)), 1)
                ]),
                single.value.kind === "video" || single.value.kind === "audio" ? (openBlock(), createElementBlock("div", _hoisted_40, [
                  _cache[26] || (_cache[26] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "时长", -1)),
                  createBaseVNode("dd", _hoisted_41, toDisplayString(fmtDuration(single.value.durationMs)), 1)
                ])) : createCommentVNode("", true),
                single.value.kind === "audio" && single.value.bpm ? (openBlock(), createElementBlock("div", _hoisted_42, [
                  _cache[27] || (_cache[27] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "节拍", -1)),
                  createBaseVNode("dd", _hoisted_43, " ≈ " + toDisplayString(Math.round(single.value.bpm)) + " BPM ", 1)
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_44, [
                  _cache[28] || (_cache[28] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "添加日期", -1)),
                  createBaseVNode("dd", _hoisted_45, toDisplayString(fmtDate(single.value.importedAt, __props.expanded)), 1)
                ]),
                createBaseVNode("div", _hoisted_46, [
                  _cache[29] || (_cache[29] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "创建日期", -1)),
                  createBaseVNode("dd", _hoisted_47, toDisplayString(fmtDate(single.value.fsCreatedAt ?? single.value.createdAt, __props.expanded)), 1)
                ]),
                createBaseVNode("div", _hoisted_48, [
                  _cache[30] || (_cache[30] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "修改日期", -1)),
                  createBaseVNode("dd", _hoisted_49, toDisplayString(fmtDate(single.value.fsModifiedAt ?? single.value.modifiedAt, __props.expanded)), 1)
                ]),
                (openBlock(true), createElementBlock(Fragment, null, renderList(advancedRows.value, (row) => {
                  return openBlock(), createElementBlock("div", {
                    key: row.label,
                    class: "contents"
                  }, [
                    createBaseVNode("dt", _hoisted_50, toDisplayString(row.label), 1),
                    createBaseVNode("dd", {
                      class: "break-all select-text text-fg-secondary",
                      title: row.value,
                      "data-inspector-advanced-row": ""
                    }, toDisplayString(row.value), 9, _hoisted_51)
                  ]);
                }), 128))
              ], 512), [
                [vShow, !inspectorCollapsed.value.info]
              ])
            ]),
            hasExif.value ? (openBlock(), createElementBlock("div", _hoisted_52, [
              createBaseVNode("button", {
                type: "button",
                class: "mb-2 flex w-full items-center justify-between text-xs text-fg-tertiary hover:text-fg-secondary",
                onClick: _cache[10] || (_cache[10] = ($event) => toggleInspectorSection("exif"))
              }, [
                _cache[31] || (_cache[31] = createBaseVNode("span", null, "EXIF", -1)),
                createBaseVNode("span", _hoisted_53, toDisplayString(inspectorCollapsed.value.exif ? "▸" : "▾"), 1)
              ]),
              withDirectives(createBaseVNode("dl", _hoisted_54, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(exifRows.value, (row) => {
                  return openBlock(), createElementBlock("div", {
                    key: row.label,
                    class: "contents"
                  }, [
                    createBaseVNode("dt", _hoisted_55, toDisplayString(row.label), 1),
                    createBaseVNode("dd", {
                      class: normalizeClass(["text-fg-secondary", __props.expanded ? "break-all" : "truncate"]),
                      title: row.value
                    }, toDisplayString(row.value), 11, _hoisted_56)
                  ]);
                }), 128))
              ], 512), [
                [vShow, !inspectorCollapsed.value.exif]
              ]),
              hasGps.value && !inspectorCollapsed.value.exif ? (openBlock(), createElementBlock("div", _hoisted_57, [
                createBaseVNode("div", _hoisted_58, [
                  createBaseVNode("div", {
                    ref_key: "miniMapEl",
                    ref: miniMapEl,
                    class: "absolute inset-0"
                  }, null, 512),
                  createBaseVNode("button", {
                    type: "button",
                    class: "absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent p-1.5 text-left text-[10px] text-white",
                    title: "在地图视图中查看",
                    onClick: openInMapView
                  }, [
                    createBaseVNode("span", _hoisted_59, toDisplayString(cityLabel.value || "在地图中查看"), 1)
                  ])
                ]),
                _cache[32] || (_cache[32] = createBaseVNode("p", { class: "mt-1 text-[10px] text-fg-tertiary" }, "© OpenStreetMap © CARTO", -1))
              ])) : createCommentVNode("", true)
            ])) : createCommentVNode("", true),
            single.value.ocrText ? (openBlock(), createElementBlock("div", _hoisted_60, [
              createBaseVNode("div", _hoisted_61, [
                createBaseVNode("button", {
                  type: "button",
                  class: "flex items-center gap-1.5 text-xs font-medium text-fg-secondary hover:text-fg-primary",
                  onClick: _cache[11] || (_cache[11] = ($event) => toggleInspectorSection("ocr"))
                }, [
                  createBaseVNode("span", _hoisted_62, toDisplayString(inspectorCollapsed.value.ocr ? "▸" : "▾"), 1),
                  _cache[33] || (_cache[33] = createBaseVNode("span", null, "图片文字", -1))
                ]),
                createBaseVNode("button", {
                  type: "button",
                  class: "text-[11px] text-fg-brand hover:underline",
                  onClick: copyOcrText
                }, " 复制 ")
              ]),
              withDirectives(createBaseVNode("p", {
                class: normalizeClass(["overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-fg-secondary", __props.expanded ? "max-h-72" : "max-h-32"])
              }, toDisplayString(single.value.ocrText), 3), [
                [vShow, !inspectorCollapsed.value.ocr]
              ])
            ])) : createCommentVNode("", true),
            single.value.docText ? (openBlock(), createElementBlock("div", _hoisted_63, [
              createBaseVNode("div", _hoisted_64, [
                createBaseVNode("button", {
                  type: "button",
                  class: "flex items-center gap-1.5 text-xs font-medium text-fg-secondary hover:text-fg-primary",
                  onClick: _cache[12] || (_cache[12] = ($event) => toggleInspectorSection("docText"))
                }, [
                  createBaseVNode("span", _hoisted_65, toDisplayString(inspectorCollapsed.value.docText ? "▸" : "▾"), 1),
                  _cache[34] || (_cache[34] = createBaseVNode("span", null, "文档正文", -1))
                ]),
                createBaseVNode("button", {
                  type: "button",
                  class: "text-[11px] text-fg-brand hover:underline",
                  onClick: copyDocText
                }, " 复制 ")
              ]),
              withDirectives(createBaseVNode("p", {
                class: normalizeClass(["overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-fg-secondary", __props.expanded ? "max-h-72" : "max-h-32"])
              }, toDisplayString(single.value.docText), 3), [
                [vShow, !inspectorCollapsed.value.docText]
              ])
            ])) : createCommentVNode("", true),
            inspectorPlugins.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_66, [
              _cache[35] || (_cache[35] = createBaseVNode("p", { class: "text-[11px] font-medium text-fg-secondary" }, "插件", -1)),
              (openBlock(true), createElementBlock(Fragment, null, renderList(inspectorPlugins.value, (p2) => {
                return openBlock(), createBlock(_sfc_main$k, {
                  key: p2.id,
                  plugin: p2,
                  payload: pluginPayload.value
                }, null, 8, ["plugin", "payload"]);
              }), 128))
            ])) : createCommentVNode("", true)
          ], 64)) : isBatch.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_67, [
              _cache[36] || (_cache[36] = createTextVNode(" 已选中 ", -1)),
              createBaseVNode("span", _hoisted_68, toDisplayString(photos.value.length), 1),
              _cache[37] || (_cache[37] = createTextVNode(" 张素材，以下操作将统一应用到全部。 ", -1))
            ]),
            createBaseVNode("div", _hoisted_69, [
              _cache[38] || (_cache[38] = createBaseVNode("p", { class: "mb-1 text-[11px] font-medium text-fg-secondary" }, "统一评分", -1)),
              createBaseVNode("div", _hoisted_70, [
                (openBlock(), createElementBlock(Fragment, null, renderList(5, (r2) => {
                  return createBaseVNode("button", {
                    key: r2,
                    type: "button",
                    class: normalizeClass(["text-lg transition-colors", r2 <= batchRating.value ? "text-amber-400" : "text-fg-muted hover:text-amber-300"]),
                    onClick: ($event) => applyBatchRating(r2)
                  }, " ★ ", 10, _hoisted_71);
                }), 64)),
                batchRating.value > 0 ? (openBlock(), createElementBlock("button", {
                  key: 0,
                  type: "button",
                  class: "ml-1 text-[11px] text-fg-muted hover:text-danger",
                  onClick: _cache[13] || (_cache[13] = ($event) => applyBatchRating(0))
                }, " 清除 ")) : createCommentVNode("", true)
              ])
            ]),
            createBaseVNode("div", _hoisted_72, [
              _cache[39] || (_cache[39] = createBaseVNode("p", { class: "mb-1 text-[11px] font-medium text-fg-secondary" }, "添加标签", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => newBatchTag.value = $event),
                type: "text",
                placeholder: "回车应用到全部",
                class: "h-6 w-full rounded-sm border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-primary focus:outline-none focus:border-brand-500",
                onKeyup: withKeys(applyBatchTag, ["enter"])
              }, null, 544), [
                [vModelText, newBatchTag.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_73, [
              _cache[40] || (_cache[40] = createBaseVNode("p", { class: "mb-1 text-[11px] font-medium text-fg-secondary" }, "统一备注", -1)),
              withDirectives(createBaseVNode("textarea", {
                "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => batchDesc.value = $event),
                rows: "3",
                placeholder: "应用到全部（覆盖）",
                class: "w-full resize-none rounded-md border border-line-default bg-surface-0 px-2 py-1.5 text-[11px] text-fg-primary focus:outline-none focus:border-brand-500"
              }, null, 512), [
                [vModelText, batchDesc.value]
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "mt-1 w-full rounded-md bg-brand-500 py-1 text-[11px] text-white transition-colors hover:bg-brand-600",
                onClick: applyBatchDescription
              }, " 应用备注 ")
            ])
          ], 64)) : (openBlock(), createElementBlock("p", _hoisted_74, "未选中素材。"))
        ]),
        single.value ? (openBlock(), createElementBlock("footer", _hoisted_75, [
          canSetWallpaper.value ? (openBlock(), createElementBlock("button", {
            key: 0,
            type: "button",
            class: "inspector-action",
            title: "设为桌面壁纸（可选适配方式）",
            onClick: pickWallpaper
          }, [
            createVNode(_sfc_main$L, { icon: "ic_texture" })
          ])) : createCommentVNode("", true),
          canEditImage.value ? (openBlock(), createElementBlock("button", {
            key: 1,
            type: "button",
            class: "inspector-action",
            title: editing.value ? "正在编辑…" : "旋转 / 翻转（就地改库内文件）",
            disabled: editing.value,
            onClick: pickImageEdit
          }, [
            createVNode(_sfc_main$L, { icon: "ic-toolbar-rotate" })
          ], 8, _hoisted_76)) : createCommentVNode("", true),
          createBaseVNode("button", {
            type: "button",
            class: "flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-xs font-medium text-fg-primary transition-colors duration-fast hover:bg-surface-3",
            onClick: exportSingle
          }, [
            createVNode(_sfc_main$L, {
              icon: "ic-inspector-export",
              size: 13
            }),
            _cache[41] || (_cache[41] = createTextVNode(" 导出 ", -1))
          ])
        ])) : photos.value.length > 0 ? (openBlock(), createElementBlock("footer", _hoisted_77, [
          createBaseVNode("button", {
            type: "button",
            class: "inspector-action",
            title: "在文件管理器中显示",
            onClick: revealInFolder
          }, [
            createVNode(_sfc_main$L, { icon: "context-menu/ic-open-finder" })
          ]),
          createBaseVNode("button", {
            type: "button",
            class: "inspector-action",
            title: "复制文件",
            onClick: copyFiles
          }, [
            createVNode(_sfc_main$L, { icon: "context-menu/ic-file-copy" })
          ]),
          createBaseVNode("button", {
            type: "button",
            class: "inspector-action",
            title: "批量重命名",
            onClick: _cache[16] || (_cache[16] = ($event) => renameBatch())
          }, [
            createVNode(_sfc_main$L, { icon: "context-menu/ic-rename" })
          ]),
          createBaseVNode("span", _hoisted_78, toDisplayString(photos.value.length) + " 项 ", 1)
        ])) : createCommentVNode("", true),
        createBaseVNode("button", {
          type: "button",
          class: "absolute bottom-3 right-3 z-20 flex size-7 items-center justify-center rounded-full border border-line-default bg-surface-1 text-xs font-medium text-fg-muted shadow-sm transition-colors hover:bg-surface-hover hover:text-fg-primary",
          title: "帮助与快捷键（⌘K）",
          onClick: openHelp
        }, " ? ")
      ]);
    };
  }
}
