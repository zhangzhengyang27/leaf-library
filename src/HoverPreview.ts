/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$p = /* @__PURE__ */ defineComponent(
*/
{
  __name: "HoverPreview",
  props: {
    photo: {},
    natural: { type: Boolean, default: false }
  },
  setup(__props) {
    const props = __props;
    const hovered = ref(false);
    const isGif = (p2) => p2.kind === "image" && /\.gif$/i.test(p2.fileName);
    const gifSrc = (p2) => mediaUrl("image", p2.filePath);
    const audioSrc = (p2) => mediaUrl("video", p2.filePath);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "relative h-full w-full",
        onMouseenter: _cache[0] || (_cache[0] = ($event) => hovered.value = true),
        onMouseleave: _cache[1] || (_cache[1] = ($event) => hovered.value = false)
      }, [
        createVNode(_sfc_main$q, {
          photo: __props.photo,
          natural: props.natural
        }, null, 8, ["photo", "natural"]),
        hovered.value && isGif(__props.photo) ? (openBlock(), createElementBlock("img", {
          key: 0,
          src: gifSrc(__props.photo),
          class: "absolute inset-0 size-full object-cover",
          alt: ""
        }, null, 8, _hoisted_1$p)) : createCommentVNode("", true),
        hovered.value && __props.photo.kind === "audio" ? (openBlock(), createElementBlock("audio", {
          key: 1,
          src: audioSrc(__props.photo),
          autoplay: "",
          loop: "",
          class: "absolute inset-x-0 bottom-0 z-10 w-full"
        }, null, 8, _hoisted_2$p)) : createCommentVNode("", true)
      ], 32);
    };
  }
}
