/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$8 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "AlbumModal",
  props: {
    photoIdsToAdd: {}
  },
  emits: ["close", "changed"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const toast2 = useToast();
    const albums = ref([]);
    const newName = ref("");
    const selectedCount = props.photoIdsToAdd?.length ?? 0;
    async function reload() {
      try {
        albums.value = await window.api.photos.listAlbums();
      } catch {
        albums.value = [];
      }
    }
    async function handleAddTo(albumId) {
      if (selectedCount === 0) {
        emit("close");
        return;
      }
      try {
        const added = await window.api.photos.addPhotosToAlbum(albumId, props.photoIdsToAdd);
        toast2.success(added > 0 ? `已加入 ${added} 张图片` : "所选图片已在该相册中");
        emit("changed");
        emit("close");
      } catch (error2) {
        toast2.error("加入相册失败", { description: error2.message });
      }
    }
    async function handleCreate() {
      const trimmed = newName.value.trim();
      if (!trimmed) return;
      try {
        const album = await window.api.photos.createAlbum(trimmed);
        if (selectedCount > 0) {
          await window.api.photos.addPhotosToAlbum(album.id, props.photoIdsToAdd);
          toast2.success(`已创建「${trimmed}」并加入 ${selectedCount} 张图片`);
        } else {
          toast2.success("相册已创建");
        }
        emit("changed");
        emit("close");
      } catch (error2) {
        toast2.error("创建失败", { description: error2.message });
      }
    }
    onMounted(reload);
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": true,
        size: "sm",
        "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [
          createBaseVNode("span", _hoisted_1$8, [
            createVNode(_sfc_main$L, { icon: "ic_box" }),
            _cache[3] || (_cache[3] = createTextVNode(" 相册 ", -1))
          ])
        ]),
        footer: withCtx(() => [
          createVNode(_sfc_main$N, {
            variant: "ghost",
            onClick: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("close"))
          }, {
            default: withCtx(() => [..._cache[5] || (_cache[5] = [
              createTextVNode("关闭", -1)
            ])]),
            _: 1
          })
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_2$8, [
            albums.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_3$8, [
              createBaseVNode("p", _hoisted_4$7, toDisplayString(unref(selectedCount) > 0 ? `把选中的 ${unref(selectedCount)} 张图片加入：` : "现有相册："), 1),
              createBaseVNode("div", _hoisted_5$7, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(albums.value, (album) => {
                  return openBlock(), createElementBlock("button", {
                    key: album.id,
                    type: "button",
                    class: "flex w-full items-center gap-2 rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-left text-sm text-fg-primary transition-colors hover:border-brand-400 hover:bg-surface-hover",
                    onClick: ($event) => handleAddTo(album.id)
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "ic_box",
                      size: 14,
                      class: "shrink-0 text-fg-tertiary"
                    }),
                    createBaseVNode("span", _hoisted_7$7, toDisplayString(album.name), 1),
                    createBaseVNode("span", _hoisted_8$5, toDisplayString(album.photoCount) + " 张", 1)
                  ], 8, _hoisted_6$7);
                }), 128))
              ])
            ])) : unref(selectedCount) > 0 ? (openBlock(), createElementBlock("p", _hoisted_9$5, " 还没有相册，新建一个并加入选中的 " + toDisplayString(unref(selectedCount)) + " 张图片： ", 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_10$5, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => newName.value = $event),
                type: "text",
                placeholder: "新建相册...",
                class: "min-w-0 flex-1 h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500",
                onKeyup: withKeys(handleCreate, ["enter"])
              }, null, 544), [
                [vModelText, newName.value]
              ]),
              createVNode(_sfc_main$N, {
                variant: "primary",
                disabled: !newName.value.trim(),
                onClick: handleCreate
              }, {
                default: withCtx(() => [..._cache[4] || (_cache[4] = [
                  createTextVNode("新建", -1)
                ])]),
                _: 1
              }, 8, ["disabled"])
            ])
          ])
        ]),
        _: 1
      });
    };
  }
}
