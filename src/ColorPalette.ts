/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$e = /* @__PURE__ */ defineComponent(
*/
{
  __name: "ColorPalette",
  props: {
    modelValue: {},
    showClear: { type: Boolean }
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    function pick(key) {
      emit("update:modelValue", props.modelValue === key ? null : key);
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$e, [
        __props.showClear ? (openBlock(), createElementBlock("button", {
          key: 0,
          type: "button",
          class: normalizeClass([
            "flex size-5 items-center justify-center rounded-full border text-[10px] transition-transform duration-fast hover:scale-110",
            !__props.modelValue ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400" : "border-line-default text-fg-muted"
          ]),
          title: "清除主色筛选",
          onClick: _cache[0] || (_cache[0] = ($event) => emit("update:modelValue", null))
        }, " ✕ ", 2)) : createCommentVNode("", true),
        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(HUE_BUCKETS), (bucket) => {
          return openBlock(), createElementBlock("button", {
            key: bucket.key,
            type: "button",
            class: normalizeClass([
              "size-5 rounded-full border transition-transform duration-fast hover:scale-125",
              __props.modelValue === bucket.key ? "border-brand-500 ring-2 ring-brand-500/40" : "border-line-default"
            ]),
            style: normalizeStyle({ backgroundColor: bucket.css }),
            title: bucket.label,
            onClick: ($event) => pick(bucket.key)
          }, null, 14, _hoisted_2$e);
        }), 128))
      ]);
    };
  }
}
