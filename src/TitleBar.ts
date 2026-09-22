/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$u = /* @__PURE__ */ defineComponent(
*/
{
  __name: "TitleBar",
  setup(__props) {
    const route = useRoute();
    const router = useRouter();
    const menu = useContextMenu();
    const { panelVisible, togglePanel } = useLibraryUI();
    const tabs = useLibraryTabs();
    const data = usePhotoData();
    const filters = usePhotoFilters();
    const actions = usePhotoActions();
    const search = usePhotoSearch();
    const aiBatch = useAiBatch();
    const runInLib = useRunInLibrary();
    const searchScopes = useSearchScopes();
    const semantic = useSemanticSearch();
    const toast2 = useToast();
    const semanticEnabled = semantic.enabled;
    const semanticState = semantic.state;
    async function searchLibraryByImage() {
      const files = await window.api.photos.selectFiles();
      const img = files?.[0];
      if (!img) return;
      const ids = await semantic.searchByImage(img);
      if (ids === null) {
        toast2.warning("以图搜库内没跑起来", {
          description: semantic.state.value.error || "模型未下载（设置 › 内容识别）"
        });
        return;
      }
      const label = img.split(/[\\/]/).pop() ?? img;
      localSearchKeyword.value = label;
      search.handleSearch(label);
      if (ids.length === 0) toast2.info("库里没有能解出画面的素材", { description: `「${label}」` });
      else if (ids.length >= 24)
        toast2.info(`已列出按画面排在最前的 ${ids.length} 张（分数只用于排序，不代表够像）`);
    }
    function toggleSearchPanel() {
      searchPanelOpen.value = !searchPanelOpen.value;
      if (searchPanelOpen.value) void semantic.refreshReady();
    }
    async function onSemanticToggle() {
      await semantic.toggle();
      const q3 = localSearchKeyword.value.trim();
      if (q3 !== "") search.handleSearch(q3);
    }
    const semanticHint = computed(() => {
      if (!semanticState.value.ready)
        return "AI 语义搜索：模型未下载。到 设置 › 内容识别 下载后启用（约 754MB，一次性的）";
      if (semanticEnabled.value && semanticState.value.count === 0)
        return `AI 判定没有语义相近的素材（阈值 ${semanticState.value.minScoreText.toFixed(2)}，按 48 图池实测标定）`;
      return semanticEnabled.value ? "AI 语义搜索已开启：按画面内容搜，可与文件夹/标签/维度筛选组合" : "开启 AI 语义搜索：按画面内容搜图，而不是按文件名";
    });
    const isMac = computed(() => navigator.userAgent.includes("Mac"));
    const inLibrary = computed(() => String(route.name || "") === "photos");
    const inTagManager = computed(() => String(route.name || "") === "tags");
    const breadcrumb = computed(() => {
      if (inTagManager.value) return [{ label: "标签管理" }];
      if (!inLibrary.value) return [];
      const segs = [];
      const view = tabs.activeView;
      if (view.startsWith("folder:") && filters.activeFolder.value) {
        segs.push({ label: filters.activeFolder.value.name });
      } else if (view.startsWith("album:") && filters.activeAlbum.value) {
        segs.push({ label: filters.activeAlbum.value.name });
      } else if (view.startsWith("smart:") && filters.activeSmartAlbum.value) {
        segs.push({ label: filters.activeSmartAlbum.value.name });
      } else {
        segs.push({ label: view === "all" ? "全部" : tabs.active.title });
      }
      if (filters.hasDimensionFilters.value || filters.isSearchMode.value) {
        segs.push({ label: `搜索结果 (${filters.totalCount.value})` });
      }
      return segs;
    });
    const LAYOUT_LABEL = {
      grid: "网格布局",
      waterfall: "瀑布流布局",
      list: "列表布局",
      auto: "自适应布局",
      freeform: "自由网格"
    };
    const localSearchKeyword = ref(tabs.active.searchKeyword);
    watch(
      () => tabs.active.searchKeyword,
      (v2) => {
        localSearchKeyword.value = v2;
      }
    );
    const handleSearchInput = () => {
      search.handleSearch(localSearchKeyword.value);
    };
    const searchPanelOpen = ref(false);
    const searchHistory = ref(loadSearchHistory());
    function loadSearchHistory() {
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((s2) => typeof s2 === "string") : [];
      } catch {
        return [];
      }
    }
    function commitSearchHistory() {
      const term = localSearchKeyword.value.trim();
      if (!term) return;
      searchHistory.value = [term, ...searchHistory.value.filter((s2) => s2 !== term)].slice(
        0,
        HISTORY_MAX
      );
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory.value));
      } catch {
      }
    }
    function applyHistoryTerm(term) {
      localSearchKeyword.value = term;
      search.handleSearch(term);
      searchPanelOpen.value = false;
    }
    function clearSearchHistory() {
      searchHistory.value = [];
      try {
        localStorage.removeItem(HISTORY_KEY);
      } catch {
      }
    }
    function clearSearchInput() {
      localSearchKeyword.value = "";
      search.handleSearch("");
    }
    const searchDropEl = ref(null);
    function onSearchDropMousedown(e64) {
      if (searchDropEl.value && !searchDropEl.value.contains(e64.target)) {
        searchPanelOpen.value = false;
      }
    }
    watch(searchPanelOpen, (open) => {
      if (open) document.addEventListener("mousedown", onSearchDropMousedown, true);
      else document.removeEventListener("mousedown", onSearchDropMousedown, true);
    });
    onUnmounted(() => document.removeEventListener("mousedown", onSearchDropMousedown, true));
    const THUMB_STEPS = ["sm", "md", "lg", "xl"];
    const thumbStep = computed({
      get: () => THUMB_STEPS.indexOf(tabs.active.thumbSize),
      set: (v2) => {
        tabs.active.thumbSize = THUMB_STEPS[v2] ?? "md";
        tabs.persist();
      }
    });
    function thumbDec() {
      if (thumbStep.value > 0) thumbStep.value = thumbStep.value - 1;
    }
    function thumbInc() {
      if (thumbStep.value < THUMB_STEPS.length - 1) thumbStep.value = thumbStep.value + 1;
    }
    function goBack() {
      tabs.back();
      if (route.path !== "/photos") router.push("/photos").catch(() => {
      });
    }
    function goForward() {
      tabs.forward();
      if (route.path !== "/photos") router.push("/photos").catch(() => {
      });
    }
    function openImportMenu(e64) {
      const rect = e64.currentTarget.getBoundingClientRect();
      menu.open(
        rect.left,
        rect.bottom + 4,
        [
          { key: "folder", label: "导入文件夹…", icon: "context-menu/ic-import-local" },
          { key: "files", label: "导入文件…", icon: "ic_add" },
          { key: "d1", divider: true },
          { key: "bookmark", label: "收藏网址…", icon: "context-menu/ic-import-links" }
        ],
        (key) => {
          if (key === "folder") void actions.handleImportFolder();
          else if (key === "files") void actions.handleImportFiles();
          else if (key === "bookmark")
            runInLib(() => actions.bookmarkModalOpen.value = true);
        }
      );
    }
    const switcherOpen = ref(false);
    const pluginsOpen = ref(false);
    const openPlugins = () => {
      pluginsOpen.value = true;
    };
    window.addEventListener("leaf:open-plugins", openPlugins);
    onUnmounted(() => window.removeEventListener("leaf:open-plugins", openPlugins));
    const actionsOpen = ref(false);
    const openActions = () => {
      actionsOpen.value = true;
    };
    window.addEventListener("leaf:open-actions", openActions);
    onUnmounted(() => window.removeEventListener("leaf:open-actions", openActions));
    const pinnedDims = ref(loadPinnedDimensions());
    function togglePinnedDim(id3) {
      const i2 = pinnedDims.value.indexOf(id3);
      if (i2 >= 0) pinnedDims.value.splice(i2, 1);
      else pinnedDims.value.push(id3);
      savePinnedDimensions([...pinnedDims.value]);
      window.dispatchEvent(new CustomEvent("leaf:dimensions-changed"));
    }
    function reorderPinnedDim(from, to2) {
      reorderDimension(from, to2);
      window.dispatchEvent(new CustomEvent("leaf:dimensions-changed"));
    }
    function reloadDims() {
      pinnedDims.value = loadPinnedDimensions();
    }
    onMounted(() => {
      window.addEventListener("leaf:dimensions-changed", reloadDims);
      void semantic.refreshReady();
    });
    onUnmounted(() => window.removeEventListener("leaf:dimensions-changed", reloadDims));
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("header", _hoisted_1$u, [
        _cache[20] || (_cache[20] = createBaseVNode("div", {
          class: "pointer-events-none absolute inset-x-0 top-0 h-px bg-glass-highlight",
          "aria-hidden": "true"
        }, null, -1)),
        createBaseVNode("div", {
          class: normalizeClass(["flex shrink-0 items-center border-r border-line-subtle bg-[rgba(44,47,50,0.03)] transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] dark:bg-[rgba(248,249,251,0.03)]", [
            isMac.value ? "pl-[76px]" : "pl-2",
            unref(panelVisible) ? "w-[var(--shell-library-panel-w)] justify-end pr-3" : "justify-start pr-1"
          ]])
        }, [
          createBaseVNode("div", _hoisted_2$u, [
            createVNode(_sfc_main$y),
            createVNode(UTooltip, {
              content: "导入",
              position: "bottom"
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  class: normalizeClass(iconBtn),
                  "aria-label": "导入",
                  disabled: !inLibrary.value,
                  onClick: openImportMenu
                }, [
                  createVNode(_sfc_main$L, { icon: "ic_add" })
                ], 8, _hoisted_3$q)
              ]),
              _: 1
            }),
            createVNode(UTooltip, {
              content: "快速跳转",
              position: "bottom"
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  class: normalizeClass(iconBtn),
                  "aria-label": "快速跳转",
                  onClick: _cache[0] || (_cache[0] = ($event) => switcherOpen.value = true)
                }, [
                  createVNode(_sfc_main$L, { icon: "ic_switch" })
                ])
              ]),
              _: 1
            }),
            createVNode(UTooltip, {
              content: "显示/隐藏侧栏",
              position: "bottom"
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  class: normalizeClass(iconBtn),
                  "aria-label": "显示/隐藏侧栏",
                  onClick: _cache[1] || (_cache[1] = //@ts-ignore
                  (...args) => unref(togglePanel) && unref(togglePanel)(...args))
                }, [
                  createVNode(_sfc_main$L, { icon: "ic_toggle-sidebar" })
                ])
              ]),
              _: 1
            })
          ])
        ], 2),
        createBaseVNode("div", _hoisted_4$n, [
          createBaseVNode("button", {
            type: "button",
            class: normalizeClass([
              iconBtn,
              "LeafTitleBar-nodrag",
              unref(tabs).canBack ? "" : "opacity-35 hover:bg-transparent"
            ]),
            disabled: !unref(tabs).canBack,
            "aria-label": "后退",
            onClick: goBack
          }, [
            createVNode(_sfc_main$L, { icon: "ic-toolbar-prev" })
          ], 10, _hoisted_5$n),
          createBaseVNode("button", {
            type: "button",
            class: normalizeClass([
              iconBtn,
              "LeafTitleBar-nodrag",
              unref(tabs).canForward ? "" : "opacity-35 hover:bg-transparent"
            ]),
            disabled: !unref(tabs).canForward,
            "aria-label": "前进",
            onClick: goForward
          }, [
            createVNode(_sfc_main$L, { icon: "ic-toolbar-next" })
          ], 10, _hoisted_6$n),
          createBaseVNode("nav", _hoisted_7$l, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(breadcrumb.value, (seg, i2) => {
              return openBlock(), createElementBlock(Fragment, {
                key: `${seg.label}-${i2}`
              }, [
                i2 > 0 ? (openBlock(), createElementBlock("span", _hoisted_8$j, "/")) : createCommentVNode("", true),
                createBaseVNode("span", {
                  class: normalizeClass([
                    "truncate",
                    i2 === breadcrumb.value.length - 1 ? "font-medium text-fg-primary" : "text-fg-secondary"
                  ])
                }, toDisplayString(seg.label), 3)
              ], 64);
            }), 128))
          ]),
          !inLibrary.value && !inTagManager.value ? (openBlock(), createElementBlock("span", _hoisted_9$g, "Leaf")) : createCommentVNode("", true),
          inLibrary.value ? (openBlock(), createElementBlock("div", _hoisted_10$g, [
            createBaseVNode("div", _hoisted_11$c, [
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass([iconBtn, thumbStep.value <= 0 ? "opacity-35" : ""]),
                disabled: thumbStep.value <= 0,
                "aria-label": "缩小缩略图",
                onClick: thumbDec
              }, [
                createVNode(_sfc_main$L, { icon: "ic-toolbar-zoom-out" })
              ], 10, _hoisted_12$c),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => thumbStep.value = $event),
                type: "range",
                min: "0",
                max: "3",
                step: "1",
                class: "thumb-slider h-3 w-[130px] cursor-pointer",
                "aria-label": "缩略图大小"
              }, null, 512), [
                [
                  vModelText,
                  thumbStep.value,
                  void 0,
                  { number: true }
                ]
              ]),
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass([iconBtn, thumbStep.value >= 3 ? "opacity-35" : ""]),
                disabled: thumbStep.value >= 3,
                "aria-label": "放大缩略图",
                onClick: thumbInc
              }, [
                createVNode(_sfc_main$L, { icon: "ic-toolbar-zoom-in" })
              ], 10, _hoisted_13$b)
            ])
          ])) : createCommentVNode("", true),
          unref(data).processing.value ? (openBlock(), createElementBlock("div", _hoisted_14$a, [
            _cache[10] || (_cache[10] = createBaseVNode("svg", {
              class: "size-3 animate-spin",
              viewBox: "0 0 24 24",
              fill: "none"
            }, [
              createBaseVNode("circle", {
                cx: "12",
                cy: "12",
                r: "9",
                stroke: "currentColor",
                "stroke-width": "3",
                opacity: "0.25"
              }),
              createBaseVNode("path", {
                d: "M21 12a9 9 0 0 0-9-9",
                stroke: "currentColor",
                "stroke-width": "3",
                "stroke-linecap": "round"
              })
            ], -1)),
            createTextVNode(" " + toDisplayString(unref(data).processing.value.done) + "/" + toDisplayString(unref(data).processing.value.total), 1)
          ])) : createCommentVNode("", true),
          unref(aiBatch).progress.value ? (openBlock(), createElementBlock("div", _hoisted_15$a, [
            _cache[11] || (_cache[11] = createBaseVNode("svg", {
              class: "size-3 animate-spin",
              viewBox: "0 0 24 24",
              fill: "none"
            }, [
              createBaseVNode("circle", {
                cx: "12",
                cy: "12",
                r: "9",
                stroke: "currentColor",
                "stroke-width": "3",
                opacity: "0.25"
              }),
              createBaseVNode("path", {
                d: "M21 12a9 9 0 0 0-9-9",
                stroke: "currentColor",
                "stroke-width": "3",
                "stroke-linecap": "round"
              })
            ], -1)),
            createTextVNode(" AI " + toDisplayString(unref(aiBatch).progress.value.done) + "/" + toDisplayString(unref(aiBatch).progress.value.total), 1)
          ])) : createCommentVNode("", true),
          createBaseVNode("div", {
            class: normalizeClass(["LeafTitleBar-nodrag ml-auto flex shrink-0 items-center gap-0.5", inLibrary.value ? "" : "hidden"])
          }, [
            inLibrary.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              createVNode(UTooltip, {
                content: "插件",
                position: "bottom"
              }, {
                default: withCtx(() => [
                  createBaseVNode("button", {
                    class: normalizeClass(iconBtn),
                    "aria-label": "插件",
                    onClick: openPlugins
                  }, [
                    createVNode(_sfc_main$L, { icon: "ic-toolbar-plugin" })
                  ])
                ]),
                _: 1
              }),
              createVNode(UTooltip, {
                content: "动作",
                position: "bottom"
              }, {
                default: withCtx(() => [
                  createBaseVNode("button", {
                    class: normalizeClass(iconBtn),
                    "aria-label": "动作",
                    onClick: _cache[3] || (_cache[3] = ($event) => actionsOpen.value = true)
                  }, [
                    createVNode(_sfc_main$L, { icon: "ic-toolbar-action" })
                  ])
                ]),
                _: 1
              }),
              createVNode(_sfc_main$z, {
                disabled: !inLibrary.value
              }, {
                trigger: withCtx(({ toggle }) => [
                  createVNode(UTooltip, {
                    content: `布局：${LAYOUT_LABEL[unref(tabs).active.layout]}（点击展开）`,
                    position: "bottom"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("button", {
                        class: normalizeClass(iconBtn),
                        "aria-label": "布局与显示选项",
                        onClick: toggle
                      }, [
                        createVNode(_sfc_main$L, { icon: LAYOUT_TOOLBAR_ICON })
                      ], 8, _hoisted_16$9)
                    ]),
                    _: 2
                  }, 1032, ["content"])
                ]),
                _: 1
              }, 8, ["disabled"]),
              createVNode(_sfc_main$I, {
                pinned: pinnedDims.value,
                onToggle: togglePinnedDim,
                onReorder: reorderPinnedDim
              }, {
                default: withCtx(({ toggle }) => [
                  createVNode(UTooltip, {
                    content: "筛选维度",
                    position: "bottom"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("button", {
                        class: normalizeClass(iconBtn),
                        "aria-label": "筛选维度",
                        onClick: toggle
                      }, [
                        createBaseVNode("span", _hoisted_18$6, [
                          createVNode(_sfc_main$L, { icon: "ic-toolbar-filter" }),
                          unref(filters).hasDimensionFilters.value ? (openBlock(), createElementBlock("span", _hoisted_19$5)) : createCommentVNode("", true)
                        ])
                      ], 8, _hoisted_17$7)
                    ]),
                    _: 2
                  }, 1024)
                ]),
                _: 1
              }, 8, ["pinned"])
            ], 64)) : createCommentVNode("", true)
          ], 2),
          inLibrary.value ? (openBlock(), createElementBlock("div", {
            key: 4,
            ref_key: "searchDropEl",
            ref: searchDropEl,
            class: "LeafTitleBar-nodrag relative ml-1 flex w-[180px] shrink-0 items-center"
          }, [
            createBaseVNode("span", _hoisted_20$5, [
              createVNode(_sfc_main$L, {
                icon: "ic_search",
                size: 14
              }),
              unref(semanticEnabled) ? (openBlock(), createBlock(_sfc_main$L, {
                key: 0,
                icon: "context-menu/ic-ai",
                size: 12,
                class: "text-brand-500",
                title: semanticHint.value
              }, null, 8, ["title"])) : createCommentVNode("", true),
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass(["flex items-center rounded-sm p-0.5 transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:text-fg-primary", searchPanelOpen.value ? "text-fg-primary" : ""]),
                title: "搜索范围",
                "aria-label": "搜索范围",
                onMousedown: _cache[4] || (_cache[4] = withModifiers(() => {
                }, ["prevent"])),
                onClick: toggleSearchPanel
              }, [
                createVNode(_sfc_main$L, {
                  icon: "ic-toolbar-arrow-down",
                  size: 10
                })
              ], 34)
            ]),
            withDirectives(createBaseVNode("input", {
              id: "library-search",
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => localSearchKeyword.value = $event),
              type: "text",
              placeholder: "搜索",
              class: normalizeClass(["h-8 w-full rounded-lg border border-line-default bg-surface-1 pr-7 text-[13px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500", unref(semanticEnabled) ? "pl-[64px]" : "pl-[46px]"]),
              onInput: handleSearchInput,
              onKeydown: withKeys(commitSearchHistory, ["enter"])
            }, null, 34), [
              [vModelText, localSearchKeyword.value]
            ]),
            localSearchKeyword.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              type: "button",
              class: "absolute right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-hover text-fg-secondary transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:text-fg-primary",
              title: "清除搜索",
              "aria-label": "清除搜索",
              onClick: clearSearchInput
            }, [
              createVNode(_sfc_main$L, {
                icon: "ic-modal-close",
                size: 9
              })
            ])) : (openBlock(), createElementBlock("button", {
              key: 1,
              type: "button",
              class: "absolute right-1 flex h-5 w-5 items-center justify-center rounded-sm text-fg-muted transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover hover:text-fg-primary",
              title: "以图搜图（选择外部图片，搜索引擎搜图）",
              "aria-label": "以图搜图",
              onClick: _cache[6] || (_cache[6] = ($event) => unref(actions).reverseImageSearch())
            }, [
              createVNode(_sfc_main$L, {
                icon: "ic-search-by-image",
                size: 14
              })
            ])),
            searchPanelOpen.value ? (openBlock(), createElementBlock("div", _hoisted_21$5, [
              _cache[17] || (_cache[17] = createBaseVNode("p", { class: "px-3 pb-0.5 pt-0.5 text-[10px] leading-4 text-fg-tertiary" }, "搜索范围:", -1)),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(SEARCH_SCOPES), (scope) => {
                return openBlock(), createElementBlock("button", {
                  key: scope.id,
                  type: "button",
                  class: "flex w-full items-center gap-1.5 px-3 py-[3px] text-left text-[11px] text-fg-primary transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover",
                  title: unref(searchScopes).includes(scope.id) ? "点击取消该范围" : "点击搜索该范围",
                  onClick: ($event) => unref(toggleSearchScope)(scope.id)
                }, [
                  createVNode(_sfc_main$L, {
                    icon: scope.icon,
                    size: 12,
                    class: "shrink-0 text-fg-secondary"
                  }, null, 8, ["icon"]),
                  createBaseVNode("span", _hoisted_23$4, toDisplayString(scope.label), 1),
                  createVNode(_sfc_main$L, {
                    icon: "context-menu/ic-context-menu-checkbox",
                    size: 12,
                    class: normalizeClass(
                      unref(searchScopes).includes(scope.id) ? "text-fg-primary" : "text-fg-primary opacity-20"
                    )
                  }, null, 8, ["class"])
                ], 8, _hoisted_22$4);
              }), 128)),
              _cache[18] || (_cache[18] = createBaseVNode("div", { class: "my-1 border-t border-line-default" }, null, -1)),
              createBaseVNode("button", {
                type: "button",
                class: "flex w-full items-center gap-1.5 px-3 py-[3px] text-left text-[11px] transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45",
                disabled: !unref(semanticState).ready,
                title: semanticHint.value,
                onClick: onSemanticToggle
              }, [
                createVNode(_sfc_main$L, {
                  icon: "context-menu/ic-ai",
                  size: 12,
                  class: normalizeClass(["shrink-0", unref(semanticEnabled) ? "text-brand-500" : "text-fg-secondary"])
                }, null, 8, ["class"]),
                _cache[12] || (_cache[12] = createBaseVNode("span", { class: "min-w-0 flex-1 truncate" }, "AI 语义", -1)),
                createVNode(_sfc_main$L, {
                  icon: "context-menu/ic-context-menu-checkbox",
                  size: 12,
                  class: normalizeClass(unref(semanticEnabled) ? "text-fg-primary" : "text-fg-primary opacity-20")
                }, null, 8, ["class"])
              ], 8, _hoisted_24$3),
              createBaseVNode("button", {
                type: "button",
                class: "flex w-full items-center gap-1.5 px-3 py-[3px] text-left text-[11px] transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45",
                disabled: !unref(semanticState).ready || unref(semanticState).loading,
                title: unref(semanticState).ready ? "选一张图片，用本地向量档在库里找画面相近的素材" : "需要先在 设置 › 内容识别 下载模型",
                onClick: searchLibraryByImage
              }, [
                createVNode(_sfc_main$L, {
                  icon: "ic-search-by-image",
                  size: 12,
                  class: "shrink-0 text-fg-secondary"
                }),
                _cache[13] || (_cache[13] = createBaseVNode("span", { class: "min-w-0 flex-1 truncate" }, "以图搜库内", -1))
              ], 8, _hoisted_25$3),
              _cache[19] || (_cache[19] = createStaticVNode('<div class="px-3 py-1.5" data-v-e9748ae0><p class="text-[10px] text-fg-tertiary" data-v-e9748ae0>高级搜索</p><p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted" data-v-e9748ae0><code class="rounded bg-surface-hover px-1" data-v-e9748ae0>cat OR dog</code> 任一匹配 </p><p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted" data-v-e9748ae0><code class="rounded bg-surface-hover px-1" data-v-e9748ae0>(a || b) -c</code> 分组+排除 </p><p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted" data-v-e9748ae0><code class="rounded bg-surface-hover px-1" data-v-e9748ae0>&quot;cat food&quot;</code> 精确短语 </p></div>', 1)),
              searchHistory.value.length > 0 ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                _cache[14] || (_cache[14] = createBaseVNode("div", { class: "my-1 border-t border-line-default" }, null, -1)),
                _cache[15] || (_cache[15] = createBaseVNode("p", { class: "px-3 py-0.5 text-[10px] text-fg-tertiary" }, "最近搜索", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(searchHistory.value, (term) => {
                  return openBlock(), createElementBlock("button", {
                    key: term,
                    type: "button",
                    class: "flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-fg-secondary transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover hover:text-fg-primary",
                    onClick: ($event) => applyHistoryTerm(term)
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "ic_search",
                      size: 12,
                      class: "text-fg-muted"
                    }),
                    createBaseVNode("span", _hoisted_27$3, toDisplayString(term), 1)
                  ], 8, _hoisted_26$3);
                }), 128)),
                _cache[16] || (_cache[16] = createBaseVNode("div", { class: "my-1 border-t border-line-default" }, null, -1)),
                createBaseVNode("button", {
                  type: "button",
                  class: "w-full px-3 py-1 text-left text-[11px] text-fg-muted transition-colors duration-[var(--motion-normal)] ease-[var(--ease-super)] hover:bg-surface-hover hover:text-danger",
                  onClick: clearSearchHistory
                }, " 清除搜索历史 ")
              ], 64)) : createCommentVNode("", true)
            ])) : createCommentVNode("", true)
          ], 512)) : createCommentVNode("", true)
        ]),
        createVNode(_sfc_main$x, {
          modelValue: pluginsOpen.value,
          "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => pluginsOpen.value = $event)
        }, null, 8, ["modelValue"]),
        createVNode(_sfc_main$w, {
          modelValue: actionsOpen.value,
          "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => actionsOpen.value = $event)
        }, null, 8, ["modelValue"]),
        createVNode(_sfc_main$v, {
          modelValue: switcherOpen.value,
          "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => switcherOpen.value = $event)
        }, null, 8, ["modelValue"])
      ]);
    };
  }
}
