/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$G = /* @__PURE__ */ defineComponent(
*/
{
  __name: "OptionRow",
  props: {
    label: {},
    state: { default: "off" },
    selected: { type: Boolean, default: false },
    multiselect: { type: Boolean, default: false },
    excludable: { type: Boolean, default: void 0 },
    disabled: { type: Boolean, default: false },
    count: { default: void 0 }
  },
  emits: ["pick", "exclude"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("button", {
        type: "button",
        class: normalizeClass(["flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[11px] transition-colors duration-fast", __props.disabled ? "text-fg-muted" : "text-fg-primary hover:bg-surface-hover"]),
        disabled: __props.disabled,
        onClick: _cache[0] || (_cache[0] = ($event) => emit("pick")),
        onContextmenu: _cache[1] || (_cache[1] = withModifiers(($event) => __props.multiselect && (__props.excludable ?? true) && emit("exclude"), ["prevent"]))
      }, [
        __props.multiselect ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
          __props.state === "include" ? (openBlock(), createBlock(_sfc_main$L, {
            key: 0,
            icon: "context-menu/ic-context-menu-checkbox",
            size: 13,
            class: "text-brand-500"
          })) : __props.state === "exclude" ? (openBlock(), createBlock(_sfc_main$L, {
            key: 1,
            icon: "ic-condition-remove",
            size: 13,
            class: "text-danger"
          })) : (openBlock(), createElementBlock("span", _hoisted_2$F))
        ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          __props.selected ? (openBlock(), createElementBlock("span", _hoisted_3$A)) : (openBlock(), createElementBlock("span", _hoisted_4$x))
        ], 64)),
        createBaseVNode("span", {
          class: normalizeClass(["min-w-0 flex-1 truncate", __props.state === "exclude" ? "text-fg-muted line-through" : ""])
        }, toDisplayString(__props.label), 3),
        __props.count !== void 0 ? (openBlock(), createElementBlock("span", _hoisted_5$x, toDisplayString(__props.count), 1)) : createCommentVNode("", true)
      ], 42, _hoisted_1$G);
    };
  }
}
