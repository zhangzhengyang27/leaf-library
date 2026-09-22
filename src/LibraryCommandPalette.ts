/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-C_4vKAXg.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$7 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "LibraryCommandPalette",
  setup(__props) {
    const router2 = useRouter();
    const palette = useLibraryCommandPalette();
    const tabs = useLibraryTabs();
    const actions = usePhotoActions();
    const scan = useDuplicateScan();
    const toast2 = useToast();
    const runInLib = useRunInLibrary();
    let escScope = null;
    const query = ref("");
    const inputRef = ref(null);
    const activeIdx = ref(0);
    const commands = computed(() => {
      const list = [
        { id: "view-all", title: "跳转到：全部", run: () => goView("all", "全部") },
        { id: "view-untagged", title: "跳转到：未加标签", run: () => goView("untagged", "未加标签") },
        { id: "view-unsorted", title: "跳转到：未分类", run: () => goView("unsorted", "未分类") },
        { id: "view-recent", title: "跳转到：最近添加", run: () => goView("recent", "最近添加") },
        { id: "view-recents", title: "跳转到：最近查看", run: () => goView("recents", "最近查看") },
        { id: "view-favorites", title: "跳转到：收藏", run: () => goView("favorites", "收藏") },
        { id: "view-map", title: "跳转到：地图", run: () => goView("map", "地图") },
        { id: "view-trash", title: "跳转到：回收站", run: () => goView("trash", "回收站") },
        {
          id: "toggle-shuffle",
          title: "切换：随机模式",
          run: () => {
            const t = tabs.active;
            t.shuffle = !t.shuffle;
            tabs.persist();
            toast2.info(t.shuffle ? "已开启随机模式" : "已关闭随机模式");
          }
        },
        { id: "new-album", title: "新建：相册", hint: "弹窗", run: () => runInLib(() => actions.openAlbumModal()) },
        { id: "new-folder", title: "新建：文件夹", hint: "弹窗", run: () => runInLib(() => actions.openFolderModal()) },
        {
          id: "new-smart",
          title: "新建：智能文件夹",
          hint: "弹窗",
          run: () => runInLib(() => actions.openSmartAlbumModal(null))
        },
        {
          id: "new-bookmark",
          title: "新建：书签",
          hint: "弹窗",
          run: () => runInLib(() => actions.bookmarkModalOpen.value = true)
        },
        { id: "duplicates", title: "工具：相似查重", run: () => void scan.openDuplicateScan() },
        {
          id: "open-actions",
          title: "打开：素材动作",
          hint: "弹窗",
          run: () => window.dispatchEvent(new CustomEvent("leaf:open-actions"))
        },
        { id: "go-stats", title: "打开：统计面板", run: () => router2.push("/stats") },
        { id: "go-settings", title: "打开：设置", run: () => router2.push("/settings") },
        { id: "go-about", title: "打开：关于", run: () => router2.push("/about") }
      ];
      const q = query.value.trim().toLowerCase();
      if (!q) return list;
      return list.filter((c) => c.title.toLowerCase().includes(q));
    });
    function goView(view, title) {
      tabs.setView(view, title);
      if (router2.currentRoute.value.path !== "/photos") {
        router2.push("/photos").catch(() => {
        });
      }
    }
    const filtered = computed(() => {
      const q = query.value.trim().toLowerCase();
      if (!q) return commands.value;
      return commands.value.filter((c) => c.title.toLowerCase().includes(q));
    });
    watch(filtered, () => {
      activeIdx.value = 0;
    });
    function exec(cmd) {
      palette.close();
      query.value = "";
      cmd.run();
    }
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K") && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        palette.toggle();
        return;
      }
      if (!palette.isOpen.value) return;
      if (e.key === "Escape") {
        if (escScope && isEscTop(escScope)) {
          e.preventDefault();
          palette.close();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx.value = Math.min(activeIdx.value + 1, filtered.value.length - 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx.value = Math.max(activeIdx.value - 1, 0);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered.value[activeIdx.value];
        if (cmd) exec(cmd);
      }
    };
    watch(
      () => palette.isOpen.value,
      async (open) => {
        if (open) {
          escScope = pushEscScope();
          query.value = "";
          activeIdx.value = 0;
          await nextTick();
          inputRef.value?.focus();
        } else if (escScope) {
          popEscScope(escScope);
          escScope = null;
        }
      }
    );
    onMounted(() => {
      window.addEventListener("keydown", onKeyDown);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeyDown);
      if (escScope) {
        popEscScope(escScope);
        escScope = null;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        unref(palette).isOpen.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "fixed inset-0 z-[1200] flex items-start justify-center bg-overlay pt-[14vh] backdrop-blur-[2px]",
          onClick: _cache[1] || (_cache[1] = withModifiers(($event) => unref(palette).close(), ["self"]))
        }, [
          createBaseVNode("div", _hoisted_1$7, [
            createBaseVNode("div", _hoisted_2$7, [
              createVNode(_sfc_main$8, {
                icon: "ic_search",
                size: 16,
                class: "text-fg-muted"
              }),
              withDirectives(createBaseVNode("input", {
                ref_key: "inputRef",
                ref: inputRef,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => query.value = $event),
                placeholder: "搜索命令、跳转视图…",
                class: "flex-1 bg-transparent text-sm text-fg-primary outline-none placeholder:text-fg-muted"
              }, null, 512), [
                [vModelText, query.value]
              ]),
              _cache[2] || (_cache[2] = createBaseVNode("kbd", { class: "rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-fg-muted" }, "ESC", -1))
            ]),
            createBaseVNode("ul", _hoisted_3$5, [
              filtered.value.length === 0 ? (openBlock(), createElementBlock("li", _hoisted_4$3, " 没有匹配的命令 ")) : createCommentVNode("", true),
              (openBlock(true), createElementBlock(Fragment, null, renderList(filtered.value, (cmd, idx) => {
                return openBlock(), createElementBlock("li", {
                  key: cmd.id
                }, [
                  createBaseVNode("button", {
                    type: "button",
                    class: normalizeClass([
                      "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors duration-instant",
                      idx === activeIdx.value ? "bg-brand-500/12 text-fg-brand" : "text-fg-primary hover:bg-surface-hover"
                    ]),
                    onMouseenter: ($event) => activeIdx.value = idx,
                    onClick: ($event) => exec(cmd)
                  }, [
                    createBaseVNode("span", _hoisted_6$1, toDisplayString(cmd.title), 1),
                    cmd.hint ? (openBlock(), createElementBlock("span", _hoisted_7$1, toDisplayString(cmd.hint), 1)) : createCommentVNode("", true)
                  ], 42, _hoisted_5$1)
                ]);
              }), 128))
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
}
