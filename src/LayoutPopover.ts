/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$z = /* @__PURE__ */ defineComponent(
*/
{
  __name: "LayoutPopover",
  props: {
    disabled: { type: Boolean }
  },
  setup(__props) {
    const props = __props;
    const tabs = useLibraryTabs();
    const open = ref(false);
    const rootEl = ref(null);
    let outsideTimer;
    function toggle(e64) {
      if (props.disabled) return;
      open.value = !open.value;
      if (open.value) {
        outsideTimer = window.setTimeout(() => {
          outsideTimer = void 0;
          document.addEventListener("mousedown", onOutside, true);
        }, 0);
      }
    }
    function onOutside(e64) {
      if (rootEl.value && !rootEl.value.contains(e64.target)) close();
    }
    function close() {
      open.value = false;
      if (outsideTimer !== void 0) {
        window.clearTimeout(outsideTimer);
        outsideTimer = void 0;
      }
      document.removeEventListener("mousedown", onOutside, true);
    }
    onBeforeUnmount(close);
    const LAYOUTS = [
      { key: "waterfall", label: "瀑布流", icon: "ic-layout-pinterest" },
      { key: "auto", label: "自适应", icon: "ic-layout-justified" },
      { key: "grid", label: "网格", icon: "ic-layout-grid" },
      { key: "list", label: "列表", icon: "ic-layout-list" }
    ];
    function setLayout(key) {
      tabs.active.layout = key;
      tabs.persist();
    }
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
    const sortValue = computed({
      get: () => tabs.active.shuffle ? RANDOM : tabs.active.sortBy,
      set: (v2) => {
        if (v2 === RANDOM) {
          tabs.active.shuffle = true;
        } else {
          tabs.active.shuffle = false;
          tabs.active.sortBy = v2;
        }
        tabs.persist();
      }
    });
    const d2 = computed(() => tabs.active.display);
    const { panelVisible, togglePanel } = useLibraryUI();
    const SWITCHES = [
      { key: "showName", label: "显示名称" },
      { key: "_summary", label: "显示简介" },
      { key: "showExtension", label: "显示扩展名" },
      { key: "includeSubfolders", label: "显示子文件夹内容" },
      { key: "_showSidebar", label: "显示侧栏" },
      { key: "showInspector", label: "显示检查器" },
      { key: "autoPlayGif", label: "GIF/WebP 自动播放" }
    ];
    function flagOf(key) {
      if (key === "_showSidebar") return panelVisible.value;
      return Boolean(d2.value[key]);
    }
    function toggleSwitch(key, v2) {
      if (key === "_summary") {
        d2.value.showSummary = v2 ? "dimensions" : "none";
      } else if (key === "_showSidebar") {
        if (panelVisible.value !== v2) togglePanel();
      } else {
        d2.value[key] = v2;
      }
      tabs.persist();
    }
    const SUMMARY_OPTIONS = [
      { key: "dimensions", label: "尺寸" },
      { key: "size", label: "大小" },
      { key: "added", label: "添加日期" },
      { key: "modified", label: "修改日期" },
      { key: "created", label: "创建日期" },
      { key: "none", label: "关闭" }
    ];
    const summaryValue = computed({
      get: () => d2.value.showSummary,
      set: (v2) => {
        d2.value.showSummary = v2;
        tabs.persist();
      }
    });
    function setSortAsc(v2) {
      tabs.active.sortAsc = v2;
      tabs.persist();
    }
    const sortDirBtn = (active) => `flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors duration-fast ${active && !tabs.active.shuffle ? "bg-surface-active text-fg-primary" : "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary"}`;
    function refreshView() {
      window.dispatchEvent(new CustomEvent("leaf:refresh-photos"));
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "rootEl",
        ref: rootEl,
        class: "relative"
      }, [
        renderSlot(_ctx.$slots, "trigger", {
          toggle,
          open: open.value
        }),
        open.value ? (openBlock(), createElementBlock("div", _hoisted_1$z, [
          _cache[5] || (_cache[5] = createBaseVNode("div", { class: "mb-1 text-xs text-fg-muted" }, "布局方式", -1)),
          createBaseVNode("div", _hoisted_2$z, [
            createBaseVNode("select", {
              value: unref(tabs).active.layout,
              class: "h-8 w-full appearance-none rounded-md border border-line-subtle bg-surface-1 pl-7 pr-6 text-xs text-fg-primary focus-visible:border-brand-500 focus-visible:outline-none",
              "aria-label": "布局方式",
              onChange: _cache[0] || (_cache[0] = ($event) => setLayout($event.target.value))
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(LAYOUTS, (l2) => {
                return createBaseVNode("option", {
                  key: l2.key,
                  value: l2.key
                }, toDisplayString(l2.label), 9, _hoisted_4$s);
              }), 64))
            ], 40, _hoisted_3$v),
            createVNode(_sfc_main$L, {
              icon: LAYOUTS.find((l2) => l2.key === unref(tabs).active.layout)?.icon ?? "ic-layout-grid",
              class: "pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-secondary"
            }, null, 8, ["icon"])
          ]),
          _cache[6] || (_cache[6] = createBaseVNode("div", { class: "mb-1 text-xs text-fg-muted" }, "排列方式", -1)),
          createBaseVNode("div", _hoisted_5$s, [
            withDirectives(createBaseVNode("select", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => sortValue.value = $event),
              class: "h-8 min-w-0 flex-1 rounded-md border border-line-subtle bg-surface-1 px-2 text-xs text-fg-primary focus-visible:border-brand-500 focus-visible:outline-none",
              "aria-label": "排列方式"
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(SORTS, (s2) => {
                return createBaseVNode("option", {
                  key: s2.key,
                  value: s2.key
                }, toDisplayString(s2.label), 9, _hoisted_6$s);
              }), 64)),
              createBaseVNode("option", { value: RANDOM }, "随机模式")
            ], 512), [
              [vModelSelect, sortValue.value]
            ]),
            createBaseVNode("button", {
              type: "button",
              class: normalizeClass(sortDirBtn(unref(tabs).active.sortAsc)),
              "aria-pressed": unref(tabs).active.sortAsc,
              title: "升序",
              onClick: _cache[2] || (_cache[2] = ($event) => setSortAsc(true))
            }, [
              createVNode(_sfc_main$L, { icon: "context-menu/ic-order-by-increase" })
            ], 10, _hoisted_7$p),
            createBaseVNode("button", {
              type: "button",
              class: normalizeClass(sortDirBtn(!unref(tabs).active.sortAsc)),
              "aria-pressed": !unref(tabs).active.sortAsc,
              title: "降序",
              onClick: _cache[3] || (_cache[3] = ($event) => setSortAsc(false))
            }, [
              createVNode(_sfc_main$L, { icon: "context-menu/ic-order-by-decrease" })
            ], 10, _hoisted_8$n)
          ]),
          createBaseVNode("div", _hoisted_9$k, [
            (openBlock(), createElementBlock(Fragment, null, renderList(SWITCHES, (s2) => {
              return createBaseVNode("div", {
                key: s2.key,
                class: "flex items-center justify-between py-1.5 text-xs text-fg-primary"
              }, [
                createBaseVNode("span", null, toDisplayString(s2.label), 1),
                createBaseVNode("div", _hoisted_10$k, [
                  s2.key === "_summary" ? withDirectives((openBlock(), createElementBlock("select", {
                    key: 0,
                    "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => summaryValue.value = $event),
                    disabled: summaryValue.value === "none",
                    class: "h-6 rounded-sm border border-line-subtle bg-surface-1 px-1 text-[11px] text-fg-secondary focus-visible:border-brand-500 focus-visible:outline-none disabled:opacity-40",
                    "aria-label": "简介内容"
                  }, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(SUMMARY_OPTIONS, (o2) => {
                      return createBaseVNode("option", {
                        key: o2.key,
                        value: o2.key
                      }, toDisplayString(o2.label), 9, _hoisted_12$g);
                    }), 64))
                  ], 8, _hoisted_11$g)), [
                    [vModelSelect, summaryValue.value]
                  ]) : createCommentVNode("", true),
                  createVNode(_sfc_main$M, {
                    size: "sm",
                    "model-value": flagOf(s2.key),
                    "aria-label": s2.label,
                    "onUpdate:modelValue": (v2) => toggleSwitch(s2.key, v2)
                  }, null, 8, ["model-value", "aria-label", "onUpdate:modelValue"])
                ])
              ]);
            }), 64))
          ]),
          createBaseVNode("button", {
            type: "button",
            class: "mt-2 w-full rounded-md border border-line-subtle bg-surface-hover py-1.5 text-xs text-fg-primary transition-colors hover:bg-surface-active",
            onClick: refreshView
          }, " 刷新 ")
        ])) : createCommentVNode("", true)
      ], 512);
    };
  }
}
