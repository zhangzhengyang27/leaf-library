/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$y = /* @__PURE__ */ defineComponent(
*/
{
  __name: "NotificationCenter",
  setup(__props) {
    const notif = useNotifications();
    const open = ref(false);
    const rootRef = ref(null);
    function toggle() {
      open.value = !open.value;
      if (open.value) notif.markAllRead();
    }
    function onDocDown(e64) {
      if (open.value && rootRef.value && !rootRef.value.contains(e64.target)) {
        open.value = false;
      }
    }
    function fmtTime(ts2) {
      const diff = Date.now() - ts2;
      if (diff < 6e4) return "刚刚";
      if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
      if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
      const d2 = new Date(ts2);
      return `${d2.getMonth() + 1}月${d2.getDate()}日`;
    }
    function iconOf(item) {
      if (item.kind === "update") return "ic_refresh";
      return item.title.includes("失败") ? "ic-modal-status-error" : "ic-modal-status-success";
    }
    function colorOf(item) {
      if (item.kind === "update") return "text-sky-500";
      return item.title.includes("失败") ? "text-danger" : "text-emerald-500";
    }
    onMounted(() => {
      notif.bind();
      document.addEventListener("mousedown", onDocDown, true);
    });
    onBeforeUnmount(() => {
      document.removeEventListener("mousedown", onDocDown, true);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "rootRef",
        ref: rootRef,
        class: "relative"
      }, [
        createBaseVNode("button", {
          type: "button",
          class: normalizeClass(iconBtn$1),
          "aria-label": unref(notif).hasUnread.value ? `通知（${unref(notif).unreadCount.value} 条未读）` : "通知",
          onClick: toggle
        }, [
          createBaseVNode("span", _hoisted_2$y, [
            createVNode(_sfc_main$L, { icon: "ic_notification" }),
            unref(notif).hasUnread.value ? (openBlock(), createElementBlock("span", _hoisted_3$u, toDisplayString(unref(notif).unreadCount.value > 9 ? "9+" : unref(notif).unreadCount.value), 1)) : createCommentVNode("", true)
          ])
        ], 8, _hoisted_1$y),
        open.value ? (openBlock(), createElementBlock("div", _hoisted_4$r, [
          createBaseVNode("header", _hoisted_5$r, [
            _cache[1] || (_cache[1] = createBaseVNode("span", { class: "text-xs font-semibold text-fg-primary" }, "通知", -1)),
            createBaseVNode("div", _hoisted_6$r, [
              createBaseVNode("button", {
                type: "button",
                class: "text-[10px] text-fg-muted transition-colors hover:text-fg-primary",
                disabled: unref(notif).items.value.length === 0,
                onClick: _cache[0] || (_cache[0] = //@ts-ignore
                (...args) => unref(notif).clearAll && unref(notif).clearAll(...args))
              }, " 清空 ", 8, _hoisted_7$o)
            ])
          ]),
          createBaseVNode("div", _hoisted_8$m, [
            unref(notif).items.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_9$j, " 暂无通知。素材处理完成、发现新版本时会出现在这里。 ")) : (openBlock(), createElementBlock("ul", _hoisted_10$j, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(notif).items.value, (item) => {
                return openBlock(), createElementBlock("li", {
                  key: item.id
                }, [
                  createBaseVNode("button", {
                    type: "button",
                    class: normalizeClass(["flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors duration-instant hover:bg-surface-hover", item.read ? "opacity-60" : ""]),
                    onClick: ($event) => unref(notif).markRead(item.id)
                  }, [
                    createBaseVNode("span", {
                      class: normalizeClass(["mt-0.5 shrink-0", colorOf(item)])
                    }, [
                      createVNode(_sfc_main$L, {
                        icon: iconOf(item)
                      }, null, 8, ["icon"])
                    ], 2),
                    createBaseVNode("span", _hoisted_12$f, [
                      createBaseVNode("span", _hoisted_13$e, toDisplayString(item.title), 1),
                      item.description ? (openBlock(), createElementBlock("span", {
                        key: 0,
                        class: "mt-0.5 block truncate text-[11px] text-fg-tertiary",
                        title: item.description
                      }, toDisplayString(item.description), 9, _hoisted_14$d)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("span", _hoisted_15$d, toDisplayString(fmtTime(item.ts)), 1)
                  ], 10, _hoisted_11$f)
                ]);
              }), 128))
            ]))
          ])
        ])) : createCommentVNode("", true)
      ], 512);
    };
  }
}
