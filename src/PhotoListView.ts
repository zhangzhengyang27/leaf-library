/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$l = /* @__PURE__ */ defineComponent(
*/
{
  __name: "PhotoListView",
  props: {
    sections: {},
    selectedSet: {},
    isSelectionMode: { type: Boolean },
    loading: { type: Boolean },
    mode: { default: "normal" },
    navActiveId: { default: null },
    hasMore: { type: Boolean },
    renamingId: { default: null }
  },
  emits: ["load-more", "select-photo", "preview-photo", "open-photo", "restore-photo", "context-menu", "drag-photos", "click-select", "marquee-select", "rename-commit", "rename-cancel"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const clipboard = usePhotoClipboard();
    const emit = __emit;
    const isSelected = (photoId) => props.selectedSet.has(photoId);
    const listEl = ref(null);
    const marquee = useMarquee({
      getContainer: () => listEl.value,
      itemSelector: ".list-row",
      enabled: () => props.mode !== "trash",
      getBaseSelection: () => [...props.selectedSet],
      onSelect: (ids) => emit("marquee-select", ids)
    });
    const renamingPhotoId = ref(null);
    const renameValue = ref("");
    let renameSettled = false;
    function startRename(p2) {
      renamingPhotoId.value = p2.id;
      renameValue.value = p2.fileName;
      renameSettled = false;
      void nextTick(() => {
        const input2 = listEl.value?.querySelector("input[data-rename-input]");
        if (input2) {
          input2.focus();
          const dot = p2.fileName.lastIndexOf(".");
          input2.setSelectionRange(0, dot > 0 ? dot : p2.fileName.length);
        }
      });
    }
    function commitRename(p2) {
      if (renameSettled) return;
      renameSettled = true;
      if (renameValue.value.trim() && renameValue.value !== p2.fileName)
        emit("rename-commit", p2, renameValue.value);
      else emit("rename-cancel");
      renamingPhotoId.value = null;
    }
    function cancelRename() {
      emit("rename-cancel");
      renamingPhotoId.value = null;
    }
    watch(
      () => props.renamingId,
      (id3) => {
        if (!id3) {
          renamingPhotoId.value = null;
          return;
        }
        if (renamingPhotoId.value === id3) return;
        const target = props.sections.flatMap((s2) => s2.photos).find((p2) => p2.id === id3);
        if (target) startRename(target);
      },
      // immediate：布局来回切换时组件会重新挂载，而父层的 renamingId 仍在——
      // 没有它则回到列表后输入框不再出现（与 PhotoGrid 同修）
      { immediate: true }
    );
    function handleClick(photo, e64) {
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
    }
    function handleDblClick(photo, e64) {
      if (props.mode === "trash") return;
      if (e64.metaKey || e64.ctrlKey || e64.shiftKey || props.isSelectionMode) return;
      if (loadDoubleClickAction() === "system") emit("open-photo", photo);
      else emit("preview-photo", photo);
    }
    function onDragStart(photo, e64) {
      emit("drag-photos", { photo, e: e64 });
    }
    const kindIcon = {
      image: "ic_photo",
      video: "ic_film",
      audio: "ic_music",
      font: "ic_font-sans",
      bookmark: "ic_book",
      file: "context-menu/ic-filter-item-ext"
    };
    function formatSize(bytes) {
      if (!bytes) return "—";
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    function formatDims(photo) {
      if (photo.kind === "video" && photo.durationMs) {
        const sec = Math.round(photo.durationMs / 1e3);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
      }
      if (photo.width && photo.height) return `${photo.width}×${photo.height}`;
      return "—";
    }
    function formatDate(photo) {
      const d2 = new Date(photo.importedAt);
      return `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}-${String(
        d2.getDate()
      ).padStart(2, "0")}`;
    }
    const isDateSection = (s2) => /^\d{4}-\d{2}-\d{2}$/.test(s2);
    const sectionTitle = (s2) => {
      if (!isDateSection(s2)) return s2;
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 864e5).toISOString().split("T")[0];
      if (s2 === today) return "今天";
      if (s2 === yesterday) return "昨天";
      return s2;
    };
    const flatCount = computed(() => props.sections.reduce((n2, s2) => n2 + s2.photos.length, 0));
    const visibleCount = ref(RENDER_STEP);
    const sentinel = ref(null);
    let io2 = null;
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
    watch(flatCount, (n2, o2) => {
      if (n2 < o2) visibleCount.value = RENDER_STEP;
    });
    watch(
      () => sentinel.value,
      (el2) => {
        io2?.disconnect();
        io2 = null;
        if (!el2) return;
        io2 = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e64) => e64.isIntersecting)) return;
            if (visibleCount.value < flatCount.value) {
              visibleCount.value += RENDER_STEP;
            } else if (props.hasMore) {
              emit("load-more");
            }
          },
          { root: scrollParentOf(el2), rootMargin: "800px" }
        );
        io2.observe(el2);
      },
      { immediate: true }
    );
    onUnmounted(() => io2?.disconnect());
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "listEl",
        ref: listEl,
        class: normalizeClass(["photo-list relative p-4", unref(marquee).marqueeActive.value ? "select-none" : ""]),
        onPointerdown: _cache[4] || (_cache[4] = //@ts-ignore
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
        __props.loading ? (openBlock(), createElementBlock("div", _hoisted_1$l, "加载中...")) : flatCount.value === 0 ? (openBlock(), createElementBlock("div", _hoisted_2$l, [
          _cache[5] || (_cache[5] = createBaseVNode("div", { class: "mb-4 text-6xl" }, "📷", -1)),
          createBaseVNode("div", _hoisted_3$j, toDisplayString(__props.mode === "trash" ? "回收站是空的" : "还没有素材"), 1),
          createBaseVNode("div", _hoisted_4$h, toDisplayString(__props.mode === "trash" ? "" : "点击工具栏导入，或从浏览器剪藏收集"), 1)
        ])) : (openBlock(), createElementBlock("div", _hoisted_5$h, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(cappedSections.value, (section) => {
            return openBlock(), createElementBlock("div", {
              key: section.dateSection
            }, [
              createBaseVNode("div", _hoisted_6$h, [
                createBaseVNode("h2", _hoisted_7$f, toDisplayString(sectionTitle(section.dateSection)), 1),
                createBaseVNode("span", _hoisted_8$d, toDisplayString(section.photos.length) + " 项", 1)
              ]),
              createBaseVNode("div", _hoisted_9$c, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(section.photos, (photo) => {
                  return openBlock(), createElementBlock("div", {
                    key: photo.id,
                    class: normalizeClass(["list-row group flex h-11 items-center gap-3 border-b border-line-subtle px-3 transition-colors duration-instant last:border-b-0", [
                      isSelected(photo.id) ? "bg-brand-500/10" : "hover:bg-surface-hover",
                      __props.navActiveId === photo.id ? "ring-1 ring-inset ring-brand-500" : "",
                      unref(clipboard).cutPhotoIds.value.includes(photo.id) ? "opacity-40" : ""
                    ]]),
                    "data-photo-id": photo.id,
                    draggable: "true",
                    onClick: ($event) => handleClick(photo, $event),
                    onDblclick: ($event) => handleDblClick(photo, $event),
                    onContextmenu: withModifiers(($event) => emit("context-menu", { photo, x: $event.clientX, y: $event.clientY }), ["prevent"]),
                    onDragstart: ($event) => onDragStart(photo, $event)
                  }, [
                    createBaseVNode("span", {
                      class: normalizeClass([
                        "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                        isSelected(photo.id) ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong text-transparent group-hover:border-brand-400"
                      ]),
                      onClick: withModifiers(($event) => emit("select-photo", photo.id, !isSelected(photo.id)), ["stop"])
                    }, [
                      isSelected(photo.id) ? (openBlock(), createBlock(_sfc_main$L, {
                        key: 0,
                        icon: "ic-check",
                        size: 10
                      })) : createCommentVNode("", true)
                    ], 10, _hoisted_11$8),
                    createBaseVNode("div", _hoisted_12$8, [
                      createVNode(_sfc_main$q, {
                        photo,
                        cover: true
                      }, null, 8, ["photo"])
                    ]),
                    renamingPhotoId.value === photo.id ? (openBlock(), createElementBlock("input", {
                      key: 0,
                      "data-rename-input": "",
                      class: "min-w-0 flex-1 truncate rounded-xs border border-brand-500 bg-surface-1 px-1 text-xs text-fg-primary outline-none",
                      value: renameValue.value,
                      draggable: "false",
                      onClick: _cache[0] || (_cache[0] = withModifiers(() => {
                      }, ["stop"])),
                      onDblclick: _cache[1] || (_cache[1] = withModifiers(() => {
                      }, ["stop"])),
                      onInput: _cache[2] || (_cache[2] = ($event) => renameValue.value = $event.target.value),
                      onKeydown: [
                        withKeys(withModifiers(($event) => commitRename(photo), ["prevent"]), ["enter"]),
                        _cache[3] || (_cache[3] = withKeys(withModifiers(($event) => cancelRename(), ["prevent"]), ["esc"]))
                      ],
                      onBlur: ($event) => commitRename(photo)
                    }, null, 40, _hoisted_13$8)) : (openBlock(), createElementBlock("span", _hoisted_14$7, toDisplayString(photo.fileName), 1)),
                    createBaseVNode("span", {
                      class: "hidden w-20 shrink-0 items-center gap-1 text-[11px] text-fg-muted md:flex",
                      title: unref(KIND_LABELS)[photo.kind]
                    }, [
                      createVNode(_sfc_main$L, {
                        icon: kindIcon[photo.kind] ?? "context-menu/ic-filter-item-ext",
                        size: 13
                      }, null, 8, ["icon"]),
                      createTextVNode(" " + toDisplayString(unref(KIND_LABELS)[photo.kind]), 1)
                    ], 8, _hoisted_15$7),
                    createBaseVNode("span", _hoisted_16$6, toDisplayString(formatDims(photo)), 1),
                    createBaseVNode("span", _hoisted_17$4, toDisplayString(formatSize(photo.fileSize)), 1),
                    createBaseVNode("span", _hoisted_18$3, toDisplayString(formatDate(photo)), 1),
                    photo.rating > 0 ? (openBlock(), createElementBlock("span", _hoisted_19$3, " ★" + toDisplayString(photo.rating), 1)) : (openBlock(), createElementBlock("span", _hoisted_20$3)),
                    __props.mode === "trash" ? (openBlock(), createElementBlock("button", {
                      key: 4,
                      type: "button",
                      class: "shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-fg-secondary opacity-0 transition-opacity hover:bg-surface-hover hover:text-fg-primary group-hover:opacity-100",
                      onClick: withModifiers(($event) => emit("restore-photo", photo.id), ["stop"])
                    }, " 恢复 ", 8, _hoisted_21$3)) : createCommentVNode("", true)
                  ], 42, _hoisted_10$c);
                }), 128))
              ])
            ]);
          }), 128))
        ])),
        visibleCount.value < flatCount.value || __props.hasMore ? (openBlock(), createElementBlock("div", {
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
