/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$s = /* @__PURE__ */ defineComponent(
*/
{
  __name: "AutoTagModal",
  props: {
    folder: {},
    dictionaryTags: {}
  },
  emits: ["close", "changed"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const toast2 = useToast();
    const name = ref(props.folder.name);
    const tags = ref([]);
    const query = ref("");
    const inputRef = ref(null);
    void (async () => {
      try {
        tags.value = await window.api.photos.getFolderAutoTags(props.folder.id);
      } catch {
        tags.value = [];
      }
    })();
    const suggestions = computed(() => {
      const q3 = query.value.trim().toLowerCase();
      if (!q3) return [];
      return props.dictionaryTags.filter((t3) => t3.toLowerCase().includes(q3) && !tags.value.includes(t3)).slice(0, 8);
    });
    const canCreate = computed(() => {
      const q3 = query.value.trim();
      if (!q3) return false;
      if (tags.value.includes(q3)) return false;
      return !props.dictionaryTags.some((t3) => t3.toLowerCase() === q3.toLowerCase());
    });
    function addTag(tag) {
      const trimmed = tag.trim();
      if (!trimmed) return;
      if (!tags.value.includes(trimmed)) tags.value.push(trimmed);
      query.value = "";
      inputRef.value?.focus();
    }
    function removeTag(tag) {
      tags.value = tags.value.filter((t3) => t3 !== tag);
    }
    function onBackspace() {
      if (query.value) return;
      tags.value.pop();
    }
    function commitQuery() {
      const q3 = query.value.trim();
      if (!q3) return;
      addTag(q3);
    }
    async function save() {
      const nextName = name.value.trim();
      if (!nextName) {
        toast2.error("文件夹名称不能为空");
        return;
      }
      try {
        if (nextName !== props.folder.name) {
          await window.api.photos.renamePhotoFolder(props.folder.id, nextName);
        }
        await window.api.photos.setFolderAutoTags(props.folder.id, tags.value);
        toast2.success("自动标签已保存", {
          description: tags.value.length > 0 ? "归入该文件夹的素材将自动打上这些标签" : "已清空自动标签"
        });
        emit("changed", nextName);
        emit("close");
      } catch (error2) {
        toast2.error("保存失败", { description: error2.message });
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": true,
        size: "sm",
        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [
          createBaseVNode("span", _hoisted_1$s, [
            createVNode(_sfc_main$L, { icon: "context-menu/ic-folder-auto-tag" }),
            _cache[6] || (_cache[6] = createTextVNode(" 设置自动标签 ", -1))
          ])
        ]),
        footer: withCtx(() => [
          createBaseVNode("div", _hoisted_8$h, [
            createVNode(_sfc_main$N, {
              variant: "ghost",
              onClick: _cache[4] || (_cache[4] = ($event) => _ctx.$emit("close"))
            }, {
              default: withCtx(() => [..._cache[10] || (_cache[10] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_sfc_main$N, {
              variant: "primary",
              onClick: save
            }, {
              default: withCtx(() => [..._cache[11] || (_cache[11] = [
                createTextVNode("保存设置", -1)
              ])]),
              _: 1
            })
          ])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_2$s, [
            createBaseVNode("div", null, [
              _cache[7] || (_cache[7] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "文件夹名称", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => name.value = $event),
                type: "text",
                class: "h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500",
                onKeyup: withKeys(save, ["enter"])
              }, null, 544), [
                [vModelText, name.value]
              ])
            ]),
            createBaseVNode("div", null, [
              _cache[8] || (_cache[8] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "自动添加标签", -1)),
              createBaseVNode("div", {
                class: "relative min-h-[42px] w-full cursor-text rounded-md border border-line-default bg-surface-1 px-2 py-1.5",
                onClick: _cache[3] || (_cache[3] = ($event) => inputRef.value?.focus())
              }, [
                createBaseVNode("div", _hoisted_3$o, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(tags.value, (tag) => {
                    return openBlock(), createElementBlock("span", {
                      key: tag,
                      class: "flex items-center gap-1 rounded-full bg-brand-500/15 py-0.5 pl-2.5 pr-1 text-xs text-fg-primary"
                    }, [
                      createTextVNode(toDisplayString(tag) + " ", 1),
                      createBaseVNode("button", {
                        type: "button",
                        class: "flex size-3.5 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary",
                        "aria-label": `移除标签 ${tag}`,
                        onClick: withModifiers(($event) => removeTag(tag), ["stop"])
                      }, [
                        createVNode(_sfc_main$L, {
                          icon: "ic-modal-close",
                          size: 8
                        })
                      ], 8, _hoisted_4$l)
                    ]);
                  }), 128)),
                  withDirectives(createBaseVNode("input", {
                    ref_key: "inputRef",
                    ref: inputRef,
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => query.value = $event),
                    type: "text",
                    placeholder: "添加标签",
                    class: "h-6 min-w-[120px] flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none",
                    onKeydown: [
                      withKeys(withModifiers(commitQuery, ["prevent"]), ["enter"]),
                      withKeys(onBackspace, ["backspace"])
                    ]
                  }, null, 40, _hoisted_5$l), [
                    [vModelText, query.value]
                  ])
                ]),
                query.value.trim() && suggestions.value.length + (canCreate.value ? 1 : 0) > 0 ? (openBlock(), createElementBlock("div", _hoisted_6$l, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(suggestions.value, (s2) => {
                    return openBlock(), createElementBlock("button", {
                      key: s2,
                      type: "button",
                      class: "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-fg-primary transition-colors hover:bg-surface-hover",
                      onClick: withModifiers(($event) => addTag(s2), ["stop"])
                    }, [
                      createVNode(_sfc_main$L, {
                        icon: "ic_search",
                        size: 11,
                        class: "text-fg-muted"
                      }),
                      createTextVNode(" " + toDisplayString(s2), 1)
                    ], 8, _hoisted_7$j);
                  }), 128)),
                  canCreate.value ? (openBlock(), createElementBlock("button", {
                    key: 0,
                    type: "button",
                    class: "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-brand-500 transition-colors hover:bg-surface-hover",
                    onClick: _cache[2] || (_cache[2] = withModifiers(($event) => addTag(query.value.trim()), ["stop"]))
                  }, ' + 新建 "' + toDisplayString(query.value.trim()) + '" ', 1)) : createCommentVNode("", true)
                ])) : createCommentVNode("", true)
              ]),
              _cache[9] || (_cache[9] = createBaseVNode("p", { class: "mt-1 text-[11px] leading-relaxed text-fg-muted" }, " 归入此文件夹的素材将自动打上这些标签；保存时也会应用到文件夹内现有素材。 ", -1))
            ])
          ])
        ]),
        _: 1
      });
    };
  }
}
