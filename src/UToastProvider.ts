/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-C_4vKAXg.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$6 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "UToastProvider",
  setup(__props) {
    const { items, dismiss: dismiss2 } = useToast();
    const handleAction = (t) => {
      t.action?.onClick();
      dismiss2(t.id);
    };
    const iconFor = (kind) => {
      switch (kind) {
        case "success":
          return "M20 6 9 17l-5-5";
        case "error":
          return "M18 6 6 18M6 6l12 12";
        case "warning":
          return "M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z";
        case "loading":
          return "";
        default:
          return "M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z";
      }
    };
    const accentFor = (kind) => {
      switch (kind) {
        case "success":
          return "text-success";
        case "error":
          return "text-danger";
        case "warning":
          return "text-warning";
        default:
          return "text-brand-500";
      }
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createBaseVNode("div", _hoisted_1$6, [
          createVNode(TransitionGroup, { name: "utoast" }, {
            default: withCtx(() => [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(items), (t) => {
                return openBlock(), createElementBlock("div", {
                  key: t.id,
                  class: "pointer-events-auto flex items-center gap-2 rounded-lg border border-line-default bg-glass-bg-strong py-2 pl-3 pr-2 shadow-lg backdrop-blur-[var(--glass-blur)]"
                }, [
                  t.kind === "loading" ? (openBlock(), createElementBlock("span", _hoisted_2$6, [..._cache[0] || (_cache[0] = [
                    createBaseVNode("svg", {
                      class: "size-4 animate-spin text-brand-500",
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
                    ], -1)
                  ])])) : (openBlock(), createElementBlock("svg", {
                    key: 1,
                    class: normalizeClass(["shrink-0", accentFor(t.kind)]),
                    width: "16",
                    height: "16",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    "stroke-width": "2"
                  }, [
                    createBaseVNode("path", {
                      d: iconFor(t.kind),
                      "stroke-linecap": "round",
                      "stroke-linejoin": "round"
                    }, null, 8, _hoisted_3$4)
                  ], 2)),
                  createBaseVNode("span", _hoisted_4$2, toDisplayString(t.title), 1),
                  t.description ? (openBlock(), createElementBlock("span", _hoisted_5, toDisplayString(t.description), 1)) : createCommentVNode("", true),
                  t.action ? (openBlock(), createElementBlock("button", {
                    key: 3,
                    type: "button",
                    class: "shrink-0 text-sm font-medium text-brand-500 transition-colors hover:text-brand-400",
                    onClick: ($event) => handleAction(t)
                  }, toDisplayString(t.action.label), 9, _hoisted_6)) : createCommentVNode("", true),
                  createBaseVNode("button", {
                    type: "button",
                    class: "ml-1 shrink-0 text-fg-muted transition-colors hover:text-fg-primary",
                    "aria-label": "关闭",
                    onClick: ($event) => unref(dismiss2)(t.id)
                  }, [..._cache[1] || (_cache[1] = [
                    createBaseVNode("svg", {
                      class: "size-3.5",
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
                  ])], 8, _hoisted_7)
                ]);
              }), 128))
            ]),
            _: 1
          })
        ])
      ]);
    };
  }
}
