/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$F = /* @__PURE__ */ defineComponent(
*/
{
  __name: "FilterHintBar",
  props: {
    esc: { type: Boolean, default: true }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$F, [
        _cache[1] || (_cache[1] = createBaseVNode("span", null, [
          createTextVNode("选择 "),
          createBaseVNode("b", { class: "font-medium text-fg-secondary" }, "左键")
        ], -1)),
        _cache[2] || (_cache[2] = createBaseVNode("span", null, [
          createTextVNode("排除 "),
          createBaseVNode("b", { class: "font-medium text-fg-secondary" }, "右键")
        ], -1)),
        __props.esc ? (openBlock(), createElementBlock("span", _hoisted_2$E, [..._cache[0] || (_cache[0] = [
          createTextVNode("关闭 ", -1),
          createBaseVNode("b", { class: "font-medium text-fg-secondary" }, "ESC", -1)
        ])])) : createCommentVNode("", true)
      ]);
    };
  }
}
