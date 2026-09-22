/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$x = /* @__PURE__ */ defineComponent(
*/
{
  __name: "PluginManagerModal",
  props: {
    modelValue: { type: Boolean }
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const plugins = ref([]);
    const extraDir = ref("");
    const loading = ref(false);
    const marketTab = ref(false);
    const builtin = ref([]);
    const marketLoading = ref(false);
    async function load2() {
      loading.value = true;
      try {
        plugins.value = await window.api.plugins.list();
        extraDir.value = await window.api.plugins.getExtraDir();
      } catch (error2) {
        useToast().error("插件列表加载失败", { description: error2.message });
      } finally {
        loading.value = false;
      }
    }
    async function loadMarket() {
      marketLoading.value = true;
      try {
        builtin.value = await window.api.plugins.listBuiltin();
      } catch (error2) {
        useToast().error("插件市场加载失败", { description: error2.message });
      } finally {
        marketLoading.value = false;
      }
    }
    const installingId = ref(null);
    async function installBuiltin(id3) {
      if (installingId.value) return;
      installingId.value = id3;
      try {
        const res = await window.api.plugins.installBuiltin(id3);
        if (res.ok) {
          useToast().success("插件已安装");
          await load2();
        } else {
          useToast().error("安装失败", { description: res.error || "未知错误" });
        }
      } catch (error2) {
        useToast().error("安装失败", { description: error2.message });
      } finally {
        installingId.value = null;
      }
    }
    function showMarket() {
      marketTab.value = true;
      void loadMarket();
    }
    function isInstalled(id3) {
      return plugins.value.some((p2) => p2.id === id3);
    }
    async function pickExtraDir() {
      try {
        const list2 = await window.api.plugins.pickExtraDir();
        if (list2) {
          plugins.value = list2;
          extraDir.value = await window.api.plugins.getExtraDir();
          useToast().success("已加载自定义插件目录");
        }
      } catch (error2) {
        useToast().error("选择插件目录失败", { description: error2.message });
      }
    }
    async function clearExtraDir() {
      try {
        await window.api.plugins.setExtraDir("");
        await load2();
        useToast().success("已恢复默认插件目录");
      } catch (error2) {
        useToast().error("恢复默认目录失败", { description: error2.message });
      }
    }
    onMounted(load2);
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": props.modelValue,
        title: "插件",
        size: "md",
        "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => emit("update:modelValue", $event))
      }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$x, [
            createBaseVNode("div", _hoisted_2$x, [
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass([
                  "flex-1 rounded px-3 py-1 text-xs transition-colors",
                  !marketTab.value ? "bg-surface-1 text-fg-primary shadow-sm" : "text-fg-muted hover:text-fg-secondary"
                ]),
                onClick: _cache[0] || (_cache[0] = ($event) => marketTab.value = false)
              }, " 已安装 ", 2),
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass([
                  "flex-1 rounded px-3 py-1 text-xs transition-colors",
                  marketTab.value ? "bg-surface-1 text-fg-primary shadow-sm" : "text-fg-muted hover:text-fg-secondary"
                ]),
                onClick: showMarket
              }, " 插件市场 ", 2)
            ]),
            !marketTab.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              createBaseVNode("div", _hoisted_3$t, [
                createBaseVNode("span", _hoisted_4$q, " 已安装 " + toDisplayString(plugins.value.length) + " 个插件（本地目录加载，沙箱运行） ", 1),
                createVNode(_sfc_main$N, {
                  size: "sm",
                  variant: "ghost",
                  loading: loading.value,
                  onClick: load2
                }, {
                  default: withCtx(() => [..._cache[2] || (_cache[2] = [
                    createTextVNode("刷新", -1)
                  ])]),
                  _: 1
                }, 8, ["loading"])
              ]),
              plugins.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_5$q, [..._cache[3] || (_cache[3] = [
                createBaseVNode("div", { class: "text-2xl mb-2" }, "🧩", -1),
                createBaseVNode("p", { class: "text-xs text-fg-secondary" }, "还没有插件", -1),
                createBaseVNode("p", { class: "mt-1 text-[11px] text-fg-muted" }, [
                  createTextVNode(" 将插件目录放入 "),
                  createBaseVNode("code", { class: "rounded bg-surface-hover px-1" }, "userData/plugins/"),
                  createTextVNode(" 或添加自定义目录 ")
                ], -1)
              ])])) : (openBlock(), createElementBlock("div", _hoisted_6$q, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(plugins.value, (p2) => {
                  return openBlock(), createElementBlock("div", {
                    key: p2.id,
                    class: "flex items-center gap-2 rounded-md border border-line-subtle bg-surface-0 px-3 py-2"
                  }, [
                    createBaseVNode("span", _hoisted_7$n, [
                      createBaseVNode("span", _hoisted_8$l, toDisplayString(p2.name), 1),
                      createBaseVNode("span", _hoisted_9$i, toDisplayString(p2.id) + " · v" + toDisplayString(p2.version), 1),
                      p2.formats.length > 0 ? (openBlock(), createElementBlock("span", _hoisted_10$i, " 支持格式：" + toDisplayString(p2.formats.map((f2) => `.${f2}`).join(" ")), 1)) : createCommentVNode("", true)
                    ]),
                    createVNode(_sfc_main$O, { variant: "neutral" }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(unref(PLUGIN_CATEGORY_LABELS)[p2.category] ?? p2.category), 1)
                      ]),
                      _: 2
                    }, 1024)
                  ]);
                }), 128))
              ])),
              createBaseVNode("div", _hoisted_11$e, [
                _cache[7] || (_cache[7] = createBaseVNode("p", { class: "mb-1 text-xs font-medium text-fg-primary" }, "开发者选项 · 自定义插件目录", -1)),
                extraDir.value ? (openBlock(), createElementBlock("p", {
                  key: 0,
                  class: "mb-2 truncate text-[11px] text-fg-tertiary",
                  title: extraDir.value
                }, toDisplayString(extraDir.value), 9, _hoisted_12$e)) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_13$d, [
                  createVNode(_sfc_main$N, {
                    size: "sm",
                    variant: "secondary",
                    onClick: pickExtraDir
                  }, {
                    default: withCtx(() => [..._cache[4] || (_cache[4] = [
                      createTextVNode("选择目录", -1)
                    ])]),
                    _: 1
                  }),
                  extraDir.value ? (openBlock(), createBlock(_sfc_main$N, {
                    key: 0,
                    size: "sm",
                    variant: "ghost",
                    onClick: clearExtraDir
                  }, {
                    default: withCtx(() => [..._cache[5] || (_cache[5] = [
                      createTextVNode("恢复默认", -1)
                    ])]),
                    _: 1
                  })) : createCommentVNode("", true)
                ]),
                createBaseVNode("p", _hoisted_14$c, [
                  createVNode(_sfc_main$L, {
                    icon: "context-menu/ic-privacy",
                    size: 12
                  }),
                  _cache[6] || (_cache[6] = createTextVNode(" 插件运行在隔离沙箱中，仅可读取注入的素材数据，无法访问系统 ", -1))
                ])
              ])
            ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              createBaseVNode("div", _hoisted_15$c, [
                _cache[9] || (_cache[9] = createBaseVNode("span", { class: "text-xs text-fg-tertiary" }, "内置插件，点击安装即复制到 userData/plugins/", -1)),
                createVNode(_sfc_main$N, {
                  size: "sm",
                  variant: "ghost",
                  loading: marketLoading.value,
                  onClick: loadMarket
                }, {
                  default: withCtx(() => [..._cache[8] || (_cache[8] = [
                    createTextVNode(" 刷新 ", -1)
                  ])]),
                  _: 1
                }, 8, ["loading"])
              ]),
              builtin.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_16$b, [..._cache[10] || (_cache[10] = [
                createBaseVNode("div", { class: "text-2xl mb-2" }, "🧩", -1),
                createBaseVNode("p", { class: "text-xs text-fg-secondary" }, "暂无内置插件", -1)
              ])])) : (openBlock(), createElementBlock("div", _hoisted_17$9, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(builtin.value, (p2) => {
                  return openBlock(), createElementBlock("div", {
                    key: p2.id,
                    class: "flex items-center gap-2 rounded-md border border-line-subtle bg-surface-0 px-3 py-2"
                  }, [
                    createBaseVNode("span", _hoisted_18$8, [
                      createBaseVNode("span", _hoisted_19$7, toDisplayString(p2.name), 1),
                      createBaseVNode("span", _hoisted_20$7, "v" + toDisplayString(p2.version), 1),
                      p2.formats.length > 0 ? (openBlock(), createElementBlock("span", _hoisted_21$7, " 支持格式：" + toDisplayString(p2.formats.map((f2) => `.${f2}`).join(" ")), 1)) : createCommentVNode("", true)
                    ]),
                    createVNode(_sfc_main$O, { variant: "neutral" }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(unref(PLUGIN_CATEGORY_LABELS)[p2.category] ?? p2.category), 1)
                      ]),
                      _: 2
                    }, 1024),
                    createVNode(_sfc_main$N, {
                      size: "sm",
                      variant: "primary",
                      disabled: isInstalled(p2.id) || installingId.value === p2.id,
                      onClick: ($event) => installBuiltin(p2.id)
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(isInstalled(p2.id) ? "已安装" : "安装"), 1)
                      ]),
                      _: 2
                    }, 1032, ["disabled", "onClick"])
                  ]);
                }), 128))
              ]))
            ], 64))
          ])
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
}
