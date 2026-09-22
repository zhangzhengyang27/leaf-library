/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$c = /* @__PURE__ */ defineComponent(
*/
{
  __name: "BookmarkModal",
  emits: ["close", "saved"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const toast2 = useToast();
    const url = ref("");
    const title = ref("");
    const saving = ref(false);
    const urlInput = ref(null);
    onMounted(() => urlInput.value?.focus());
    const previewType = computed(() => {
      const u2 = url.value.trim().toLowerCase();
      if (!/^https?:\/\//.test(u2)) return "none";
      if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/.test(u2)) return "image";
      if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/.test(u2)) return "video";
      return "page";
    });
    async function handleSave() {
      const target = url.value.trim();
      if (!target) return;
      saving.value = true;
      try {
        await window.api.photos.addBookmark(target, title.value.trim() || void 0);
        toast2.success("书签已收藏", { description: "页面截图与缩略图正在后台生成" });
        emit("saved");
        emit("close");
      } catch (error2) {
        toast2.error("收藏失败", { description: error2.message });
      } finally {
        saving.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": true,
        size: "sm",
        "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [..._cache[4] || (_cache[4] = [
          createBaseVNode("span", { class: "flex items-center gap-2" }, [
            createBaseVNode("span", null, "🔗"),
            createTextVNode(" 收藏网址 ")
          ], -1)
        ])]),
        footer: withCtx(() => [
          createVNode(_sfc_main$N, {
            variant: "ghost",
            onClick: _cache[2] || (_cache[2] = ($event) => _ctx.$emit("close"))
          }, {
            default: withCtx(() => [..._cache[9] || (_cache[9] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_sfc_main$N, {
            variant: "primary",
            disabled: !url.value.trim(),
            loading: saving.value,
            onClick: handleSave
          }, {
            default: withCtx(() => [..._cache[10] || (_cache[10] = [
              createTextVNode(" 收藏 ", -1)
            ])]),
            _: 1
          }, 8, ["disabled", "loading"])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$c, [
            createBaseVNode("div", null, [
              _cache[5] || (_cache[5] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "URL", -1)),
              withDirectives(createBaseVNode("input", {
                ref_key: "urlInput",
                ref: urlInput,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => url.value = $event),
                type: "text",
                placeholder: "https://example.com/article...",
                class: "w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500",
                onKeyup: withKeys(handleSave, ["enter"])
              }, null, 544), [
                [vModelText, url.value]
              ])
            ]),
            createBaseVNode("div", null, [
              _cache[6] || (_cache[6] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "标题（可选，默认抓取网页标题）", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => title.value = $event),
                type: "text",
                placeholder: "留空自动抓取",
                class: "w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500",
                onKeyup: withKeys(handleSave, ["enter"])
              }, null, 544), [
                [vModelText, title.value]
              ])
            ]),
            previewType.value !== "none" ? (openBlock(), createElementBlock("div", _hoisted_2$c, [
              _cache[7] || (_cache[7] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "内嵌预览", -1)),
              createBaseVNode("div", _hoisted_3$b, [
                previewType.value === "image" ? (openBlock(), createElementBlock("img", {
                  key: 0,
                  src: url.value,
                  class: "size-full object-contain",
                  alt: ""
                }, null, 8, _hoisted_4$9)) : previewType.value === "video" ? (openBlock(), createElementBlock("video", {
                  key: 1,
                  src: url.value,
                  controls: "",
                  class: "size-full object-contain"
                }, null, 8, _hoisted_5$9)) : (openBlock(), createElementBlock("iframe", {
                  key: 2,
                  src: url.value,
                  class: "size-full border-0",
                  sandbox: "allow-scripts",
                  referrerpolicy: "no-referrer"
                }, null, 8, _hoisted_6$9))
              ])
            ])) : createCommentVNode("", true),
            _cache[8] || (_cache[8] = createBaseVNode("p", { class: "text-xs text-fg-muted" }, " 收藏时会抓取网页标题并对页面截图存档；之后可在书签类型中筛选查看，预览页可一键打开原链接。 ", -1))
          ])
        ]),
        _: 1
      });
    };
  }
}
