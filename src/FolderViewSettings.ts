/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$7 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "FolderViewSettings",
  props: {
    modelValue: {}
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const LAYOUTS = [
      { key: "waterfall", label: "瀑布流" },
      { key: "auto", label: "自适应" },
      { key: "grid", label: "网格" },
      { key: "list", label: "列表" },
      { key: "freeform", label: "自由网格" }
    ];
    const SORTS = [
      { key: "imported", label: "添加日期" },
      { key: "modified", label: "修改日期" },
      { key: "created", label: "创建日期" },
      { key: "name", label: "标题" },
      { key: "extension", label: "扩展名" },
      { key: "size", label: "文件大小" },
      { key: "dimensions", label: "尺寸" },
      { key: "rating", label: "评分" },
      { key: "duration", label: "时长" }
    ];
    const DISPLAY_KEYS = [
      { key: "showName", label: "名称" },
      { key: "showExtension", label: "扩展名" },
      { key: "includeSubfolders", label: "子文件夹内容" },
      { key: "showHoverBar", label: "横栏" },
      { key: "showInspector", label: "检查器" }
    ];
    const TRI_STATES = [
      { value: 0, label: "全局" },
      { value: 1, label: "开" },
      { value: 2, label: "关" }
    ];
    const v2 = computed(() => props.modelValue);
    function set(patch) {
      emit("update:modelValue", { ...v2.value, ...patch });
    }
    function setDisplayKey(key, state2) {
      const display = { ...v2.value.display, [key]: state2 };
      emit("update:modelValue", { ...v2.value, display });
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$7, [
        createBaseVNode("div", _hoisted_2$7, [
          _cache[3] || (_cache[3] = createBaseVNode("span", { class: "w-16 shrink-0 text-xs text-fg-muted" }, "布局方式", -1)),
          createBaseVNode("select", {
            value: v2.value.layout,
            class: normalizeClass(selCls),
            onChange: _cache[0] || (_cache[0] = ($event) => set({ layout: $event.target.value }))
          }, [
            _cache[2] || (_cache[2] = createBaseVNode("option", { value: "global" }, "使用全局设置", -1)),
            (openBlock(), createElementBlock(Fragment, null, renderList(LAYOUTS, (l2) => {
              return createBaseVNode("option", {
                key: l2.key,
                value: l2.key
              }, toDisplayString(l2.label), 9, _hoisted_4$6);
            }), 64))
          ], 40, _hoisted_3$7)
        ]),
        createBaseVNode("div", _hoisted_5$6, [
          _cache[5] || (_cache[5] = createBaseVNode("span", { class: "w-16 shrink-0 text-xs text-fg-muted" }, "排列方式", -1)),
          createBaseVNode("select", {
            value: v2.value.sort,
            class: normalizeClass(selCls),
            onChange: _cache[1] || (_cache[1] = ($event) => set({ sort: $event.target.value }))
          }, [
            _cache[4] || (_cache[4] = createBaseVNode("option", { value: "global" }, "使用全局设置", -1)),
            (openBlock(), createElementBlock(Fragment, null, renderList(SORTS, (s2) => {
              return createBaseVNode("option", {
                key: s2.key,
                value: s2.key
              }, toDisplayString(s2.label), 9, _hoisted_7$6);
            }), 64))
          ], 40, _hoisted_6$6)
        ]),
        createBaseVNode("div", _hoisted_8$4, [
          (openBlock(), createElementBlock(Fragment, null, renderList(DISPLAY_KEYS, (d2) => {
            return createBaseVNode("div", {
              key: d2.key,
              class: "flex items-center justify-between py-1 text-xs text-fg-primary"
            }, [
              createBaseVNode("span", null, toDisplayString(d2.label), 1),
              createBaseVNode("div", _hoisted_9$4, [
                (openBlock(), createElementBlock(Fragment, null, renderList(TRI_STATES, (st2) => {
                  return createBaseVNode("button", {
                    key: st2.value,
                    type: "button",
                    class: normalizeClass([
                      "px-2 py-0.5 text-[11px] transition-colors",
                      (v2.value.display[d2.key] ?? 0) === st2.value ? "bg-brand-500/15 text-brand-600 dark:text-brand-400" : "text-fg-muted hover:bg-surface-hover"
                    ]),
                    onClick: ($event) => setDisplayKey(d2.key, st2.value)
                  }, toDisplayString(st2.label), 11, _hoisted_10$4);
                }), 64))
              ])
            ]);
          }), 64))
        ])
      ]);
    };
  }
}
