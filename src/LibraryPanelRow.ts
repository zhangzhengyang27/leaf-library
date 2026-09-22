/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$t = /* @__PURE__ */ defineComponent(
*/
{
  __name: "LibraryPanelRow",
  props: {
    item: {},
    active: { type: Boolean },
    indent: { type: Boolean },
    count: {},
    dropTarget: { type: Boolean },
    dragOver: { type: Boolean },
    coverUrl: {},
    expandable: { type: Boolean },
    expanded: { type: Boolean },
    depth: {},
    editing: { type: Boolean }
  },
  emits: ["open", "open-aux", "contextmenu", "toggle-expand", "drag-over", "drag-leave", "drop", "edit-commit", "edit-cancel"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const draft = ref("");
    const editDone = ref(false);
    watch(
      () => props.editing,
      (on2) => {
        if (on2) {
          editDone.value = false;
          draft.value = props.item.title;
        }
      },
      { immediate: true }
    );
    function finish(kind) {
      if (editDone.value) return;
      editDone.value = true;
      if (kind === "commit") emit("edit-commit", draft.value);
      else emit("edit-cancel");
    }
    function onRowDragLeave(e64) {
      if (!props.dropTarget) return;
      const row = e64.currentTarget;
      const next = e64.relatedTarget;
      if (row && next && row.contains(next)) return;
      emit("drag-leave", e64);
    }
    const vEditFocus = {
      mounted: (el2) => {
        el2.focus();
        el2.select();
      }
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["relative mx-3 mb-px", [__props.indent ? "pl-5" : ""]])
      }, [
        (__props.depth ?? 0) > 0 ? (openBlock(), createElementBlock("span", {
          key: 0,
          class: "pointer-events-none absolute inset-y-1 border-l border-line-subtle",
          style: normalizeStyle({ left: `${Math.max((__props.depth ?? 0) * 16 - 4, 0)}px` }),
          "aria-hidden": "true"
        }, null, 4)) : createCommentVNode("", true),
        __props.editing ? (openBlock(), createElementBlock("div", _hoisted_1$t, [
          __props.coverUrl ? (openBlock(), createElementBlock("img", {
            key: 0,
            src: __props.coverUrl,
            class: "size-5 shrink-0 rounded-sm object-cover",
            alt: ""
          }, null, 8, _hoisted_2$t)) : __props.item.emoji ? (openBlock(), createElementBlock("span", _hoisted_3$p, toDisplayString(__props.item.emoji), 1)) : __props.item.icon ? (openBlock(), createBlock(_sfc_main$L, {
            key: 2,
            icon: __props.item.icon,
            color: __props.item.color && __props.item.tintIcon ? __props.item.color : void 0,
            class: "shrink-0"
          }, null, 8, ["icon", "color"])) : createCommentVNode("", true),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => draft.value = $event),
            type: "text",
            class: "h-5 min-w-0 flex-1 rounded-[3px] border border-[#3478f6] bg-white px-1.5 text-[13px] leading-none text-[#111] caret-[#3478f6] focus:outline-none",
            "data-rename-input": "",
            "aria-label": "文件夹名称",
            onClick: _cache[1] || (_cache[1] = withModifiers(() => {
            }, ["stop"])),
            onContextmenu: _cache[2] || (_cache[2] = withModifiers(() => {
            }, ["stop"])),
            onKeyup: [
              _cache[3] || (_cache[3] = withKeys(($event) => finish("commit"), ["enter"])),
              _cache[4] || (_cache[4] = withKeys(($event) => finish("cancel"), ["esc"]))
            ],
            onBlur: _cache[5] || (_cache[5] = ($event) => finish("commit")),
            onDragover: _cache[6] || (_cache[6] = withModifiers(() => {
            }, ["stop"])),
            onDrop: _cache[7] || (_cache[7] = withModifiers(() => {
            }, ["stop"]))
          }, null, 544), [
            [vModelText, draft.value],
            [vEditFocus]
          ])
        ])) : (openBlock(), createElementBlock("button", {
          key: 2,
          type: "button",
          class: normalizeClass(["group/row relative flex h-[26px] w-full items-center gap-2 rounded-[6px] pl-1 pr-1.5 text-left transition-all duration-fast outline-none", [
            __props.active ? "bg-surface-active text-fg-primary font-medium" : "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary",
            __props.dragOver ? "ring-2 ring-brand-500" : ""
          ]]),
          "data-drop-target": __props.dropTarget,
          onClick: _cache[9] || (_cache[9] = ($event) => emit("open", $event)),
          onAuxclick: _cache[10] || (_cache[10] = ($event) => emit("open-aux", $event)),
          onContextmenu: _cache[11] || (_cache[11] = withModifiers(($event) => emit("contextmenu", $event), ["prevent"])),
          onDragover: _cache[12] || (_cache[12] = ($event) => __props.dropTarget && emit("drag-over", $event)),
          onDragleave: onRowDragLeave,
          onDrop: _cache[13] || (_cache[13] = ($event) => __props.dropTarget && emit("drop", $event))
        }, [
          __props.expandable ? (openBlock(), createElementBlock("span", {
            key: 0,
            role: "button",
            "aria-label": __props.expanded ? "折叠" : "展开",
            class: "absolute -left-[15px] flex size-4 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary",
            onClick: _cache[8] || (_cache[8] = withModifiers(($event) => emit("toggle-expand", $event), ["stop", "prevent"]))
          }, [
            createVNode(_sfc_main$L, {
              icon: "ic-arrow-right",
              size: 12,
              class: normalizeClass(__props.expanded ? "rotate-90" : "")
            }, null, 8, ["class"])
          ], 8, _hoisted_5$m)) : createCommentVNode("", true),
          __props.item.color && !__props.item.tintIcon ? (openBlock(), createElementBlock("span", {
            key: 1,
            class: "size-2.5 shrink-0 rounded-full border border-black/10",
            style: normalizeStyle({ backgroundColor: __props.item.color })
          }, null, 4)) : createCommentVNode("", true),
          __props.coverUrl ? (openBlock(), createElementBlock("img", {
            key: 2,
            src: __props.coverUrl,
            class: "size-5 shrink-0 rounded-sm object-cover",
            alt: ""
          }, null, 8, _hoisted_6$m)) : __props.item.emoji ? (openBlock(), createElementBlock("span", _hoisted_7$k, toDisplayString(__props.item.emoji), 1)) : __props.item.icon && !(__props.item.color && !__props.item.tintIcon) ? (openBlock(), createBlock(_sfc_main$L, {
            key: 4,
            icon: __props.item.icon,
            color: __props.item.color && __props.item.tintIcon ? __props.item.color : void 0,
            class: "shrink-0"
          }, null, 8, ["icon", "color"])) : createCommentVNode("", true),
          createBaseVNode("span", _hoisted_8$i, toDisplayString(__props.item.title), 1),
          (__props.count ?? __props.item.count) !== void 0 && (__props.count ?? __props.item.count) > 0 ? (openBlock(), createElementBlock("span", {
            key: 5,
            class: normalizeClass(["shrink-0 text-[12px] tabular-nums", __props.active ? "text-fg-primary" : "text-fg-muted"])
          }, toDisplayString(__props.count ?? __props.item.count), 3)) : createCommentVNode("", true)
        ], 42, _hoisted_4$m))
      ], 2);
    };
  }
}
