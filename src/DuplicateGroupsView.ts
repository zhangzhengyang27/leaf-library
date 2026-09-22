/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$a = /* @__PURE__ */ defineComponent(
*/
{
  __name: "DuplicateGroupsView",
  props: {
    groups: {},
    loading: { type: Boolean },
    threshold: {},
    scanLabel: {}
  },
  emits: ["remove-others", "preview-photo", "open-scan-settings"],
  setup(__props) {
    const handleImageError = (event) => {
      const img = event.target;
      img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3C/svg%3E';
    };
    const formatSize = (bytes) => {
      if (!bytes) return "";
      const k2 = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i2 = Math.floor(Math.log(bytes) / Math.log(k2));
      return Math.round(bytes / Math.pow(k2, i2) * 100) / 100 + " " + sizes[i2];
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$a, [
        __props.scanLabel ? (openBlock(), createElementBlock("div", _hoisted_2$a, [
          createBaseVNode("span", _hoisted_3$a, "扫描范围：" + toDisplayString(__props.scanLabel), 1),
          createBaseVNode("button", {
            class: "text-brand-600 underline-offset-2 hover:underline",
            onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("open-scan-settings"))
          }, " 更改… ")
        ])) : createCommentVNode("", true),
        __props.loading ? (openBlock(), createElementBlock("div", _hoisted_4$8, [..._cache[1] || (_cache[1] = [
          createBaseVNode("div", { class: "text-gray-500" }, "正在扫描相似图片...", -1)
        ])])) : __props.groups.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_5$8, [
          _cache[2] || (_cache[2] = createBaseVNode("div", { class: "text-6xl mb-4" }, "✨", -1)),
          _cache[3] || (_cache[3] = createBaseVNode("div", { class: "text-xl mb-2" }, "没有发现相似/重复图片", -1)),
          createBaseVNode("div", _hoisted_6$8, "感知哈希距离 ≤ " + toDisplayString(__props.threshold) + " 的图片会被归为一组", 1)
        ])) : (openBlock(), createElementBlock("div", _hoisted_7$8, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(__props.groups, (group, gi2) => {
            return openBlock(), createElementBlock("div", {
              key: gi2,
              class: "rounded-xl border border-gray-200 bg-white overflow-hidden"
            }, [
              createBaseVNode("div", _hoisted_8$6, [
                createBaseVNode("span", _hoisted_9$6, " 第 " + toDisplayString(gi2 + 1) + " 组 · " + toDisplayString(group.photos.length) + " 张相似 ", 1),
                _cache[4] || (_cache[4] = createBaseVNode("span", { class: "text-xs text-gray-400" }, "推荐保留分辨率/大小最大的一张", -1)),
                _cache[5] || (_cache[5] = createBaseVNode("div", { class: "flex-1" }, null, -1)),
                createBaseVNode("button", {
                  class: "px-3 py-1.5 rounded-md bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors",
                  onClick: ($event) => _ctx.$emit("remove-others", group)
                }, " 移除其余 " + toDisplayString(group.photos.length - 1) + " 张 ", 9, _hoisted_10$6)
              ]),
              createBaseVNode("div", _hoisted_11$2, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(group.photos, (photo) => {
                  return openBlock(), createElementBlock("div", {
                    key: photo.id,
                    class: "relative shrink-0 w-36"
                  }, [
                    createBaseVNode("div", {
                      class: "aspect-square rounded-lg overflow-hidden bg-gray-200 cursor-pointer",
                      onClick: ($event) => _ctx.$emit("preview-photo", photo)
                    }, [
                      createBaseVNode("img", {
                        src: `thumb://256/${photo.id}`,
                        alt: photo.fileName,
                        class: "w-full h-full object-cover",
                        loading: "lazy",
                        onError: handleImageError
                      }, null, 40, _hoisted_13$2)
                    ], 8, _hoisted_12$2),
                    photo.id === group.keepId ? (openBlock(), createElementBlock("div", _hoisted_14$1, " 保留 ")) : createCommentVNode("", true),
                    createBaseVNode("p", {
                      class: "mt-1 text-xs text-gray-600 truncate",
                      title: photo.fileName
                    }, toDisplayString(photo.fileName), 9, _hoisted_15$1),
                    createBaseVNode("p", _hoisted_16$1, toDisplayString(formatSize(photo.fileSize)), 1)
                  ]);
                }), 128))
              ])
            ]);
          }), 128))
        ]))
      ]);
    };
  }
}
