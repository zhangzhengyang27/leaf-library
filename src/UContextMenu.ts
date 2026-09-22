/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$K = /* @__PURE__ */ defineComponent(
*/
{
  __name: "UContextMenu",
  setup(__props) {
    const { state: state2, close } = useContextMenu();
    const panelRef = ref(null);
    const pos = ref({ x: 0, y: 0 });
    const activeIndex = ref(-1);
    const query = ref("");
    const submenu = ref(null);
    const submenuRef = ref(null);
    function subWidth() {
      return submenu.value?.parent.grid ? SUB_GRID_W : SUB_W;
    }
    function visibleItems() {
      const s2 = state2.value;
      if (!s2) return [];
      const q3 = query.value.trim().toLowerCase();
      const all = s2.items;
      if (!s2.searchable || !q3) return all.map((item, index2) => ({ item, index: index2 }));
      const match = (it2) => !it2.divider && (it2.label ?? "").toLowerCase().includes(q3);
      return all.map((item, index2) => ({ item, index: index2 })).filter(({ item, index: index2 }) => {
        if (item.divider) {
          const prev = all[index2 - 1];
          const next = all[index2 + 1];
          return Boolean(prev && next && match(prev) && match(next));
        }
        return match(item);
      });
    }
    function pickableIndexes() {
      if (!state2.value) return [];
      return visibleItems().filter(({ item }) => !item.divider && !item.disabled && !item.colors && !item.children).map(({ index: index2 }) => index2);
    }
    function pick(item) {
      if (item.divider || item.disabled) return;
      const onPick = state2.value?.onPick;
      close();
      onPick?.(item.key);
    }
    function pickColor(item, dot) {
      const onPick = state2.value?.onPick;
      close();
      onPick?.(`color:${item.key}:${dot.key}`);
    }
    function openSubmenu(item, anchor) {
      const rect = anchor.getBoundingClientRect();
      const w2 = item.grid ? SUB_GRID_W : SUB_W;
      let x2 = rect.right - 4;
      let y2 = rect.top - 4;
      if (x2 + w2 > window.innerWidth - 8) x2 = Math.max(8, rect.left - w2 + 4);
      if (y2 + 240 > window.innerHeight - 8) y2 = Math.max(8, window.innerHeight - 248);
      submenu.value = { parent: item, parentKey: item.key, items: item.children ?? [], x: x2, y: y2 };
    }
    function onRowEnter(item, e64) {
      activeIndex.value = visibleItems().findIndex((p2) => p2.item.key === item.key);
      const anchor = e64.currentTarget;
      if (item.children && anchor) openSubmenu(item, anchor);
      else if (!item.children) submenu.value = null;
    }
    function pickSub(parent, child) {
      if (child.divider || child.disabled) return;
      const onPick = state2.value?.onPick;
      close();
      onPick?.(`sub:${parent.key}:${child.key}`);
    }
    async function place() {
      if (!state2.value) return;
      pos.value = { x: state2.value.x, y: state2.value.y };
      await nextTick();
      const el2 = panelRef.value;
      if (!el2) return;
      const rect = el2.getBoundingClientRect();
      let { x: x2, y: y2 } = pos.value;
      if (x2 + rect.width > window.innerWidth - 8) x2 = Math.max(8, x2 - rect.width);
      if (y2 + rect.height > window.innerHeight - 8) y2 = Math.max(8, y2 - rect.height);
      pos.value = { x: x2, y: y2 };
      resetActive();
    }
    function resetActive() {
      const pickable = pickableIndexes();
      activeIndex.value = pickable.includes(activeIndex.value) ? activeIndex.value : pickable[0] ?? -1;
    }
    function onKeydown(e64) {
      if (!state2.value) return;
      const pickable = pickableIndexes();
      if (e64.key === "Escape") {
        e64.preventDefault();
        e64.stopPropagation();
        close();
        return;
      }
      if (e64.key === "ArrowDown" || e64.key === "ArrowUp") {
        e64.preventDefault();
        e64.stopPropagation();
        if (pickable.length === 0) return;
        const cur = pickable.indexOf(activeIndex.value);
        const next = e64.key === "ArrowDown" ? pickable[(cur + 1) % pickable.length] : pickable[(cur - 1 + pickable.length) % pickable.length];
        activeIndex.value = next;
        return;
      }
      if (e64.key === "Enter") {
        e64.preventDefault();
        e64.stopPropagation();
        const pickable2 = pickableIndexes();
        if (pickable2.length === 0) return;
        const target = pickable2.includes(activeIndex.value) ? activeIndex.value : pickable2[0];
        const item = state2.value.items[target];
        if (item) pick(item);
      }
    }
    function onWindowMouseDown(e64) {
      if (!state2.value) return;
      if (panelRef.value && panelRef.value.contains(e64.target)) return;
      if (submenu.value && submenuRef.value && submenuRef.value.contains(e64.target)) return;
      close();
    }
    function onWindowContextMenu(e64) {
      if (state2.value) close();
    }
    watch(state2, (s2) => {
      query.value = "";
      submenu.value = null;
      if (s2) void place();
    });
    watch(query, () => {
      submenu.value = null;
      void place();
    });
    onMounted(() => {
      window.addEventListener("keydown", onKeydown, true);
      window.addEventListener("mousedown", onWindowMouseDown, true);
      window.addEventListener("contextmenu", onWindowContextMenu, true);
      window.addEventListener("resize", close);
      window.addEventListener("blur", close);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("mousedown", onWindowMouseDown, true);
      window.removeEventListener("contextmenu", onWindowContextMenu, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        unref(state2) ? (openBlock(), createElementBlock("div", {
          key: 0,
          ref_key: "panelRef",
          ref: panelRef,
          role: "menu",
          class: "fixed z-[1300] min-w-[176px] overflow-hidden rounded-lg border border-line-default bg-surface-3 py-1 shadow-md",
          style: normalizeStyle({ left: `${pos.value.x}px`, top: `${pos.value.y}px` }),
          onMousedown: _cache[1] || (_cache[1] = withModifiers(() => {
          }, ["stop"])),
          onContextmenu: _cache[2] || (_cache[2] = withModifiers(() => {
          }, ["prevent"]))
        }, [
          unref(state2).searchable ? (openBlock(), createElementBlock("div", _hoisted_1$K, [
            createBaseVNode("div", _hoisted_2$J, [
              createVNode(_sfc_main$L, {
                icon: "ic_search",
                size: 12,
                class: "shrink-0 text-fg-muted"
              }),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => query.value = $event),
                type: "text",
                placeholder: "搜索...",
                class: "h-5 w-full bg-transparent text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
              }, null, 512), [
                [vModelText, query.value]
              ])
            ])
          ])) : createCommentVNode("", true),
          (openBlock(true), createElementBlock(Fragment, null, renderList(visibleItems(), (pair) => {
            return openBlock(), createElementBlock(Fragment, {
              key: `${pair.item.key}-${pair.index}`
            }, [
              pair.item.divider ? (openBlock(), createElementBlock("div", _hoisted_3$D)) : pair.item.colors ? (openBlock(), createElementBlock("div", {
                key: 1,
                class: normalizeClass(["menu-item mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-sm px-2.5 py-1.5", activeIndex.value === pair.index ? "is-active" : ""]),
                onMouseenter: ($event) => onRowEnter(pair.item, $event)
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(pair.item.colors, (dot) => {
                  return openBlock(), createElementBlock("button", {
                    key: dot.key,
                    type: "button",
                    class: "size-3.5 shrink-0 rounded-full border border-black/20 transition-transform hover:scale-125",
                    style: normalizeStyle({ backgroundColor: dot.hex }),
                    "aria-label": dot.key,
                    title: dot.key,
                    onClick: ($event) => pickColor(pair.item, dot)
                  }, null, 12, _hoisted_5$A);
                }), 128))
              ], 42, _hoisted_4$A)) : (openBlock(), createElementBlock("button", {
                key: 2,
                type: "button",
                role: "menuitem",
                disabled: pair.item.disabled,
                class: normalizeClass(["menu-item mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors duration-instant disabled:cursor-not-allowed disabled:opacity-40", [
                  pair.item.danger ? "text-danger" : "text-fg-primary",
                  activeIndex.value === pair.index ? "is-active" : ""
                ]]),
                onClick: ($event) => pick(pair.item),
                onMouseenter: ($event) => onRowEnter(pair.item, $event)
              }, [
                pair.item.icon ? (openBlock(), createBlock(_sfc_main$L, {
                  key: 0,
                  icon: pair.item.icon,
                  class: normalizeClass(pair.item.danger ? "text-danger" : "text-fg-secondary")
                }, null, 8, ["icon", "class"])) : createCommentVNode("", true),
                createBaseVNode("span", _hoisted_7$v, toDisplayString(pair.item.label), 1),
                pair.item.shortcut ? (openBlock(), createElementBlock("span", _hoisted_8$t, toDisplayString(pair.item.shortcut), 1)) : createCommentVNode("", true),
                pair.item.checked ? (openBlock(), createBlock(_sfc_main$L, {
                  key: 2,
                  icon: "ic-check",
                  class: "text-brand-500"
                })) : createCommentVNode("", true),
                pair.item.children ? (openBlock(), createBlock(_sfc_main$L, {
                  key: 3,
                  icon: "ic-context-menu-arrow-right",
                  class: "text-fg-muted"
                })) : createCommentVNode("", true)
              ], 42, _hoisted_6$y))
            ], 64);
          }), 128))
        ], 36)) : createCommentVNode("", true),
        submenu.value ? (openBlock(), createElementBlock("div", {
          key: 1,
          ref_key: "submenuRef",
          ref: submenuRef,
          role: "menu",
          class: normalizeClass(["fixed z-[1310] max-h-[60vh] overflow-y-auto overflow-x-hidden rounded-lg border border-line-default bg-surface-3 py-1 shadow-md app-scroll", submenu.value.parent.grid ? "" : "min-w-[176px]"]),
          style: normalizeStyle({
            left: `${submenu.value.x}px`,
            top: `${submenu.value.y}px`,
            width: `${subWidth()}px`
          }),
          onMousedown: _cache[3] || (_cache[3] = withModifiers(() => {
          }, ["stop"])),
          onContextmenu: _cache[4] || (_cache[4] = withModifiers(() => {
          }, ["prevent"]))
        }, [
          submenu.value.parent.grid ? (openBlock(), createElementBlock("div", _hoisted_9$q, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(submenu.value.items, (child, ci2) => {
              return openBlock(), createElementBlock("button", {
                key: `${child.key}-${ci2}`,
                type: "button",
                role: "menuitem",
                class: normalizeClass([
                  "flex size-9 items-center justify-center rounded-md text-[19px] leading-none transition-colors hover:bg-surface-hover",
                  child.checked ? "bg-brand-500/15 ring-1 ring-brand-500" : child.disabled ? "cursor-not-allowed opacity-40" : ""
                ]),
                title: child.label,
                "aria-label": child.label,
                onClick: ($event) => pickSub(submenu.value.parent, child)
              }, [
                child.icon ? (openBlock(), createBlock(_sfc_main$L, {
                  key: 0,
                  icon: child.icon,
                  size: 16,
                  class: "text-fg-secondary"
                }, null, 8, ["icon"])) : child.key === "__none" ? (openBlock(), createElementBlock("span", _hoisted_11$k, "无")) : (openBlock(), createElementBlock("span", _hoisted_12$j, toDisplayString(child.label), 1))
              ], 10, _hoisted_10$q);
            }), 128))
          ])) : (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(submenu.value.items, (child, ci2) => {
            return openBlock(), createElementBlock(Fragment, {
              key: `${child.key}-${ci2}`
            }, [
              child.divider ? (openBlock(), createElementBlock("div", _hoisted_13$h)) : (openBlock(), createElementBlock("button", {
                key: 1,
                type: "button",
                role: "menuitem",
                disabled: child.disabled,
                class: normalizeClass(["menu-item mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors duration-instant disabled:cursor-not-allowed disabled:opacity-40", child.danger ? "text-danger" : "text-fg-primary"]),
                onClick: ($event) => pickSub(submenu.value.parent, child)
              }, [
                child.icon ? (openBlock(), createBlock(_sfc_main$L, {
                  key: 0,
                  icon: child.icon,
                  class: normalizeClass(child.danger ? "text-danger" : "text-fg-secondary")
                }, null, 8, ["icon", "class"])) : createCommentVNode("", true),
                createBaseVNode("span", _hoisted_15$f, toDisplayString(child.label), 1),
                child.checked ? (openBlock(), createBlock(_sfc_main$L, {
                  key: 1,
                  icon: "ic-check",
                  class: "text-brand-500"
                })) : createCommentVNode("", true)
              ], 10, _hoisted_14$g))
            ], 64);
          }), 128))
        ], 38)) : createCommentVNode("", true)
      ]);
    };
  }
}
