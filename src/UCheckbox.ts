/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-C_4vKAXg.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$3 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "UCheckbox",
  props: {
    modelValue: { type: Boolean },
    disabled: { type: Boolean, default: false },
    label: { default: "" }
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("label", {
        class: normalizeClass(["inline-flex select-none cursor-pointer items-center gap-2 text-sm text-fg-primary", __props.disabled ? "cursor-not-allowed opacity-50" : ""])
      }, [
        createBaseVNode("input", {
          type: "checkbox",
          checked: __props.modelValue,
          disabled: __props.disabled,
          class: "peer sr-only",
          onChange: _cache[0] || (_cache[0] = ($event) => emit("update:modelValue", $event.target.checked))
        }, null, 40, _hoisted_1$3),
        createBaseVNode("span", _hoisted_2$3, [
          (openBlock(), createElementBlock("svg", {
            class: normalizeClass(["size-3 text-white opacity-0 transition-opacity", __props.modelValue ? "opacity-100" : ""]),
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "3"
          }, [..._cache[1] || (_cache[1] = [
            createBaseVNode("path", {
              d: "m5 13 4 4L19 7",
              "stroke-linecap": "round",
              "stroke-linejoin": "round"
            }, null, -1)
          ])], 2))
        ]),
        __props.label ? (openBlock(), createElementBlock("span", _hoisted_3$3, toDisplayString(__props.label), 1)) : createCommentVNode("", true)
      ], 2);
    };
  }
}
