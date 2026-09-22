/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$f = /* @__PURE__ */ defineComponent(
*/
{
  __name: "LibraryInfoPanel",
  props: {
    photos: {}
  },
  setup(__props) {
    const props = __props;
    const tabs = useLibraryTabs();
    const fileCount = computed(() => props.photos.length);
    const totalSize = computed(() => props.photos.reduce((sum, p2) => sum + (p2.fileSize || 0), 0));
    const addDate = computed(() => {
      if (props.photos.length === 0) return "—";
      const dates = props.photos.map((p2) => p2.importedAt || p2.createdAt).filter(Boolean).sort();
      if (dates.length === 0) return "—";
      const d2 = new Date(dates[0]);
      return `${d2.getFullYear()}/${String(d2.getMonth() + 1).padStart(2, "0")}/${String(d2.getDate()).padStart(2, "0")} ${String(d2.getHours()).padStart(2, "0")}:${String(d2.getMinutes()).padStart(2, "0")}`;
    });
    function fmtTotal(bytes) {
      if (bytes <= 0) return "0 KB";
      if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
      if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${bytes.toFixed(0)} bytes`;
    }
    const helpOpen = ref(false);
    const shortcuts = [
      { label: "搜索素材", keys: "⌘F" },
      { label: "快速搜索", keys: "⌘J" },
      { label: "命令面板", keys: "⌘K" },
      { label: "标签筛选", keys: "⌘⇧T" },
      { label: "新增文件夹", keys: "⌘⇧N" },
      { label: "新增智能文件夹", keys: "⌥⇧⌘N" },
      { label: "显示/隐藏筛选行", keys: "⌘⇧F" },
      { label: "显示/隐藏侧栏", keys: "⌘B" },
      { label: "全选", keys: "⌘A" },
      { label: "创建副本", keys: "⌘D" },
      { label: "就地重命名", keys: "F2" },
      { label: "高级模式（检查器信息全展开）", keys: "F8" },
      { label: "预览（空格）", keys: "Space" },
      { label: "丢到回收站", keys: "⌘⌫" }
    ];
    function toggleHelp() {
      helpOpen.value = !helpOpen.value;
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("aside", _hoisted_1$f, [
        createBaseVNode("div", _hoisted_2$f, [
          createBaseVNode("input", {
            value: unref(tabs).active.title,
            type: "text",
            readonly: "",
            class: "h-8 w-full cursor-default rounded-md border border-line-default bg-surface-0 px-3 text-xs text-fg-primary focus:outline-none",
            "aria-label": "视图名称"
          }, null, 8, _hoisted_3$d)
        ]),
        createBaseVNode("div", _hoisted_4$b, [
          _cache[3] || (_cache[3] = createBaseVNode("div", { class: "mb-2 text-xs font-medium text-fg-secondary" }, "基本信息", -1)),
          createBaseVNode("dl", _hoisted_5$b, [
            createBaseVNode("div", _hoisted_6$b, [
              _cache[0] || (_cache[0] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "文件数", -1)),
              createBaseVNode("dd", _hoisted_7$a, toDisplayString(fileCount.value), 1)
            ]),
            createBaseVNode("div", _hoisted_8$8, [
              _cache[1] || (_cache[1] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "占用空间", -1)),
              createBaseVNode("dd", _hoisted_9$8, toDisplayString(fmtTotal(totalSize.value)), 1)
            ]),
            createBaseVNode("div", _hoisted_10$8, [
              _cache[2] || (_cache[2] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "添加日期", -1)),
              createBaseVNode("dd", _hoisted_11$4, toDisplayString(addDate.value), 1)
            ])
          ])
        ]),
        createBaseVNode("button", {
          type: "button",
          class: "absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border border-line-default bg-surface-1 text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary",
          "aria-label": "帮助",
          title: "快捷键速查",
          onClick: toggleHelp
        }, " ? "),
        helpOpen.value ? (openBlock(), createElementBlock("div", _hoisted_12$4, [
          _cache[4] || (_cache[4] = createBaseVNode("p", { class: "px-3 py-1.5 text-[10px] font-medium tracking-wider text-fg-tertiary uppercase" }, " 快捷键速查 ", -1)),
          createBaseVNode("div", _hoisted_13$4, [
            (openBlock(), createElementBlock(Fragment, null, renderList(shortcuts, (sc2) => {
              return createBaseVNode("div", {
                key: sc2.label,
                class: "flex items-center justify-between px-3 py-1 text-xs"
              }, [
                createBaseVNode("span", _hoisted_14$3, toDisplayString(sc2.label), 1),
                createBaseVNode("kbd", _hoisted_15$3, toDisplayString(sc2.keys), 1)
              ]);
            }), 64))
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
}
