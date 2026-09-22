/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$4 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "ConvertModal",
  props: {
    ids: {}
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const FORMATS = ["webp", "png", "jpg", "avif"];
    const FORMAT_LABEL = { webp: "WebP", png: "PNG", jpg: "JPG", avif: "AVIF" };
    const actions = usePhotoActions();
    const format2 = ref("webp");
    const quality = ref(82);
    const maxWidth = ref(null);
    const converting = ref(false);
    async function handleConvert() {
      converting.value = true;
      try {
        await actions.convertTo(props.ids, format2.value, {
          quality: quality.value,
          maxWidth: maxWidth.value && maxWidth.value > 0 ? maxWidth.value : void 0
        });
        emit("close");
      } finally {
        converting.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": true,
        size: "sm",
        "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [
          createBaseVNode("span", _hoisted_1$4, [
            createVNode(_sfc_main$L, { icon: "context-menu/ic-export" }),
            createTextVNode(" 转换为" + toDisplayString(FORMAT_LABEL[format2.value]) + "（" + toDisplayString(__props.ids.length) + " 项） ", 1)
          ])
        ]),
        footer: withCtx(() => [
          createVNode(_sfc_main$N, {
            variant: "ghost",
            onClick: _cache[2] || (_cache[2] = ($event) => _ctx.$emit("close"))
          }, {
            default: withCtx(() => [..._cache[8] || (_cache[8] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_sfc_main$N, {
            variant: "primary",
            loading: converting.value,
            onClick: handleConvert
          }, {
            default: withCtx(() => [
              createTextVNode(" 转换 " + toDisplayString(__props.ids.length) + " 项 ", 1)
            ]),
            _: 1
          }, 8, ["loading"])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_2$4, [
            createBaseVNode("div", null, [
              _cache[4] || (_cache[4] = createBaseVNode("p", { class: "mb-1.5 text-xs text-fg-muted" }, "目标格式", -1)),
              createBaseVNode("div", _hoisted_3$4, [
                (openBlock(), createElementBlock(Fragment, null, renderList(FORMATS, (f2) => {
                  return createBaseVNode("button", {
                    key: f2,
                    type: "button",
                    class: normalizeClass([
                      "rounded-md border px-3 py-1 text-xs transition-colors",
                      format2.value === f2 ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400"
                    ]),
                    onClick: ($event) => format2.value = f2
                  }, toDisplayString(FORMAT_LABEL[f2]), 11, _hoisted_4$3);
                }), 64))
              ])
            ]),
            format2.value !== "png" ? (openBlock(), createElementBlock("div", _hoisted_5$3, [
              createBaseVNode("div", _hoisted_6$3, [
                _cache[5] || (_cache[5] = createBaseVNode("p", { class: "text-xs text-fg-muted" }, "质量", -1)),
                createBaseVNode("span", _hoisted_7$3, toDisplayString(quality.value), 1)
              ]),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => quality.value = $event),
                type: "range",
                min: "1",
                max: "100",
                class: "w-full accent-brand-500"
              }, null, 512), [
                [
                  vModelText,
                  quality.value,
                  void 0,
                  { number: true }
                ]
              ])
            ])) : createCommentVNode("", true),
            createBaseVNode("div", null, [
              _cache[6] || (_cache[6] = createBaseVNode("label", { class: "mb-1.5 block text-xs text-fg-muted" }, "限制最大宽度（px，留空 = 保持原尺寸）", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => maxWidth.value = $event),
                type: "number",
                min: "0",
                placeholder: "不限制",
                class: "h-8 w-40 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
              }, null, 512), [
                [
                  vModelText,
                  maxWidth.value,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            _cache[7] || (_cache[7] = createBaseVNode("p", { class: "text-xs text-fg-muted" }, "产物作为新素材入库（来源「转换」），原文件保持不动。", -1))
          ])
        ]),
        _: 1
      });
    };
  }
}
