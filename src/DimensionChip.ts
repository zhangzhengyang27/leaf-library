/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$H = /* @__PURE__ */ defineComponent(
*/
{
  __name: "DimensionChip",
  props: {
    label: {},
    icon: {},
    active: { type: Boolean },
    token: {}
  },
  setup(__props, { expose: __expose }) {
    const slots = useSlots();
    const hasPanel = () => !!slots.panel;
    const open = ref(false);
    const rootEl = ref(null);
    function toggle() {
      if (open.value) close();
      else show();
    }
    function show() {
      if (open.value) return;
      open.value = true;
      window.dispatchEvent(new CustomEvent(CHIP_OPEN_EVENT, { detail: rootEl.value }));
      setTimeout(() => {
        document.addEventListener("mousedown", onOutside, true);
        window.addEventListener("keydown", onEsc, true);
      }, 0);
    }
    function onSiblingOpen(e64) {
      if (e64.detail !== rootEl.value && open.value) close();
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
      document.removeEventListener("mousedown", onOutside, true);
      window.removeEventListener("keydown", onEsc, true);
    }
    onMounted(() => window.addEventListener(CHIP_OPEN_EVENT, onSiblingOpen));
    onBeforeUnmount(() => {
      close();
      window.removeEventListener(CHIP_OPEN_EVENT, onSiblingOpen);
    });
    __expose({ close, show });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "rootEl",
        ref: rootEl,
        class: "relative"
      }, [
        createBaseVNode("button", {
          type: "button",
          class: normalizeClass([
            "flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[11px] transition-colors duration-fast",
            __props.active || open.value ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400" : "border-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg-primary"
          ]),
          "aria-pressed": __props.active,
          onClick: toggle
        }, [
          createVNode(_sfc_main$L, {
            icon: __props.icon,
            size: 14
          }, null, 8, ["icon"]),
          createTextVNode(" " + toDisplayString(__props.token ?? __props.label), 1)
        ], 10, _hoisted_1$H),
        open.value && hasPanel() ? (openBlock(), createElementBlock("div", _hoisted_2$G, [
          renderSlot(_ctx.$slots, "panel", { close })
        ])) : createCommentVNode("", true)
      ], 512);
    };
  }
}
