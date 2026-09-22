/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-C_4vKAXg.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$2 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "UModal",
  props: {
    modelValue: { type: Boolean },
    title: { default: "" },
    size: { default: "md" },
    closeOnOverlay: { type: Boolean, default: true },
    closeOnEsc: { type: Boolean, default: true }
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const panelRef = ref(null);
    let escScope = null;
    let lastFocused = null;
    const close = () => {
      emit("update:modelValue", false);
    };
    const onOverlayClick = () => {
      if (props.closeOnOverlay) close();
    };
    const onKeydown = (e) => {
      if (!props.modelValue) return;
      if (e.key === "Escape") {
        if (props.closeOnEsc && escScope && isEscTop(escScope)) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        return;
      }
      if (e.key === "Tab" && panelRef.value) {
        const focusables = panelRef.value.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !panelRef.value.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    onMounted(() => window.addEventListener("keydown", onKeydown, true));
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeydown, true);
      if (escScope) popEscScope(escScope);
      escScope = null;
    });
    watch(
      () => props.modelValue,
      (open) => {
        if (open) {
          lastFocused = document.activeElement;
          if (!escScope) escScope = pushEscScope();
          requestAnimationFrame(() => {
            const panel = panelRef.value;
            if (!panel) return;
            if (!panel.contains(document.activeElement)) panel.focus();
          });
        } else {
          if (escScope) popEscScope(escScope);
          escScope = null;
          void nextTick(() => {
            if (lastFocused instanceof HTMLElement && document.contains(lastFocused)) {
              lastFocused.focus();
            }
            lastFocused = null;
          });
        }
      }
    );
    const sizeCls = {
      sm: "max-w-sm",
      md: "max-w-lg",
      lg: "max-w-2xl"
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createVNode(Transition, { name: "umodal" }, {
          default: withCtx(() => [
            __props.modelValue ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "fixed inset-0 z-[1000] flex items-center justify-center p-6",
              onClick: withModifiers(onOverlayClick, ["self"])
            }, [
              _cache[2] || (_cache[2] = createBaseVNode("div", {
                class: "absolute inset-0 bg-overlay backdrop-blur-[2px]",
                "aria-hidden": "true"
              }, null, -1)),
              createBaseVNode("div", {
                ref_key: "panelRef",
                ref: panelRef,
                role: "dialog",
                "aria-modal": "true",
                tabindex: "-1",
                class: normalizeClass(["relative w-full overflow-hidden rounded-lg border border-line-default bg-surface-3 shadow-lg focus:outline-none", sizeCls[__props.size]])
              }, [
                _cache[1] || (_cache[1] = createBaseVNode("div", {
                  class: "pointer-events-none absolute inset-x-0 top-0 h-px bg-glass-highlight",
                  "aria-hidden": "true"
                }, null, -1)),
                __props.title || _ctx.$slots.title ? (openBlock(), createElementBlock("header", _hoisted_1$2, [
                  renderSlot(_ctx.$slots, "title", {}, () => [
                    createBaseVNode("h3", _hoisted_2$2, toDisplayString(__props.title), 1)
                  ], true),
                  createBaseVNode("button", {
                    type: "button",
                    class: "ml-auto flex size-7 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary",
                    "aria-label": "关闭",
                    onClick: close
                  }, [..._cache[0] || (_cache[0] = [
                    createBaseVNode("svg", {
                      class: "size-4",
                      viewBox: "0 0 24 24",
                      fill: "none",
                      stroke: "currentColor",
                      "stroke-width": "2"
                    }, [
                      createBaseVNode("path", {
                        d: "M18 6 6 18M6 6l12 12",
                        "stroke-linecap": "round"
                      })
                    ], -1)
                  ])])
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_3$2, [
                  renderSlot(_ctx.$slots, "default", {}, void 0, true)
                ]),
                _ctx.$slots.footer ? (openBlock(), createElementBlock("footer", _hoisted_4$1, [
                  renderSlot(_ctx.$slots, "footer", {}, void 0, true)
                ])) : createCommentVNode("", true)
              ], 2)
            ])) : createCommentVNode("", true)
          ]),
          _: 3
        })
      ]);
    };
  }
}
