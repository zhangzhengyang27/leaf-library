/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(AboutView-DADdHq1e.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main = /* @__PURE__ */ defineComponent(
*/
{
  __name: "AboutView",
  setup(__props) {
    const router = useRouter();
    const goBack = () => {
      router.push("/photos").catch(() => {
      });
    };
    const modules = [
      { icon: "ic_camera", label: "截图" },
      { icon: "ic_video", label: "屏幕录制" },
      { icon: "context-menu/ic-developer", label: "实验台" },
      { icon: "ic_clock", label: "番茄钟" },
      { icon: "ic_photo", label: "图片管理" },
      { icon: "ic_texture", label: "壁纸" },
      { icon: "ic_grid", label: "图标" },
      { icon: "ic_search", label: "快速搜索" }
    ];
    const stack = ["Electron", "Vue 3", "TypeScript", "Tailwind CSS", "better-sqlite3", "electron-vite"];
    const appVersion = ref("1.0.0");
    onMounted(async () => {
      try {
        appVersion.value = await window.api.update.getCurrentVersion();
      } catch {
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("button", {
          type: "button",
          class: "mb-6 flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary focus-visible:shadow-ring-focus focus-visible:outline-none",
          onClick: goBack
        }, [
          createVNode(_sfc_main$1, { icon: "ic-modal-back" }),
          _cache[0] || (_cache[0] = createBaseVNode("span", null, "返回素材库", -1))
        ]),
        createBaseVNode("div", _hoisted_2, [
          _cache[2] || (_cache[2] = createBaseVNode("div", {
            class: "pointer-events-none absolute inset-0 bg-[radial-gradient(600px_200px_at_20%_0%,var(--brand-glow),transparent_60%)] opacity-40",
            "aria-hidden": "true"
          }, null, -1)),
          _cache[3] || (_cache[3] = createBaseVNode("div", {
            class: "pointer-events-none absolute inset-x-0 top-0 h-px bg-glass-highlight",
            "aria-hidden": "true"
          }, null, -1)),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              _cache[1] || (_cache[1] = createBaseVNode("div", { class: "flex size-16 items-center justify-center rounded-lg border border-line-subtle bg-surface-2 text-4xl shadow-xs" }, " 🌿 ", -1)),
              createBaseVNode("div", null, [
                createBaseVNode("div", _hoisted_5, [
                  createBaseVNode("h1", { class: "text-xl font-semibold tracking-tight text-fg-primary" }, toDisplayString(appName)),
                  createVNode(_sfc_main$2, { variant: "brand" }, {
                    default: withCtx(() => [
                      createTextVNode("v" + toDisplayString(appVersion.value), 1)
                    ]),
                    _: 1
                  })
                ]),
                createBaseVNode("p", { class: "mt-0.5 text-sm text-fg-tertiary" }, toDisplayString(tagline))
              ])
            ]),
            createBaseVNode("p", { class: "text-sm leading-relaxed text-fg-secondary" }, toDisplayString(description))
          ])
        ]),
        createBaseVNode("section", _hoisted_6, [
          _cache[4] || (_cache[4] = createBaseVNode("h2", { class: "mb-3 text-xs font-medium tracking-wider text-fg-muted uppercase" }, "1.0 模块（8）", -1)),
          createBaseVNode("div", _hoisted_7, [
            (openBlock(), createElementBlock(Fragment, null, renderList(modules, (m) => {
              return createBaseVNode("div", {
                key: m.label,
                class: "flex items-center gap-2 rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-xs text-fg-secondary"
              }, [
                createVNode(_sfc_main$1, {
                  icon: m.icon,
                  size: 14,
                  class: "text-fg-tertiary"
                }, null, 8, ["icon"]),
                createBaseVNode("span", null, toDisplayString(m.label), 1)
              ]);
            }), 64))
          ])
        ]),
        _cache[6] || (_cache[6] = createBaseVNode("section", { class: "mb-10" }, [
          createBaseVNode("h2", { class: "mb-3 text-xs font-medium tracking-wider text-fg-muted uppercase" }, "相关"),
          createBaseVNode("div", { class: "rounded-md border border-line-subtle bg-surface-1 p-4 text-xs text-fg-tertiary" }, " 本地优先的开源素材管理应用，数据全部存储在本机。接入 GitHub 后，仓库与文档链接将在此显示。 ")
        ], -1)),
        createBaseVNode("section", _hoisted_8, [
          _cache[5] || (_cache[5] = createBaseVNode("h2", { class: "mb-3 text-xs font-medium tracking-wider text-fg-muted uppercase" }, "技术栈", -1)),
          createBaseVNode("div", _hoisted_9, [
            (openBlock(), createElementBlock(Fragment, null, renderList(stack, (s) => {
              return createBaseVNode("span", {
                key: s,
                class: "rounded-md border border-line-subtle bg-surface-hover px-2.5 py-1 font-mono text-xs text-fg-secondary"
              }, toDisplayString(s), 1);
            }), 64))
          ])
        ]),
        createBaseVNode("p", _hoisted_10, " v" + toDisplayString(appVersion.value) + " · MIT License · Made with care. ", 1)
      ]);
    };
  }
}
