/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-C_4vKAXg.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$5 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "AppShell",
  setup(__props) {
    useModuleShortcuts();
    useTheme().initTheme();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$5, [
        createBaseVNode("main", _hoisted_2$5, [
          renderSlot(_ctx.$slots, "default")
        ]),
        createVNode(_sfc_main$7),
        createVNode(UToastProvider)
      ]);
    };
  }
}
