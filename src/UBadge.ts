/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(UBadge.vue_vue_type_script_setup_true_lang-DRizaNaj.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main = /* @__PURE__ */ defineComponent(
*/
{
  __name: "UBadge",
  props: {
    variant: { default: "neutral" },
    dot: { type: Boolean, default: false }
  },
  setup(__props) {
    const props = __props;
    const cls = computed(() => {
      switch (props.variant) {
        case "brand":
          return "bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20";
        case "success":
          return "bg-success/10 text-success border-success/20";
        case "warning":
          return "bg-warning/10 text-warning border-warning/25";
        case "danger":
          return "bg-danger/10 text-danger border-danger/20";
        default:
          return "bg-surface-hover text-fg-secondary border-line-default";
      }
    });
    const dotCls = computed(() => {
      switch (props.variant) {
        case "brand":
          return "bg-brand-500";
        case "success":
          return "bg-success";
        case "warning":
          return "bg-warning";
        case "danger":
          return "bg-danger";
        default:
          return "bg-gray-400";
      }
    });
    return (_ctx, _cache) => {
      return __props.dot ? (openBlock(), createElementBlock("span", {
        key: 0,
        class: normalizeClass(["inline-block size-2 shrink-0 rounded-full", dotCls.value]),
        "aria-hidden": "true"
      }, null, 2)) : (openBlock(), createElementBlock("span", {
        key: 1,
        class: normalizeClass(["inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none", cls.value])
      }, [
        renderSlot(_ctx.$slots, "default")
      ], 2));
    };
  }
}
