/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$6 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "FolderModal",
  props: {
    photoIdsToAdd: {},
    initialParent: {},
    editFolderId: {}
  },
  emits: ["close", "changed"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const toast2 = useToast();
    const folders = ref([]);
    const newName = ref("");
    const parentId = ref(props.initialParent ?? null);
    const viewOverrides = ref({ layout: "global", sort: "global", display: {} });
    const editingFolder = ref(null);
    function overridesToPayload() {
      const d2 = viewOverrides.value.display;
      const display = {};
      for (const [k2, st2] of Object.entries(d2)) {
        if (st2 === 1) display[k2] = true;
        else if (st2 === 2) display[k2] = false;
      }
      const hasDisplay = Object.keys(display).length > 0;
      return {
        layout: viewOverrides.value.layout === "global" ? null : viewOverrides.value.layout,
        sort: viewOverrides.value.sort === "global" ? null : viewOverrides.value.sort,
        display: hasDisplay ? JSON.stringify(display) : null
      };
    }
    function payloadToOverrides(f2) {
      const display = {};
      if (f2.viewDisplay) {
        try {
          const parsed = JSON.parse(f2.viewDisplay);
          for (const [k2, on2] of Object.entries(parsed)) display[k2] = on2 ? 1 : 2;
        } catch {
        }
      }
      return {
        layout: f2.viewLayout ?? "global",
        sort: f2.viewSort ?? "global",
        display
      };
    }
    const selectedCount = props.photoIdsToAdd?.length ?? 0;
    const folderOptions = computed(() => {
      const byParent = /* @__PURE__ */ new Map();
      for (const f2 of folders.value) {
        const k2 = f2.parentId ?? null;
        if (!byParent.has(k2)) byParent.set(k2, []);
        byParent.get(k2).push(f2);
      }
      const out = [
        { id: null, name: "无（顶级）", depth: 0 }
      ];
      const walk = (pid, depth) => {
        for (const f2 of byParent.get(pid) ?? []) {
          out.push({ id: f2.id, name: f2.name, depth });
          walk(f2.id, depth + 1);
        }
      };
      walk(null, 0);
      return out;
    });
    async function reload() {
      try {
        folders.value = await window.api.photos.listPhotoFolders();
      } catch {
        folders.value = [];
      }
      if (props.editFolderId) {
        editingFolder.value = folders.value.find((f2) => f2.id === props.editFolderId) ?? null;
        if (editingFolder.value) {
          newName.value = editingFolder.value.name;
          parentId.value = editingFolder.value.parentId;
          viewOverrides.value = payloadToOverrides(editingFolder.value);
        }
      }
    }
    async function handleAssign(folderId) {
      if (selectedCount === 0) {
        emit("close");
        return;
      }
      try {
        const n2 = await window.api.photos.assignPhotosToFolder(folderId, props.photoIdsToAdd);
        try {
          localStorage.setItem("leaf.last-used-folder", folderId);
        } catch {
        }
        toast2.success(`已归入 ${n2} 项`);
        emit("changed");
        emit("close");
      } catch (error2) {
        toast2.error("归组失败", { description: error2.message });
      }
    }
    async function handleCreate() {
      const trimmed = newName.value.trim();
      if (!trimmed) return;
      if (props.editFolderId) {
        try {
          if (editingFolder.value && trimmed !== editingFolder.value.name) {
            await window.api.photos.renamePhotoFolder(props.editFolderId, trimmed);
          }
          await window.api.photos.setFolderViewSettings(props.editFolderId, overridesToPayload());
          toast2.success("文件夹设置已保存");
          emit("changed");
          emit("close");
        } catch (error2) {
          toast2.error("保存失败", { description: error2.message });
        }
        return;
      }
      try {
        const folder = await window.api.photos.createPhotoFolder(trimmed, parentId.value);
        await window.api.photos.setFolderViewSettings(folder.id, overridesToPayload());
        if (selectedCount > 0) {
          await window.api.photos.assignPhotosToFolder(folder.id, props.photoIdsToAdd);
          try {
            localStorage.setItem("leaf.last-used-folder", folder.id);
          } catch {
          }
          toast2.success(`已创建「${trimmed}」并归入 ${selectedCount} 项`);
        } else {
          toast2.success("文件夹已创建");
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
        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [
          createBaseVNode("span", _hoisted_1$6, [
            createVNode(_sfc_main$L, { icon: "ic_folder-close" }),
            _cache[5] || (_cache[5] = createTextVNode(" 文件夹 ", -1))
          ])
        ]),
        footer: withCtx(() => [
          createVNode(_sfc_main$N, {
            variant: "ghost",
            onClick: _cache[3] || (_cache[3] = ($event) => _ctx.$emit("close"))
          }, {
            default: withCtx(() => [..._cache[8] || (_cache[8] = [
              createTextVNode("关闭", -1)
            ])]),
            _: 1
          })
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_2$6, [
            folders.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_3$6, [
              createBaseVNode("p", _hoisted_4$5, toDisplayString(unref(selectedCount) > 0 ? `把选中的 ${unref(selectedCount)} 项归入：` : "现有文件夹："), 1),
              createBaseVNode("div", _hoisted_5$5, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(folders.value, (folder) => {
                  return openBlock(), createElementBlock("button", {
                    key: folder.id,
                    type: "button",
                    class: "flex w-full items-center gap-2 rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-left text-sm text-fg-primary transition-colors hover:border-brand-400 hover:bg-surface-hover",
                    onClick: ($event) => handleAssign(folder.id)
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "ic_folder-close",
                      size: 14,
                      class: "shrink-0 text-fg-tertiary"
                    }),
                    createBaseVNode("span", _hoisted_7$5, toDisplayString(folder.name), 1),
                    createBaseVNode("span", _hoisted_8$3, toDisplayString(folder.photoCount), 1)
                  ], 8, _hoisted_6$5);
                }), 128))
              ])
            ])) : (openBlock(), createElementBlock("p", _hoisted_9$3, " 还没有文件夹" + toDisplayString(unref(selectedCount) > 0 ? `，新建一个并归入选中的 ${unref(selectedCount)} 项：` : "。"), 1)),
            createBaseVNode("div", _hoisted_10$3, [
              _cache[6] || (_cache[6] = createBaseVNode("label", { class: "block text-xs text-fg-muted" }, "父级文件夹", -1)),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => parentId.value = $event),
                class: "w-full rounded-md border border-line-default bg-surface-1 h-8 px-3 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(folderOptions.value, (opt) => {
                  return openBlock(), createElementBlock("option", {
                    key: opt.id ?? "none",
                    value: opt.id
                  }, toDisplayString(" ".repeat(opt.depth * 2)) + toDisplayString(opt.name), 9, _hoisted_11$1);
                }), 128))
              ], 512), [
                [vModelSelect, parentId.value]
              ]),
              createBaseVNode("div", _hoisted_12$1, [
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => newName.value = $event),
                  type: "text",
                  placeholder: "新建文件夹...",
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
                  default: withCtx(() => [
                    createTextVNode(toDisplayString(__props.editFolderId ? "保存" : "新建"), 1)
                  ]),
                  _: 1
                }, 8, ["disabled"])
              ])
            ]),
            createBaseVNode("div", _hoisted_13$1, [
              _cache[7] || (_cache[7] = createBaseVNode("p", { class: "mb-2 text-xs font-medium text-fg-secondary" }, "独立视图设置", -1)),
              createVNode(_sfc_main$7, {
                modelValue: viewOverrides.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => viewOverrides.value = $event)
              }, null, 8, ["modelValue"])
            ])
          ])
        ]),
        _: 1
      });
    };
  }
}
