/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$D = /* @__PURE__ */ defineComponent(
*/
{
  __name: "TagsFilterPanel",
  setup(__props) {
    const tabs = useLibraryTabs();
    const data = usePhotoData();
    const filters = usePhotoFilters();
    const search = ref("");
    const includeLower = computed(() => tabs.active.tagFilter.map((t3) => t3.toLowerCase()));
    const excludeLower = computed(() => tabs.active.tagExclude.map((t3) => t3.toLowerCase()));
    const visibleTags = computed(() => {
      const q3 = search.value.trim().toLowerCase();
      if (!q3) return data.dictionaryTags.value;
      return data.dictionaryTags.value.filter((t3) => t3.name.toLowerCase().includes(q3));
    });
    const tagCounts = computed(() => {
      const out = {};
      for (const p2 of filters.currentPool.value) {
        for (const t3 of p2.tags) {
          const lower = t3.toLowerCase();
          out[lower] = (out[lower] ?? 0) + 1;
        }
      }
      return out;
    });
    function tagCount(name) {
      return tagCounts.value[name.toLowerCase()] ?? 0;
    }
    const untaggedCount = computed(
      () => filters.currentPool.value.filter((p2) => p2.tags.length === 0).length
    );
    function toggleInclude(name) {
      const arr = tabs.active.tagFilter;
      const i2 = arr.findIndex((t3) => t3.toLowerCase() === name.toLowerCase());
      if (i2 >= 0) arr.splice(i2, 1);
      else arr.push(name);
      tabs.persist();
    }
    function toggleExclude(name) {
      const arr = tabs.active.tagExclude;
      const i2 = arr.findIndex((t3) => t3.toLowerCase() === name.toLowerCase());
      if (i2 >= 0) arr.splice(i2, 1);
      else arr.push(name);
      const inc = tabs.active.tagFilter;
      const j2 = inc.findIndex((t3) => t3.toLowerCase() === name.toLowerCase());
      if (j2 >= 0) inc.splice(j2, 1);
      tabs.persist();
    }
    function toggleUntagged() {
      tabs.active.untaggedOnly = !tabs.active.untaggedOnly;
      tabs.persist();
    }
    function removeIncluded(name) {
      const arr = tabs.active.tagFilter;
      const i2 = arr.findIndex((t3) => t3.toLowerCase() === name.toLowerCase());
      if (i2 >= 0) arr.splice(i2, 1);
      tabs.persist();
    }
    function removeUntagged() {
      tabs.active.untaggedOnly = false;
      tabs.persist();
    }
    const tagLogic = computed(() => {
      if (tabs.active.tagMatchExact) return "exact";
      return tabs.active.tagMatchAny ? "any" : "all";
    });
    function setLogic(v2) {
      tabs.active.tagMatchExact = v2 === "exact";
      tabs.active.tagMatchAny = v2 === "any";
      tabs.persist();
    }
    function rowState(name) {
      const lower = name.toLowerCase();
      if (includeLower.value.includes(lower)) return "include";
      if (excludeLower.value.includes(lower)) return "exclude";
      return "off";
    }
    const hasSelection = computed(() => tabs.active.tagFilter.length > 0 || tabs.active.untaggedOnly);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$D, [
        createBaseVNode("div", _hoisted_2$C, [
          createVNode(_sfc_main$L, {
            icon: "ic_search",
            size: 14,
            class: "shrink-0 text-fg-muted"
          }),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => search.value = $event),
            type: "text",
            placeholder: "搜索标签",
            class: "h-6 min-w-0 flex-1 bg-transparent text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
          }, null, 512), [
            [vModelText, search.value]
          ]),
          _cache[4] || (_cache[4] = createBaseVNode("span", { class: "shrink-0 text-[11px] text-fg-muted" }, "逻辑:", -1)),
          createBaseVNode("button", {
            type: "button",
            class: normalizeClass([
              "flex size-6 items-center justify-center rounded-sm transition-colors",
              tagLogic.value === "any" ? "bg-surface-hover text-fg-primary" : "text-fg-muted hover:text-fg-primary"
            ]),
            title: "包含任一选中标签（OR）",
            onClick: _cache[1] || (_cache[1] = ($event) => setLogic("any"))
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
              tagLogic.value === "all" ? "bg-surface-hover text-fg-primary" : "text-fg-muted hover:text-fg-primary"
            ]),
            title: "包含所有选中标签（AND）",
            onClick: _cache[2] || (_cache[2] = ($event) => setLogic("all"))
          }, [
            createVNode(_sfc_main$L, {
              icon: "ic-logic-all",
              size: 14
            })
          ], 2),
          createBaseVNode("button", {
            type: "button",
            class: normalizeClass([
              "flex size-6 items-center justify-center rounded-sm transition-colors",
              tagLogic.value === "exact" ? "bg-surface-hover text-fg-primary" : "text-fg-muted hover:text-fg-primary"
            ]),
            title: "标签与选中完全一致（等同）",
            onClick: _cache[3] || (_cache[3] = ($event) => setLogic("exact"))
          }, [
            createVNode(_sfc_main$L, {
              icon: "ic-logic-equal",
              size: 14
            })
          ], 2)
        ]),
        createBaseVNode("div", _hoisted_3$y, [
          createBaseVNode("div", _hoisted_4$v, [
            _cache[6] || (_cache[6] = createBaseVNode("p", { class: "px-3 pb-1 text-[11px] font-medium text-fg-secondary" }, "已选定", -1)),
            !hasSelection.value ? (openBlock(), createElementBlock("p", _hoisted_5$v, "全部")) : createCommentVNode("", true),
            unref(tabs).active.untaggedOnly ? (openBlock(), createElementBlock("button", {
              key: 1,
              type: "button",
              class: "mx-1.5 flex w-[calc(100%-12px)] items-center gap-1 rounded-sm bg-brand-500 px-2 py-1 text-xs text-white",
              title: "点击移除",
              onClick: removeUntagged
            }, [
              createVNode(_sfc_main$L, {
                icon: "context-menu/ic-tag-undefined",
                size: 12
              }),
              _cache[5] || (_cache[5] = createBaseVNode("span", { class: "min-w-0 flex-1 truncate text-left" }, "未标签", -1))
            ])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(tabs).active.tagFilter, (t3) => {
              return openBlock(), createElementBlock("button", {
                key: t3,
                type: "button",
                class: "mx-1.5 flex w-[calc(100%-12px)] items-center gap-1 rounded-sm bg-brand-500 px-2 py-1 text-xs text-white",
                title: `点击移除「${t3}」`,
                onClick: ($event) => removeIncluded(t3)
              }, [
                createBaseVNode("span", _hoisted_7$s, toDisplayString(t3), 1),
                createVNode(_sfc_main$L, {
                  icon: "ic-modal-close",
                  size: 11
                })
              ], 8, _hoisted_6$v);
            }), 128))
          ]),
          createBaseVNode("div", _hoisted_8$q, [
            createBaseVNode("button", {
              type: "button",
              class: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover",
              onClick: toggleUntagged,
              onContextmenu: withModifiers(toggleUntagged, ["prevent"])
            }, [
              unref(tabs).active.untaggedOnly ? (openBlock(), createBlock(_sfc_main$L, {
                key: 0,
                icon: "context-menu/ic-context-menu-checkbox",
                size: 14,
                class: "text-brand-500"
              })) : (openBlock(), createElementBlock("span", _hoisted_9$n)),
              createVNode(_sfc_main$L, {
                icon: "context-menu/ic-tag-undefined",
                size: 13,
                class: "text-fg-secondary"
              }),
              _cache[7] || (_cache[7] = createBaseVNode("span", { class: "min-w-0 flex-1 truncate text-fg-primary" }, "未标签", -1)),
              createBaseVNode("span", _hoisted_10$n, toDisplayString(untaggedCount.value), 1)
            ], 32),
            (openBlock(true), createElementBlock(Fragment, null, renderList(visibleTags.value, (t3) => {
              return openBlock(), createElementBlock("button", {
                key: t3.id,
                type: "button",
                class: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover",
                title: rowState(t3.name) === "exclude" ? "右键取消排除" : "左键包含 / 右键排除",
                onClick: ($event) => toggleInclude(t3.name),
                onContextmenu: withModifiers(($event) => toggleExclude(t3.name), ["prevent"])
              }, [
                rowState(t3.name) === "include" ? (openBlock(), createBlock(_sfc_main$L, {
                  key: 0,
                  icon: "context-menu/ic-context-menu-checkbox",
                  size: 14,
                  class: "text-brand-500"
                })) : rowState(t3.name) === "exclude" ? (openBlock(), createBlock(_sfc_main$L, {
                  key: 1,
                  icon: "ic-condition-remove",
                  size: 14,
                  class: "text-danger"
                })) : (openBlock(), createElementBlock("span", _hoisted_12$i)),
                createVNode(_sfc_main$L, {
                  icon: "context-menu/ic-tag-normal",
                  size: 13,
                  class: "text-fg-secondary"
                }),
                createBaseVNode("span", {
                  class: normalizeClass([
                    "min-w-0 flex-1 truncate",
                    rowState(t3.name) === "exclude" ? "text-fg-muted line-through" : "text-fg-primary"
                  ])
                }, toDisplayString(t3.name), 3),
                createBaseVNode("span", _hoisted_13$g, toDisplayString(tagCount(t3.name)), 1)
              ], 40, _hoisted_11$i);
            }), 128)),
            visibleTags.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_14$f, " 没有匹配的标签 ")) : createCommentVNode("", true)
          ])
        ]),
        createVNode(_sfc_main$F)
      ]);
    };
  }
}
