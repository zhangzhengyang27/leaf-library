/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$n = /* @__PURE__ */ defineComponent(
*/
{
  __name: "CardMeta",
  props: {
    selected: { type: Boolean },
    showName: { type: Boolean },
    showSummary: { type: Boolean },
    renaming: { type: Boolean },
    renameValue: {},
    name: {},
    summary: {}
  },
  emits: ["update:renameValue", "rename-commit", "rename-cancel"],
  setup(__props) {
    return (_ctx, _cache) => {
      return __props.showName || __props.showSummary ? (openBlock(), createElementBlock("div", _hoisted_1$n, [
        __props.showName ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: normalizeClass(["line-clamp-2 break-words text-[13px] font-normal leading-[16px]", __props.selected ? "" : "text-fg-primary"])
        }, [
          __props.renaming ? (openBlock(), createElementBlock("input", {
            key: 0,
            value: __props.renameValue,
            "data-rename-input": "",
            type: "text",
            class: "w-full rounded-sm border border-brand-400 bg-surface-1 px-1 text-center text-[12px] leading-[14px] text-fg-primary focus:outline-none focus:border-brand-500",
            "aria-label": "重命名",
            onClick: _cache[0] || (_cache[0] = withModifiers(() => {
            }, ["stop"])),
            onInput: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("update:renameValue", $event.target.value)),
            onKeydown: [
              _cache[2] || (_cache[2] = withKeys(withModifiers(($event) => _ctx.$emit("rename-commit"), ["prevent"]), ["enter"])),
              _cache[3] || (_cache[3] = withKeys(withModifiers(($event) => _ctx.$emit("rename-cancel"), ["prevent"]), ["esc"]))
            ],
            onBlur: _cache[4] || (_cache[4] = ($event) => _ctx.$emit("rename-commit"))
          }, null, 40, _hoisted_2$n)) : (openBlock(), createElementBlock("span", {
            key: 1,
            class: normalizeClass(["rounded-[4px]", __props.selected ? "bg-brand-500 px-1 py-px text-white" : "text-fg-primary"])
          }, toDisplayString(__props.name), 3))
        ], 2)) : createCommentVNode("", true),
        __props.showSummary ? (openBlock(), createElementBlock("div", _hoisted_3$l, toDisplayString(__props.summary), 1)) : createCommentVNode("", true)
      ])) : createCommentVNode("", true);
    };
  }
}
