/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$C = /* @__PURE__ */ defineComponent(
*/
{
  __name: "FoldersFilterPanel",
  setup(__props) {
    const tabs = useLibraryTabs();
    const data = usePhotoData();
    const filters = usePhotoFilters();
    const search = ref("");
    const visibleFolders = computed(() => {
      const q3 = search.value.trim().toLowerCase();
      if (!q3) return data.folders.value;
      return data.folders.value.filter((f2) => f2.name.toLowerCase().includes(q3));
    });
    const folderCounts = computed(() => {
      const out = {};
      let none = 0;
      for (const p2 of filters.currentPool.value) {
        if (p2.folderId == null) none++;
        else out[p2.folderId] = (out[p2.folderId] ?? 0) + 1;
      }
      out["none"] = none;
      return out;
    });
    function folderCount(id3) {
      return folderCounts.value[id3] ?? 0;
    }
    const showUntaggedRow = computed(
      () => !search.value.trim() || "未分类".toLowerCase().includes(search.value.trim().toLowerCase())
    );
    function rowState(id3) {
      if (tabs.active.folderFilterIds.includes(id3)) return "include";
      if (tabs.active.folderExcludeIds.includes(id3)) return "exclude";
      return "off";
    }
    function toggleInclude(id3) {
      const inc = tabs.active.folderFilterIds;
      const i2 = inc.indexOf(id3);
      if (i2 >= 0) inc.splice(i2, 1);
      else inc.push(id3);
      const ex2 = tabs.active.folderExcludeIds;
      const j2 = ex2.indexOf(id3);
      if (j2 >= 0) ex2.splice(j2, 1);
      tabs.persist();
    }
    function toggleExclude(id3) {
      const ex2 = tabs.active.folderExcludeIds;
      const i2 = ex2.indexOf(id3);
      if (i2 >= 0) ex2.splice(i2, 1);
      else ex2.push(id3);
      const inc = tabs.active.folderFilterIds;
      const j2 = inc.indexOf(id3);
      if (j2 >= 0) inc.splice(j2, 1);
      tabs.persist();
    }
    function setMatchAll(v2) {
      tabs.active.folderMatchAll = v2;
      tabs.persist();
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$C, [
        createBaseVNode("div", _hoisted_2$B, [
          createVNode(_sfc_main$L, {
            icon: "ic_search",
            size: 14,
            class: "shrink-0 text-fg-muted"
          }),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => search.value = $event),
            type: "text",
            placeholder: "搜索...",
            class: "h-6 min-w-0 flex-1 bg-transparent text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
          }, null, 512), [
            [vModelText, search.value]
          ]),
          _cache[5] || (_cache[5] = createBaseVNode("span", { class: "shrink-0 text-[11px] text-fg-muted" }, "逻辑:", -1)),
          createBaseVNode("button", {
            type: "button",
            class: normalizeClass([
              "flex size-6 items-center justify-center rounded-sm transition-colors",
              !unref(tabs).active.folderMatchAll ? "bg-surface-hover text-fg-primary" : "text-fg-muted hover:text-fg-primary"
            ]),
            title: "位于任一选中文件夹（OR）",
            onClick: _cache[1] || (_cache[1] = ($event) => setMatchAll(false))
          }, [
            createVNode(_sfc_main$L, {
              icon: "ic-logic-any",
              size: 14
            })
          ], 2),
          createBaseVNode("button", {
            type: "button",
            class: normalizeClass([
              "flex size-6 items-center justify-center rounded-sm transition-colors",
              unref(tabs).active.folderMatchAll ? "bg-surface-hover text-fg-primary" : "text-fg-muted hover:text-fg-primary"
            ]),
            title: "位于所有选中文件夹（AND）",
            onClick: _cache[2] || (_cache[2] = ($event) => setMatchAll(true))
          }, [
            createVNode(_sfc_main$L, {
              icon: "ic-logic-all",
              size: 14
            })
          ], 2)
        ]),
        createBaseVNode("div", _hoisted_3$x, [
          showUntaggedRow.value ? (openBlock(), createElementBlock("button", {
            key: 0,
            type: "button",
            class: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover",
            title: rowState("none") === "exclude" ? "右键取消排除" : "左键包含 / 右键排除",
            onClick: _cache[3] || (_cache[3] = ($event) => toggleInclude("none")),
            onContextmenu: _cache[4] || (_cache[4] = withModifiers(($event) => toggleExclude("none"), ["prevent"]))
          }, [
            rowState("none") === "include" ? (openBlock(), createBlock(_sfc_main$L, {
              key: 0,
              icon: "context-menu/ic-context-menu-checkbox",
              size: 14,
              class: "text-brand-500"
            })) : rowState("none") === "exclude" ? (openBlock(), createBlock(_sfc_main$L, {
              key: 1,
              icon: "ic-condition-remove",
              size: 14,
              class: "text-danger"
            })) : (openBlock(), createElementBlock("span", _hoisted_5$u)),
            _cache[6] || (_cache[6] = createBaseVNode("span", { class: "min-w-0 flex-1 truncate text-fg-primary" }, "未分类", -1)),
            createBaseVNode("span", _hoisted_6$u, toDisplayString(folderCount("none")), 1)
          ], 40, _hoisted_4$u)) : createCommentVNode("", true),
          (openBlock(true), createElementBlock(Fragment, null, renderList(visibleFolders.value, (f2) => {
            return openBlock(), createElementBlock("button", {
              key: f2.id,
              type: "button",
              class: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover",
              title: rowState(f2.id) === "exclude" ? "右键取消排除" : "左键包含 / 右键排除",
              onClick: ($event) => toggleInclude(f2.id),
              onContextmenu: withModifiers(($event) => toggleExclude(f2.id), ["prevent"])
            }, [
              rowState(f2.id) === "include" ? (openBlock(), createBlock(_sfc_main$L, {
                key: 0,
                icon: "context-menu/ic-context-menu-checkbox",
                size: 14,
                class: "text-brand-500"
              })) : rowState(f2.id) === "exclude" ? (openBlock(), createBlock(_sfc_main$L, {
                key: 1,
                icon: "ic-condition-remove",
                size: 14,
                class: "text-danger"
              })) : (openBlock(), createElementBlock("span", _hoisted_8$p)),
              createBaseVNode("span", {
                class: normalizeClass(["min-w-0 flex-1 truncate", rowState(f2.id) === "exclude" ? "text-fg-muted line-through" : "text-fg-primary"])
              }, toDisplayString(f2.name), 3),
              createBaseVNode("span", _hoisted_9$m, toDisplayString(folderCount(f2.id)), 1)
            ], 40, _hoisted_7$r);
          }), 128)),
          visibleFolders.value.length === 0 && !showUntaggedRow.value ? (openBlock(), createElementBlock("p", _hoisted_10$m, " 没有匹配的文件夹 ")) : createCommentVNode("", true)
        ]),
        createVNode(_sfc_main$F, { esc: false })
      ]);
    };
  }
}
