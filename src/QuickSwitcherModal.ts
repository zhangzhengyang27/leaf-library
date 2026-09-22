/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$v = /* @__PURE__ */ defineComponent(
*/
{
  __name: "QuickSwitcherModal",
  props: {
    modelValue: { type: Boolean }
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const data = usePhotoData();
    const tabs = useLibraryTabs();
    const selection = usePhotoSelection();
    const search = usePhotoSearch();
    const TABS = [
      { key: "folder", label: "文件夹" },
      { key: "tag", label: "标签" },
      { key: "smart", label: "智能文件夹" },
      { key: "doc", label: "文档" }
    ];
    const active = ref(0);
    const keyword = ref("");
    const cursor = ref(0);
    const listEl = ref(null);
    const close = () => emit("update:modelValue", false);
    function pyIndex(title) {
      try {
        const first = pinyin(title, { pattern: "first", toneType: "none", type: "array" }).join("").toLowerCase();
        const full = pinyin(title, { pattern: "pinyin", toneType: "none", type: "array" }).join("").toLowerCase();
        return { first, full };
      } catch {
        return { first: "", full: "" };
      }
    }
    const folders = computed(
      () => data.folders.value.map((f2) => {
        const py2 = pyIndex(f2.name);
        return {
          key: f2.id,
          title: f2.name,
          hint: `${f2.photoCount} 项`,
          pyFirst: py2.first,
          pyFull: py2.full,
          run: () => tabs.setView(`folder:${f2.id}`, f2.name)
        };
      })
    );
    const tags = computed(
      () => data.dictionaryTags.value.map((t3) => {
        const py2 = pyIndex(t3.name);
        return {
          key: t3.id,
          title: t3.name,
          hint: `${t3.usageCount ?? 0} 项`,
          pyFirst: py2.first,
          pyFull: py2.full,
          // Leaf 无独立标签视图：跳回「全部」并应用标签筛选。
          // setView 内部已 persist，tagFilter 赋值在其后，需再补一次（审查 P3-68）
          run: () => {
            tabs.setView("all", "全部");
            tabs.active.tagFilter = [t3.name];
            tabs.persist();
          }
        };
      })
    );
    const smartAlbums = computed(
      () => data.smartAlbums.value.map((s2) => {
        const py2 = pyIndex(s2.name);
        return {
          key: s2.id,
          title: s2.name,
          hint: "智能文件夹",
          pyFirst: py2.first,
          pyFull: py2.full,
          run: () => tabs.setView(`smart:${s2.id}`, s2.name)
        };
      })
    );
    const docs = computed(() => {
      const q3 = keyword.value.trim().toLowerCase();
      if (!q3) return [];
      return [
        {
          key: "search",
          title: `搜索「${keyword.value.trim()}」`,
          hint: "在全部素材中搜索",
          pyFirst: "",
          pyFull: "",
          run: () => {
            tabs.setView("all", "全部");
            selection.clearSelection();
            search.handleSearch(keyword.value.trim());
          }
        }
      ];
    });
    const entries = computed(() => {
      const source = active.value === 0 ? folders.value : active.value === 1 ? tags.value : active.value === 2 ? smartAlbums.value : docs.value;
      const q3 = keyword.value.trim().toLowerCase();
      if (!q3 || active.value === 3) return source;
      return source.filter(
        (e64) => e64.title.toLowerCase().includes(q3) || e64.hint.toLowerCase().includes(q3) || e64.pyFirst.includes(q3) || e64.pyFull.includes(q3)
      );
    });
    watch([keyword, active], () => {
      cursor.value = 0;
    });
    watch(
      () => props.modelValue,
      async (open) => {
        if (open) {
          keyword.value = "";
          cursor.value = 0;
          await nextTick();
          document.getElementById("quick-switcher-input")?.focus();
        }
      }
    );
    function move(delta) {
      const n2 = entries.value.length;
      if (n2 === 0) return;
      cursor.value = (cursor.value + delta + n2) % n2;
      nextTick(() => {
        listEl.value?.querySelector(`[data-idx="${cursor.value}"]`)?.scrollIntoView({ block: "nearest" });
      });
    }
    function runCurrent() {
      const entry = entries.value[cursor.value];
      if (!entry) return;
      entry.run();
      close();
    }
    function onKeydown(e64) {
      if (e64.key === "ArrowDown") {
        e64.preventDefault();
        move(1);
      } else if (e64.key === "ArrowUp") {
        e64.preventDefault();
        move(-1);
      } else if (e64.key === "Enter") {
        e64.preventDefault();
        runCurrent();
      } else if (e64.key === "Tab") {
        e64.preventDefault();
        active.value = (active.value + (e64.shiftKey ? TABS.length - 1 : 1)) % TABS.length;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": __props.modelValue,
        size: "md",
        "close-on-overlay": true,
        "onUpdate:modelValue": close
      }, {
        default: withCtx(() => [
          createBaseVNode("div", {
            class: "flex flex-col",
            onKeydown
          }, [
            withDirectives(createBaseVNode("input", {
              id: "quick-switcher-input",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => keyword.value = $event),
              type: "text",
              placeholder: "搜索（支持拼音、模糊关键字）",
              class: "h-10 w-full border-0 border-b border-line-default bg-transparent px-3 text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
            }, null, 512), [
              [vModelText, keyword.value]
            ]),
            createBaseVNode("div", _hoisted_1$v, [
              (openBlock(), createElementBlock(Fragment, null, renderList(TABS, (t3, i2) => {
                return createBaseVNode("button", {
                  key: t3.key,
                  type: "button",
                  class: normalizeClass([
                    "rounded-md px-2.5 py-1 text-xs transition-colors duration-fast",
                    i2 === active.value ? "bg-surface-active font-medium text-fg-primary" : "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary"
                  ]),
                  onClick: ($event) => active.value = i2
                }, toDisplayString(t3.label), 11, _hoisted_2$v);
              }), 64))
            ]),
            createBaseVNode("div", {
              ref_key: "listEl",
              ref: listEl,
              class: "max-h-80 min-h-24 overflow-y-auto py-1"
            }, [
              entries.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_3$r, " 没有匹配的项目 ")) : createCommentVNode("", true),
              (openBlock(true), createElementBlock(Fragment, null, renderList(entries.value, (e64, i2) => {
                return openBlock(), createElementBlock("button", {
                  key: `${active.value}-${e64.key}`,
                  "data-idx": i2,
                  type: "button",
                  class: normalizeClass(["mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-fast", i2 === cursor.value ? "bg-surface-active text-fg-primary" : "text-fg-secondary"]),
                  onMouseenter: ($event) => cursor.value = i2,
                  onClick: _cache[1] || (_cache[1] = ($event) => runCurrent())
                }, [
                  createVNode(_sfc_main$L, {
                    icon: active.value === 0 ? "ic_folder-close" : active.value === 1 ? "context-menu/ic-tag-normal" : active.value === 2 ? "context-menu/ic-smart-folder-rule" : "context-menu/ic-filter-item-ext",
                    class: "shrink-0 text-fg-muted"
                  }, null, 8, ["icon"]),
                  createBaseVNode("span", _hoisted_5$o, toDisplayString(e64.title), 1),
                  createBaseVNode("span", _hoisted_6$o, toDisplayString(e64.hint), 1)
                ], 42, _hoisted_4$o);
              }), 128))
            ], 512),
            _cache[2] || (_cache[2] = createBaseVNode("div", { class: "flex items-center gap-3 border-t border-line-default px-3 py-1.5 text-[10px] text-fg-tertiary" }, [
              createBaseVNode("span", null, [
                createTextVNode("切换 "),
                createBaseVNode("b", { class: "text-fg-secondary" }, "Tab")
              ]),
              createBaseVNode("span", null, [
                createTextVNode("移动 "),
                createBaseVNode("b", { class: "text-fg-secondary" }, "↑ ↓")
              ]),
              createBaseVNode("span", null, [
                createTextVNode("选中 "),
                createBaseVNode("b", { class: "text-fg-secondary" }, "⏎")
              ]),
              createBaseVNode("span", { class: "ml-auto" }, [
                createTextVNode("关闭 "),
                createBaseVNode("b", { class: "text-fg-secondary" }, "ESC")
              ])
            ], -1))
          ], 32)
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
}
