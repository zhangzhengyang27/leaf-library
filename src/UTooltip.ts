/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$A = /* @__PURE__ */ defineComponent(
*/
{
  __name: "UTooltip",
  props: {
    content: {},
    position: { default: "top" },
    disabled: { type: Boolean, default: false }
  },
  setup(__props) {
    const props = __props;
    const wrapCls = computed(() => `u-tip-${props.position}`);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("span", {
        class: normalizeClass(["u-tip inline-flex", wrapCls.value])
      }, [
        renderSlot(_ctx.$slots, "default", {}, void 0, true),
        !__props.disabled ? (openBlock(), createElementBlock("span", _hoisted_1$A, toDisplayString(__props.content), 1)) : createCommentVNode("", true)
      ], 2);
    };
  }
}
