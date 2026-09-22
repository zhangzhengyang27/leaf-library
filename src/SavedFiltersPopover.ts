/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$J = /* @__PURE__ */ defineComponent(
*/
{
  __name: "SavedFiltersPopover",
  props: {
    currentRules: {}
  },
  emits: ["apply"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const open = ref(false);
    const rootEl = ref(null);
    const list2 = ref([]);
    const nameInput = ref("");
    const error2 = ref("");
    function toggleOpen() {
      open.value = !open.value;
      if (open.value) {
        list2.value = loadSavedFilters();
        error2.value = "";
        outsideTimer = window.setTimeout(() => {
          outsideTimer = void 0;
          document.addEventListener("mousedown", onOutside, true);
          window.addEventListener("keydown", onEsc, true);
        }, 0);
      }
    }
    let outsideTimer;
    function onOutside(e64) {
      if (rootEl.value && !rootEl.value.contains(e64.target)) close();
    }
    function onEsc(e64) {
      if (e64.key === "Escape") {
        e64.stopPropagation();
        close();
      }
    }
    function close() {
      open.value = false;
      if (outsideTimer !== void 0) {
        window.clearTimeout(outsideTimer);
        outsideTimer = void 0;
      }
      document.removeEventListener("mousedown", onOutside, true);
      window.removeEventListener("keydown", onEsc, true);
    }
    function saveCurrent() {
      const res = addSavedFilter(nameInput.value, props.currentRules);
      error2.value = res.error ?? "";
      if (!res.error) {
        list2.value = res.list;
        nameInput.value = "";
      }
    }
    function applyFilter(f2) {
      emit("apply", f2.rules);
      close();
    }
    function drop(id3) {
      list2.value = removeSavedFilter(id3);
    }
    onBeforeUnmount(close);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "rootEl",
        ref: rootEl,
        class: "relative"
      }, [
        createBaseVNode("button", {
          type: "button",
          class: normalizeClass(["flex size-6 items-center justify-center rounded text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg-primary", open.value ? "bg-surface-hover text-fg-primary" : ""]),
          title: "筛选预设",
          "aria-label": "筛选预设",
          onClick: toggleOpen
        }, [
          createVNode(_sfc_main$L, {
            icon: "context-menu/ic-saved-filter-create",
            size: 14
          })
        ], 2),
        open.value ? (openBlock(), createElementBlock("div", _hoisted_1$J, [
          createBaseVNode("div", _hoisted_2$I, [
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => nameInput.value = $event),
              type: "text",
              placeholder: "把当前筛选存为预设…",
              class: "min-w-0 flex-1 rounded border border-line-default bg-surface-1 px-2 py-1 text-xs text-fg-primary focus:border-brand-500 focus:outline-none",
              onKeydown: withKeys(withModifiers(saveCurrent, ["prevent"]), ["enter"])
            }, null, 40, _hoisted_3$C), [
              [vModelText, nameInput.value]
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "shrink-0 rounded bg-brand-500 px-2 py-1 text-xs text-white disabled:opacity-40",
              disabled: !nameInput.value.trim(),
              onClick: saveCurrent
            }, " 保存 ", 8, _hoisted_4$z)
          ]),
          error2.value ? (openBlock(), createElementBlock("p", _hoisted_5$z, toDisplayString(error2.value), 1)) : createCommentVNode("", true),
          list2.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_6$x, " 还没有预设。设好筛选后在上面起个名字保存。 ")) : (openBlock(), createElementBlock("ul", _hoisted_7$u, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(list2.value, (f2) => {
              return openBlock(), createElementBlock("li", {
                key: f2.id,
                class: "group flex items-start gap-1 rounded px-1 py-1 hover:bg-surface-hover"
              }, [
                createBaseVNode("button", {
                  type: "button",
                  class: "min-w-0 flex-1 text-left",
                  title: `应用：${f2.name}`,
                  onClick: ($event) => applyFilter(f2)
                }, [
                  createBaseVNode("span", _hoisted_9$p, toDisplayString(f2.name), 1),
                  createBaseVNode("span", _hoisted_10$p, toDisplayString(unref(summarizeFilter)(f2.rules)), 1)
                ], 8, _hoisted_8$s),
                createBaseVNode("button", {
                  type: "button",
                  class: "mt-0.5 hidden size-5 shrink-0 items-center justify-center rounded text-fg-muted hover:text-danger-500 group-hover:flex",
                  title: "删除预设",
                  onClick: ($event) => drop(f2.id)
                }, " × ", 8, _hoisted_11$j)
              ]);
            }), 128))
          ]))
        ])) : createCommentVNode("", true)
      ], 512);
    };
  }
}
