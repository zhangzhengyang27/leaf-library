/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(SettingsView-DBMPMz14.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$1 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "UProgress",
  props: {
    value: {},
    variant: { default: "brand" },
    hint: { default: "" }
  },
  setup(__props) {
    const props = __props;
    const indeterminate = computed(() => props.value === void 0 || props.value === null);
    const pct = computed(() => Math.min(100, Math.max(0, props.value ?? 0)));
    const barCls = computed(() => {
      switch (props.variant) {
        case "success":
          return "bg-success";
        case "danger":
          return "bg-danger";
        default:
          return "bg-brand-500";
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("div", {
          class: "h-1.5 w-full overflow-hidden rounded-full bg-surface-active",
          role: "progressbar",
          "aria-valuenow": indeterminate.value ? void 0 : Math.round(pct.value)
        }, [
          !indeterminate.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: normalizeClass(["h-full rounded-full transition-[width] duration-slow ease-out", barCls.value]),
            style: normalizeStyle({ width: `${pct.value}%` })
          }, null, 6)) : (openBlock(), createElementBlock("div", {
            key: 1,
            class: normalizeClass(["u-progress-indeterminate h-full w-1/3 rounded-full", barCls.value])
          }, null, 2))
        ], 8, _hoisted_2$1),
        __props.hint ? (openBlock(), createElementBlock("p", _hoisted_3$1, toDisplayString(__props.hint), 1)) : createCommentVNode("", true)
      ]);
    };
  }
}
