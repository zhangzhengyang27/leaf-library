/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$m = /* @__PURE__ */ defineComponent(
*/
{
  __name: "PhotoGrid",
  props: {
    sections: {},
    selectedSet: {},
    isSelectionMode: { type: Boolean },
    loading: { type: Boolean },
    mode: { default: "normal" },
    layout: { default: "waterfall" },
    navActiveId: { default: null },
    thumbSize: { default: "md" },
    display: { default: makeDisplayOptions },
    renamingId: { default: null },
    hasMore: { type: Boolean }
  },
  emits: ["load-more", "select-photo", "preview-photo", "open-photo", "toggle-favorite", "add-tag", "restore-photo", "context-menu", "drag-photos", "click-select", "marquee-select", "rename-commit", "rename-cancel", "import-folder", "install-extension"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const clipboard = usePhotoClipboard();
    const gridEl = ref(null);
    const containerW = ref(0);
    let resizeObserver = null;
    onMounted(() => {
      if (!gridEl.value) return;
      resizeObserver = new ResizeObserver((entries) => {
        const w2 = entries[0]?.contentRect.width ?? 0;
        if (w2 > 0) containerW.value = w2;
      });
      resizeObserver.observe(gridEl.value);
    });
    onBeforeUnmount(() => resizeObserver?.disconnect());
    function aspectOf(photo) {
      return photo.width && photo.height && photo.height > 0 ? photo.width / photo.height : 1;
    }
    const GRID_COLS = {
      sm: "grid-cols-[repeat(auto-fill,minmax(110px,1fr))]",
      md: "grid-cols-[repeat(auto-fill,minmax(150px,1fr))]",
      lg: "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]",
      xl: "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]"
    };
    const gridColsClass = computed(() => `grid ${GRID_COLS[props.thumbSize]} gap-1.5`);
    const MASONRY_COL_W = { sm: 110, md: 150, lg: 200, xl: 260 };
    function masonryMetaH() {
      return props.display.showName || props.display.showSummary !== "none" ? 42 : 6;
    }
    function masonryColumns(photos) {
      const w2 = containerW.value;
      if (w2 <= 0) return [photos];
      const n2 = Math.max(1, Math.floor(w2 / MASONRY_COL_W[props.thumbSize]));
      const colW = (w2 - (n2 - 1) * 6) / n2;
      const cols = Array.from({ length: n2 }, () => []);
      const heights = new Array(n2).fill(0);
      for (const p2 of photos) {
        let idx = 0;
        for (let i2 = 1; i2 < n2; i2++) if (heights[i2] < heights[idx]) idx = i2;
        cols[idx].push(p2);
        heights[idx] += colW / aspectOf(p2) + masonryMetaH();
      }
      return cols;
    }
    const masonryCache = /* @__PURE__ */ new WeakMap();
    const justifiedCache = /* @__PURE__ */ new WeakMap();
    function layoutSig(photos) {
      let sum = 0;
      for (const p2 of photos) sum += (p2.width ?? 0) * 31 + (p2.height ?? 0);
      return [
        containerW.value,
        props.thumbSize,
        props.layout,
        props.display.showName ? 1 : 0,
        props.display.showSummary,
        photos.length,
        photos[0]?.id ?? "",
        photos[photos.length - 1]?.id ?? "",
        sum
      ].join("|");
    }
    function cachedMasonryColumns(photos) {
      const sig = layoutSig(photos);
      const hit = masonryCache.get(photos);
      if (hit && hit.sig === sig) return hit.value;
      const value = masonryColumns(photos);
      masonryCache.set(photos, { sig, value });
      return value;
    }
    function cachedJustifiedRows(photos) {
      const sig = layoutSig(photos);
      const hit = justifiedCache.get(photos);
      if (hit && hit.sig === sig) return hit.value;
      const value = justifiedRows(photos);
      justifiedCache.set(photos, { sig, value });
      return value;
    }
    const cutIdsSet = computed(() => new Set(clipboard.cutPhotoIds.value));
    const JUSTIFY_H = { sm: 100, md: 140, lg: 180, xl: 240 };
    function justifiedRows(photos) {
      const w2 = containerW.value;
      if (w2 <= 0) return [];
      const baseH = JUSTIFY_H[props.thumbSize];
      const rows = [];
      let cur = [];
      let curW = 0;
      for (const p2 of photos) {
        cur.push(p2);
        curW += baseH * aspectOf(p2);
        if (curW >= w2) {
          rows.push({ photos: cur, height: Math.round(Math.min(baseH * (w2 / curW), baseH * 1.3)) });
          cur = [];
          curW = 0;
        }
      }
      if (cur.length) rows.push({ photos: cur, height: baseH });
      return rows;
    }
    const THUMB_BG = {
      auto: "bg-surface-hover",
      white: "bg-white",
      dark: "bg-[linear-gradient(45deg,#333_25%,transparent_25%),linear-gradient(-45deg,#333_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#333_75%),linear-gradient(-45deg,transparent_75%,#333_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0] bg-gray-700",
      transparent: "bg-transparent"
    };
    const thumbBgClass = computed(() => THUMB_BG[props.display?.thumbBackground ?? "auto"]);
    function fmtCardSize(bytes) {
      if (!bytes || bytes <= 0) return "—";
      if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
      if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${bytes.toFixed(1)} bytes`;
    }
    function fmtCardDate(ms2) {
      if (!ms2) return "—";
      const d2 = new Date(ms2);
      const p2 = (n2) => String(n2).padStart(2, "0");
      return `${d2.getFullYear()}/${p2(d2.getMonth() + 1)}/${p2(d2.getDate())}`;
    }
    function summaryText(p2) {
      switch (props.display.showSummary) {
        case "size":
          return fmtCardSize(p2.fileSize);
        case "added":
          return fmtCardDate(p2.importedAt);
        case "modified":
          return fmtCardDate(p2.fsModifiedAt ?? p2.modifiedAt);
        case "created":
          return fmtCardDate(p2.fsCreatedAt ?? p2.createdAt);
        case "dimensions":
        default:
          if (p2.kind === "video" || p2.kind === "audio") {
            if (!p2.durationMs) return "—";
            const total = Math.round(p2.durationMs / 1e3);
            return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
          }
          if (p2.kind === "bookmark") {
            try {
              return new URL(p2.sourceUrl ?? "").hostname;
            } catch {
              return "书签";
            }
          }
          if (p2.kind === "font") return "字体";
          if (p2.width && p2.height) return `${p2.width} × ${p2.height}`;
          return fmtCardSize(p2.fileSize);
      }
    }
    function visibleName(p2) {
      const i2 = p2.fileName.lastIndexOf(".");
      if (i2 > 0 && !props.display.showExtension) return p2.fileName.slice(0, i2);
      return p2.fileName;
    }
    function cardTooltip(p2) {
      const rows = [`格式: ${extBadge(p2).toLowerCase()}`];
      if (p2.width && p2.height) rows.push(`尺寸: ${p2.width} × ${p2.height}`);
      rows.push(`文件大小: ${fmtCardSize(p2.fileSize)}`);
      rows.push(`修改日期: ${fmtCardDate(p2.fsModifiedAt ?? p2.modifiedAt)}`);
      rows.push(`创建日期: ${fmtCardDate(p2.fsCreatedAt ?? p2.createdAt)}`);
      return rows.join("\n");
    }
    function extBadge(p2) {
      const i2 = p2.fileName.lastIndexOf(".");
      if (i2 >= 0 && i2 < p2.fileName.length - 1) return p2.fileName.slice(i2 + 1).toUpperCase();
      if (p2.kind === "bookmark") return "WEB";
      if (p2.kind === "font") return "FONT";
      return "FILE";
    }
    const renameValue = ref("");
    const renamingPhotoId = ref(null);
    function startRename(p2) {
      renamingPhotoId.value = p2.id;
      renameValue.value = p2.fileName;
      renameSettled = false;
      void nextTick(() => {
        const input2 = gridEl.value?.querySelector("input[data-rename-input]");
        if (input2) {
          input2.focus();
          const dot = p2.fileName.lastIndexOf(".");
          input2.setSelectionRange(0, dot > 0 ? dot : p2.fileName.length);
        }
      });
    }
    let renameSettled = false;
    function flatPhotos() {
      return props.sections.flatMap((s2) => s2.photos);
    }
    function commitRename(p2) {
      if (renameSettled) return;
      renameSettled = true;
      if (renameValue.value.trim() && renameValue.value !== p2.fileName) {
        emit("rename-commit", p2, renameValue.value);
      } else {
        emit("rename-cancel");
      }
    }
    const visibleCount = ref(RENDER_STEP$1);
    const sentinel = ref(null);
    let io2 = null;
    const totalCount = computed(() => props.sections.reduce((n2, s2) => n2 + s2.photos.length, 0));
    const cappedSections = computed(() => {
      let budget = visibleCount.value;
      const out = [];
      for (const s2 of props.sections) {
        if (budget <= 0) break;
        const take = Math.min(s2.photos.length, budget);
        out.push({ dateSection: s2.dateSection, photos: s2.photos.slice(0, take) });
        budget -= take;
      }
      return out;
    });
    function scrollParentOf(el2) {
      let node2 = el2.parentElement;
      while (node2) {
        const overflowY = getComputedStyle(node2).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") return node2;
        node2 = node2.parentElement;
      }
      return null;
    }
    watch(totalCount, (n2, o2) => {
      if (n2 < o2) visibleCount.value = RENDER_STEP$1;
    });
    watch(
      () => props.renamingId,
      (id3) => {
        if (!id3) {
          if (renamingPhotoId.value) renamingPhotoId.value = null;
          return;
        }
        if (renamingPhotoId.value === id3) return;
        const target = flatPhotos().find((p2) => p2.id === id3);
        if (target) startRename(target);
      },
      // immediate：布局来回切换时组件重新挂载而 renamingId 仍在，缺它则输入框不再出现
      { immediate: true }
    );
    watch(
      () => sentinel.value,
      (el2) => {
        io2?.disconnect();
        io2 = null;
        if (!el2) return;
        const scroller = scrollParentOf(el2);
        io2 = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e64) => e64.isIntersecting)) return;
            if (visibleCount.value < totalCount.value) {
              visibleCount.value += RENDER_STEP$1;
            } else if (props.hasMore) {
              emit("load-more");
            }
          },
          { root: scroller, rootMargin: "800px" }
        );
        io2.observe(el2);
        if (scroller && scroller !== scrollEl) {
          scrollEl = scroller;
          const onScroll = () => {
            if (visibleCount.value <= RENDER_STEP$1) return;
            if (scroller.scrollTop < scroller.clientHeight * 2) {
              visibleCount.value = RENDER_STEP$1;
            }
          };
          scroller.addEventListener("scroll", onScroll, { passive: true });
          scrollCleanup = () => {
            scroller.removeEventListener("scroll", onScroll);
            scrollCleanup = null;
          };
        }
      },
      { immediate: true }
    );
    let scrollEl = null;
    let scrollCleanup = null;
    onUnmounted(() => {
      io2?.disconnect();
      scrollCleanup?.();
    });
    const emit = __emit;
    const marquee = useMarquee({
      getContainer: () => gridEl.value,
      itemSelector: ".photo-item",
      enabled: () => props.mode !== "trash",
      getBaseSelection: () => Array.from(props.selectedSet),
      onSelect: (ids) => emit("marquee-select", ids)
    });
    const isSelected = (photoId) => {
      return props.selectedSet.has(photoId);
    };
    const handleClick = (photo, e64) => {
      if (props.mode === "trash") return;
      if (e64.metaKey || e64.ctrlKey || e64.shiftKey) {
        emit("click-select", photo.id, {
          metaKey: e64.metaKey,
          ctrlKey: e64.ctrlKey,
          shiftKey: e64.shiftKey
        });
        return;
      }
      emit("marquee-select", [photo.id]);
    };
    const handleDblClick = (photo, e64) => {
      if (props.mode === "trash") return;
      if (e64.metaKey || e64.ctrlKey || e64.shiftKey || props.isSelectionMode) return;
      if (loadDoubleClickAction() === "system") emit("open-photo", photo);
      else emit("preview-photo", photo);
    };
    const onDragStart = (photo, e64) => {
      emit("drag-photos", { photo, e: e64 });
    };
    __expose({ startRename, flatPhotos });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "gridEl",
        ref: gridEl,
        class: normalizeClass(["photo-grid relative p-2.5", unref(marquee).marqueeActive.value ? "select-none" : ""]),
        onPointerdown: _cache[8] || (_cache[8] = //@ts-ignore
        (...args) => unref(marquee).onPointerDown && unref(marquee).onPointerDown(...args))
      }, [
        unref(marquee).marqueeActive.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "pointer-events-none fixed z-20 rounded-sm border border-brand-400 bg-brand-500/10",
          style: normalizeStyle({
            left: `${unref(marquee).marqueeRect.value.x}px`,
            top: `${unref(marquee).marqueeRect.value.y}px`,
            width: `${unref(marquee).marqueeRect.value.w}px`,
            height: `${unref(marquee).marqueeRect.value.h}px`
          }),
          "aria-hidden": "true"
        }, null, 4)) : createCommentVNode("", true),
        __props.loading ? (openBlock(), createElementBlock("div", _hoisted_1$m, "加载中...")) : __props.sections.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_2$m, [
          __props.mode === "trash" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            _cache[9] || (_cache[9] = createBaseVNode("div", { class: "mb-4 text-6xl" }, "📷", -1)),
            _cache[10] || (_cache[10] = createBaseVNode("div", { class: "text-xl" }, "回收站是空的", -1))
          ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            _cache[11] || (_cache[11] = createStaticVNode('<svg class="mb-6 size-44 text-fg-tertiary" viewBox="0 0 200 150" fill="none" aria-hidden="true" data-v-ba8ea86c><g opacity="0.55" data-v-ba8ea86c><rect x="18" y="26" width="26" height="26" rx="6" class="stroke-current" stroke-width="3" data-v-ba8ea86c></rect><rect x="152" y="20" width="30" height="30" rx="7" class="stroke-current" stroke-width="3" data-v-ba8ea86c></rect><circle cx="158" cy="106" r="14" class="stroke-current" stroke-width="3" data-v-ba8ea86c></circle><rect x="24" y="92" width="26" height="32" rx="5" class="stroke-current" stroke-width="3" data-v-ba8ea86c></rect><path d="M30 100h14M30 106h14M30 112h9" class="stroke-current" stroke-width="2.5" stroke-linecap="round" data-v-ba8ea86c></path></g><path d="M55 66c0-4.4 3.6-8 8-8h24l9 9h41c4.4 0 8 3.6 8 8v47c0 4.4-3.6 8-8 8H63c-4.4 0-8-3.6-8-8V66Z" class="fill-current opacity-25" data-v-ba8ea86c></path><path d="M55 74h90v39c0 4.4-3.6 8-8 8H63c-4.4 0-8-3.6-8-8V74Z" class="fill-current opacity-45" data-v-ba8ea86c></path><g class="stroke-current" stroke-width="6" stroke-linecap="round" data-v-ba8ea86c><path d="M100 84v22M89 95h22" data-v-ba8ea86c></path></g></svg><div class="mb-2 text-lg font-medium text-fg-primary" data-v-ba8ea86c>拖放文件到这里</div><div class="mb-6 text-xs text-fg-muted" data-v-ba8ea86c>你可以一次拖拽多个文件到这里添加</div>', 3)),
            createBaseVNode("div", _hoisted_3$k, [
              createBaseVNode("button", {
                type: "button",
                class: "rounded-md border border-line-default bg-surface-2 px-4 py-1.5 text-xs text-fg-primary transition-colors hover:bg-surface-hover",
                onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("import-folder"))
              }, " 导入本地文件夹 "),
              createBaseVNode("button", {
                type: "button",
                class: "rounded-md border border-line-default bg-surface-2 px-4 py-1.5 text-xs text-fg-primary transition-colors hover:bg-surface-hover",
                onClick: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("install-extension"))
              }, " 安装浏览器扩展 ")
            ])
          ], 64))
        ])) : (openBlock(), createElementBlock("div", _hoisted_4$i, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(cappedSections.value, (section) => {
            return openBlock(), createElementBlock("div", {
              key: section.dateSection,
              class: "photo-section"
            }, [
              __props.layout === "grid" ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: normalizeClass(gridColsClass.value)
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(section.photos, (photo) => {
                  return openBlock(), createElementBlock("div", {
                    key: photo.id,
                    "data-photo-id": photo.id,
                    class: normalizeClass(["photo-item group relative flex cursor-pointer flex-col", cutIdsSet.value.has(photo.id) ? "opacity-40" : ""]),
                    draggable: "true",
                    onClick: ($event) => handleClick(photo, $event),
                    onDblclick: ($event) => handleDblClick(photo, $event),
                    onContextmenu: withModifiers(($event) => emit("context-menu", { photo, x: $event.clientX, y: $event.clientY }), ["prevent"]),
                    onDragstart: ($event) => onDragStart(photo, $event)
                  }, [
                    createBaseVNode("div", {
                      class: normalizeClass([
                        "thumb-wrap relative aspect-square w-full overflow-hidden rounded-[3px] border-2 transition-all duration-fast",
                        thumbBgClass.value,
                        isSelected(photo.id) || __props.navActiveId === photo.id ? "border-brand-500" : "border-transparent"
                      ]),
                      title: cardTooltip(photo)
                    }, [
                      createVNode(_sfc_main$p, { photo }, null, 8, ["photo"]),
                      createVNode(_sfc_main$o, {
                        photo,
                        selected: isSelected(photo.id),
                        mode: __props.mode,
                        "show-bar": __props.display.showHoverBar,
                        onRestore: ($event) => _ctx.$emit("restore-photo", photo.id),
                        onPreview: ($event) => _ctx.$emit("preview-photo", photo)
                      }, null, 8, ["photo", "selected", "mode", "show-bar", "onRestore", "onPreview"])
                    ], 10, _hoisted_6$i),
                    createVNode(_sfc_main$n, {
                      selected: isSelected(photo.id),
                      "show-name": __props.display.showName,
                      "show-summary": __props.display.showSummary !== "none",
                      renaming: renamingPhotoId.value === photo.id,
                      "rename-value": renameValue.value,
                      name: visibleName(photo),
                      summary: summaryText(photo),
                      "onUpdate:renameValue": _cache[2] || (_cache[2] = ($event) => renameValue.value = $event),
                      onRenameCommit: ($event) => commitRename(photo),
                      onRenameCancel: _cache[3] || (_cache[3] = ($event) => emit("rename-cancel"))
                    }, null, 8, ["selected", "show-name", "show-summary", "renaming", "rename-value", "name", "summary", "onRenameCommit"])
                  ], 42, _hoisted_5$i);
                }), 128))
              ], 2)) : __props.layout === "waterfall" ? (openBlock(), createElementBlock("div", _hoisted_7$g, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(cachedMasonryColumns(section.photos), (col, ci2) => {
                  return openBlock(), createElementBlock("div", {
                    key: `col-${ci2}`,
                    class: "flex min-w-0 flex-1 flex-col gap-1.5"
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(col, (photo) => {
                      return openBlock(), createElementBlock("div", {
                        key: photo.id,
                        "data-photo-id": photo.id,
                        class: normalizeClass(["photo-item group relative flex cursor-pointer flex-col", cutIdsSet.value.has(photo.id) ? "opacity-40" : ""]),
                        draggable: "true",
                        onClick: ($event) => handleClick(photo, $event),
                        onDblclick: ($event) => handleDblClick(photo, $event),
                        onContextmenu: withModifiers(($event) => emit("context-menu", { photo, x: $event.clientX, y: $event.clientY }), ["prevent"]),
                        onDragstart: ($event) => onDragStart(photo, $event)
                      }, [
                        createBaseVNode("div", {
                          class: normalizeClass([
                            "thumb-wrap relative w-full overflow-hidden rounded-[3px] border-2 transition-all duration-fast",
                            thumbBgClass.value,
                            isSelected(photo.id) || __props.navActiveId === photo.id ? "border-brand-500" : "border-transparent"
                          ]),
                          style: normalizeStyle({ aspectRatio: `${aspectOf(photo)}` }),
                          title: cardTooltip(photo)
                        }, [
                          createVNode(_sfc_main$p, { photo }, null, 8, ["photo"]),
                          createVNode(_sfc_main$o, {
                            photo,
                            selected: isSelected(photo.id),
                            mode: __props.mode,
                            "show-bar": __props.display.showHoverBar,
                            onRestore: ($event) => _ctx.$emit("restore-photo", photo.id),
                            onPreview: ($event) => _ctx.$emit("preview-photo", photo)
                          }, null, 8, ["photo", "selected", "mode", "show-bar", "onRestore", "onPreview"])
                        ], 14, _hoisted_9$d),
                        createVNode(_sfc_main$n, {
                          selected: isSelected(photo.id),
                          "show-name": __props.display.showName,
                          "show-summary": __props.display.showSummary !== "none",
                          renaming: renamingPhotoId.value === photo.id,
                          "rename-value": renameValue.value,
                          name: visibleName(photo),
                          summary: summaryText(photo),
                          "onUpdate:renameValue": _cache[4] || (_cache[4] = ($event) => renameValue.value = $event),
                          onRenameCommit: ($event) => commitRename(photo),
                          onRenameCancel: _cache[5] || (_cache[5] = ($event) => emit("rename-cancel"))
                        }, null, 8, ["selected", "show-name", "show-summary", "renaming", "rename-value", "name", "summary", "onRenameCommit"])
                      ], 42, _hoisted_8$e);
                    }), 128))
                  ]);
                }), 128))
              ])) : (openBlock(), createElementBlock("div", _hoisted_10$d, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(cachedJustifiedRows(section.photos), (row, ri2) => {
                  return openBlock(), createElementBlock("div", {
                    key: `row-${ri2}`,
                    class: "flex items-start justify-start gap-1.5"
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(row.photos, (photo) => {
                      return openBlock(), createElementBlock("div", {
                        key: photo.id,
                        "data-photo-id": photo.id,
                        class: normalizeClass(["photo-item group relative flex cursor-pointer flex-col", cutIdsSet.value.has(photo.id) ? "opacity-40" : ""]),
                        style: normalizeStyle({ width: Math.round(row.height * aspectOf(photo)) + "px" }),
                        draggable: "true",
                        onClick: ($event) => handleClick(photo, $event),
                        onDblclick: ($event) => handleDblClick(photo, $event),
                        onContextmenu: withModifiers(($event) => emit("context-menu", { photo, x: $event.clientX, y: $event.clientY }), ["prevent"]),
                        onDragstart: ($event) => onDragStart(photo, $event)
                      }, [
                        createBaseVNode("div", {
                          class: normalizeClass([
                            "thumb-wrap relative w-full overflow-hidden rounded-[3px] border-2 transition-all duration-fast",
                            thumbBgClass.value,
                            isSelected(photo.id) || __props.navActiveId === photo.id ? "border-brand-500" : "border-transparent"
                          ]),
                          style: normalizeStyle({ height: row.height + "px" }),
                          title: cardTooltip(photo)
                        }, [
                          createVNode(_sfc_main$p, { photo }, null, 8, ["photo"]),
                          createVNode(_sfc_main$o, {
                            photo,
                            selected: isSelected(photo.id),
                            mode: __props.mode,
                            "show-bar": __props.display.showHoverBar,
                            onRestore: ($event) => _ctx.$emit("restore-photo", photo.id),
                            onPreview: ($event) => _ctx.$emit("preview-photo", photo)
                          }, null, 8, ["photo", "selected", "mode", "show-bar", "onRestore", "onPreview"])
                        ], 14, _hoisted_12$9),
                        createVNode(_sfc_main$n, {
                          selected: isSelected(photo.id),
                          "show-name": __props.display.showName,
                          "show-summary": __props.display.showSummary !== "none",
                          renaming: renamingPhotoId.value === photo.id,
                          "rename-value": renameValue.value,
                          name: visibleName(photo),
                          summary: summaryText(photo),
                          "onUpdate:renameValue": _cache[6] || (_cache[6] = ($event) => renameValue.value = $event),
                          onRenameCommit: ($event) => commitRename(photo),
                          onRenameCancel: _cache[7] || (_cache[7] = ($event) => emit("rename-cancel"))
                        }, null, 8, ["selected", "show-name", "show-summary", "renaming", "rename-value", "name", "summary", "onRenameCommit"])
                      ], 46, _hoisted_11$9);
                    }), 128))
                  ]);
                }), 128))
              ]))
            ]);
          }), 128))
        ])),
        visibleCount.value < totalCount.value || __props.hasMore ? (openBlock(), createElementBlock("div", {
          key: 4,
          ref_key: "sentinel",
          ref: sentinel,
          class: "h-px w-full",
          "aria-hidden": "true"
        }, null, 512)) : createCommentVNode("", true)
      ], 34);
    };
  }
}
