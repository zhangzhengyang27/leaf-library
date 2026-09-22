/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-C_4vKAXg.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$4 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "UButton",
  props: {
    variant: { default: "secondary" },
    size: { default: "md" },
    type: { default: "button" },
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    block: { type: Boolean, default: false }
  },
  emits: ["click"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const sizeCls = computed(() => {
      if (props.size === "sm") return "h-7 px-2.5 text-xs gap-1.5 rounded-sm";
      if (props.size === "lg") return "h-11 px-5 text-sm gap-2 rounded-md";
      return "h-9 px-4 text-sm gap-2 rounded-md";
    });
    const variantCls = computed(() => {
      if (props.disabled || props.loading) {
        return "opacity-50 cursor-not-allowed";
      }
      switch (props.variant) {
        case "primary":
          return "bg-brand-500 text-white shadow-xs hover:bg-brand-400 active:bg-brand-600 focus-visible:shadow-ring-focus";
        case "ghost":
          return "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary active:bg-surface-active focus-visible:shadow-ring-focus";
        case "danger":
          return "bg-transparent text-danger border border-line-default hover:border-danger/40 hover:bg-danger/5 focus-visible:shadow-ring-danger";
        default:
          return "bg-surface-1 text-fg-primary border border-line-default hover:border-line-strong hover:bg-surface-2 active:bg-surface-hover focus-visible:shadow-ring-focus";
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("button", {
        type: __props.type,
        disabled: __props.disabled || __props.loading,
        class: normalizeClass(["inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-fast ease-out focus-visible:outline-none", [sizeCls.value, variantCls.value, __props.block ? "w-full" : ""]]),
        onClick: _cache[0] || (_cache[0] = ($event) => emit("click", $event))
      }, [
        __props.loading ? (openBlock(), createElementBlock("svg", _hoisted_2$4, [..._cache[1] || (_cache[1] = [
          createBaseVNode("circle", {
            cx: "12",
            cy: "12",
            r: "9",
            stroke: "currentColor",
            "stroke-width": "3",
            opacity: "0.25"
          }, null, -1),
          createBaseVNode("path", {
            d: "M21 12a9 9 0 0 0-9-9",
            stroke: "currentColor",
            "stroke-width": "3",
            "stroke-linecap": "round"
          }, null, -1)
        ])])) : createCommentVNode("", true),
        renderSlot(_ctx.$slots, "default")
      ], 10, _hoisted_1$4);
    };
  }
}
