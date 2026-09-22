/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$I = /* @__PURE__ */ defineComponent(
*/
{
  __name: "DimensionPoolPopover",
  props: {
    pinned: {}
  },
  emits: ["toggle", "reorder"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const emit = __emit;
    const open = ref(false);
    const rootEl = ref(null);
    const search = ref("");
    const order = ref(loadDimensionOrder());
    const metaById = computed(() => {
      const map2 = /* @__PURE__ */ new Map();
      for (const d2 of FILTER_DIMENSIONS) map2.set(d2.id, d2);
      return map2;
    });
    const results = computed(() => {
      const q3 = search.value.trim().toLowerCase();
      const list2 = order.value.map((id3) => metaById.value.get(id3)).filter((d2) => !!d2);
      if (!q3) return list2;
      return list2.filter((d2) => d2.label.toLowerCase().includes(q3));
    });
    const draggingId = ref(null);
    const dragOverId = ref(null);
    function onDragStart(id3, e64) {
      draggingId.value = id3;
      if (e64.dataTransfer) {
        e64.dataTransfer.effectAllowed = "move";
        e64.dataTransfer.setData("text/plain", id3);
      }
    }
    function onDragOver(id3, e64) {
      if (!draggingId.value || draggingId.value === id3) return;
      e64.preventDefault();
      e64.dataTransfer && (e64.dataTransfer.dropEffect = "move");
      dragOverId.value = id3;
    }
    function onDrop(id3, e64) {
      e64.preventDefault();
      if (draggingId.value && draggingId.value !== id3) emit("reorder", draggingId.value, id3);
      draggingId.value = null;
      dragOverId.value = null;
    }
    function onDragEnd() {
      draggingId.value = null;
      dragOverId.value = null;
    }
    let outsideTimer;
    function toggleOpen() {
      open.value = !open.value;
      if (open.value) {
        outsideTimer = window.setTimeout(() => {
          outsideTimer = void 0;
          document.addEventListener("mousedown", onOutside, true);
          window.addEventListener("keydown", onEsc, true);
        }, 0);
      }
    }
    function onOutside(e64) {
      if (rootEl.value && !rootEl.value.contains(e64.target)) close();
    }
    function onEsc(e64) {
      if (e64.key === "Escape") {
        e64.stopPropagation();
        close();
      }
    }
    function close() {
      open.value = false;
      if (outsideTimer !== void 0) {
        window.clearTimeout(outsideTimer);
        outsideTimer = void 0;
      }
      document.removeEventListener("mousedown", onOutside, true);
      window.removeEventListener("keydown", onEsc, true);
    }
    function onDimsChanged() {
      order.value = loadDimensionOrder();
    }
    onMounted(() => window.addEventListener("leaf:dimensions-changed", onDimsChanged));
    onBeforeUnmount(() => {
      close();
      window.removeEventListener("leaf:dimensions-changed", onDimsChanged);
    });
    __expose({ close });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "rootEl",
        ref: rootEl,
        class: "relative"
      }, [
        open.value ? (openBlock(), createElementBlock("div", _hoisted_1$I, [
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => search.value = $event),
            type: "text",
            placeholder: "搜索...",
            class: "mb-2 h-6 w-full rounded-sm border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500"
          }, null, 512), [
            [vModelText, search.value]
          ]),
          (openBlock(true), createElementBlock(Fragment, null, renderList(results.value, (d2) => {
            return openBlock(), createElementBlock("div", {
              key: d2.id,
              class: normalizeClass(["flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 text-[11px] text-fg-primary transition-colors duration-fast hover:bg-surface-hover", [
                draggingId.value === d2.id ? "opacity-40" : "",
                dragOverId.value === d2.id ? "ring-1 ring-brand-400" : ""
              ]]),
              draggable: "true",
              onDragstart: ($event) => onDragStart(d2.id, $event),
              onDragover: ($event) => onDragOver(d2.id, $event),
              onDrop: ($event) => onDrop(d2.id, $event),
              onDragend: onDragEnd,
              onClick: ($event) => emit("toggle", d2.id)
            }, [
              createVNode(_sfc_main$L, {
                icon: "ic-drag-help",
                size: 11,
                class: "shrink-0 cursor-grab text-fg-muted"
              }),
              createVNode(_sfc_main$L, {
                icon: d2.icon,
                size: 13,
                class: "shrink-0 text-fg-secondary"
              }, null, 8, ["icon"]),
              createBaseVNode("span", _hoisted_3$B, toDisplayString(d2.label), 1),
              d2.ai ? (openBlock(), createElementBlock("span", _hoisted_4$y, "AI")) : createCommentVNode("", true),
              createVNode(_sfc_main$L, {
                icon: __props.pinned.includes(d2.id) ? "context-menu/ic-filter-pinned" : "context-menu/ic-filter-pin",
                size: 13,
                class: normalizeClass(["shrink-0", __props.pinned.includes(d2.id) ? "text-brand-500" : "text-fg-muted"])
              }, null, 8, ["icon", "class"])
            ], 42, _hoisted_2$H);
          }), 128)),
          results.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_5$y, "无匹配维度")) : createCommentVNode("", true)
        ])) : createCommentVNode("", true),
        renderSlot(_ctx.$slots, "default", {
          toggle: toggleOpen,
          open: open.value
        })
      ], 512);
    };
  }
}
