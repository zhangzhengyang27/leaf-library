/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(appPreferences-DOyKBPjh.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main = /* @__PURE__ */ defineComponent(
*/
{
  __name: "USwitch",
  props: {
    modelValue: { type: Boolean },
    disabled: { type: Boolean, default: false },
    label: { default: "" },
    size: { default: "md" }
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const toggle = () => {
      if (!props.disabled) emit("update:modelValue", !props.modelValue);
    };
    const trackCls = computed(() => {
      const w = props.size === "sm" ? "w-8 h-[18px]" : "w-10 h-6";
      const on = "bg-brand-500";
      const off = "bg-gray-300 dark:bg-gray-400";
      return [w, props.modelValue ? on : off];
    });
    const knobCls = computed(() => {
      const s = props.size === "sm" ? "size-3.5" : "size-[20px]";
      const pos = props.size === "sm" ? props.modelValue ? "translate-x-[14px]" : "translate-x-0.5" : props.modelValue ? "translate-x-[18px]" : "translate-x-0.5";
      return [s, pos];
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("button", {
        type: "button",
        role: "switch",
        "aria-checked": __props.modelValue,
        disabled: __props.disabled,
        class: "inline-flex select-none items-center gap-2.5 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        onClick: toggle
      }, [
        createBaseVNode("span", {
          class: normalizeClass(["relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-normal", trackCls.value])
        }, [
          createBaseVNode("span", {
            class: normalizeClass(["block rounded-full bg-white shadow-xs transition-transform duration-normal ease-out", knobCls.value])
          }, null, 2)
        ], 2),
        __props.label ? (openBlock(), createElementBlock("span", _hoisted_2, toDisplayString(__props.label), 1)) : createCommentVNode("", true)
      ], 8, _hoisted_1);
    };
  }
}
