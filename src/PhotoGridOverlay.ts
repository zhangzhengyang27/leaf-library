/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$o = /* @__PURE__ */ defineComponent(
*/
{
  __name: "PhotoGridOverlay",
  props: {
    photo: {},
    selected: { type: Boolean },
    mode: {},
    showBar: { type: Boolean, default: false }
  },
  emits: ["restore", "preview"],
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        __props.photo.thumbStatus === 0 ? (openBlock(), createElementBlock("div", _hoisted_1$o, " 处理中 ")) : __props.photo.missingAt ? (openBlock(), createElementBlock("div", _hoisted_2$o, " ⚠ 丢失 ")) : createCommentVNode("", true),
        __props.mode === "normal" ? (openBlock(), createElementBlock("button", {
          key: 2,
          type: "button",
          class: "absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity duration-fast group-hover:opacity-100 hover:bg-black/70",
          title: "预览",
          "aria-label": "预览",
          onClick: _cache[0] || (_cache[0] = withModifiers(($event) => _ctx.$emit("preview"), ["stop"]))
        }, [
          createVNode(_sfc_main$L, {
            icon: "ic-toolbar-zoom-in",
            size: 16
          })
        ])) : createCommentVNode("", true),
        __props.mode === "trash" ? (openBlock(), createElementBlock("button", {
          key: 3,
          type: "button",
          class: "absolute bottom-2 right-2 rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-800 opacity-0 transition-opacity duration-fast group-hover:opacity-100 hover:bg-white",
          onClick: _cache[1] || (_cache[1] = withModifiers(($event) => _ctx.$emit("restore"), ["stop"]))
        }, " 恢复 ")) : createCommentVNode("", true)
      ], 64);
    };
  }
}
