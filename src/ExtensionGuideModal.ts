/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$2 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "ExtensionGuideModal",
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const toast2 = useToast();
    const extDir = ref(null);
    const port = ref(null);
    const token = ref("");
    const copyState = ref("");
    onMounted(async () => {
      try {
        extDir.value = await window.api.system.getExtensionDir();
      } catch {
        extDir.value = null;
      }
      try {
        const cfg = await window.api.photos.clipServer.getConfig();
        port.value = cfg.port;
        token.value = cfg.token ?? "";
      } catch {
      }
    });
    function reveal() {
      if (extDir.value) void window.api.photos.showInFolder(extDir.value);
    }
    async function copyToken() {
      const ok = await window.api.photos.copyText(token.value);
      if (ok) {
        copyState.value = "Token 已复制，粘贴到扩展设置即可";
        toast2.success("Token 已复制");
      } else {
        toast2.error("复制失败");
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": true,
        size: "md",
        "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [
          createBaseVNode("span", _hoisted_1$2, [
            createVNode(_sfc_main$L, { icon: "ic_earth" }),
            _cache[2] || (_cache[2] = createTextVNode(" 安装浏览器扩展（Chrome / Edge） ", -1))
          ])
        ]),
        footer: withCtx(() => [
          createVNode(_sfc_main$N, {
            variant: "ghost",
            onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("close"))
          }, {
            default: withCtx(() => [..._cache[8] || (_cache[8] = [
              createTextVNode("关闭", -1)
            ])]),
            _: 1
          }),
          createVNode(_sfc_main$N, {
            variant: "secondary",
            disabled: !extDir.value,
            onClick: reveal
          }, {
            default: withCtx(() => [..._cache[9] || (_cache[9] = [
              createTextVNode("在访达中显示", -1)
            ])]),
            _: 1
          }, 8, ["disabled"]),
          createVNode(_sfc_main$N, {
            variant: "primary",
            disabled: !token.value,
            onClick: copyToken
          }, {
            default: withCtx(() => [..._cache[10] || (_cache[10] = [
              createTextVNode("复制 Token", -1)
            ])]),
            _: 1
          }, 8, ["disabled"])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_2$2, [
            createBaseVNode("ol", _hoisted_3$2, [
              _cache[7] || (_cache[7] = createBaseVNode("li", { class: "flex gap-2.5" }, [
                createBaseVNode("span", { class: "step-no" }, "1"),
                createBaseVNode("span", null, [
                  createTextVNode(" Chrome 打开 "),
                  createBaseVNode("code", { class: "rounded bg-surface-hover px-1" }, "chrome://extensions"),
                  createTextVNode("， 右上角开启「开发者模式」 ")
                ])
              ], -1)),
              createBaseVNode("li", _hoisted_4$1, [
                _cache[4] || (_cache[4] = createBaseVNode("span", { class: "step-no" }, "2", -1)),
                createBaseVNode("span", _hoisted_5$1, [
                  _cache[3] || (_cache[3] = createTextVNode(" 点「加载已解压的扩展程序」，选择 Leaf 的扩展文件夹 ", -1)),
                  createBaseVNode("code", {
                    class: "block truncate rounded bg-surface-hover px-1 py-0.5 text-xs",
                    title: extDir.value ?? ""
                  }, toDisplayString(extDir.value ?? "（未找到扩展目录，开发版运行 Leaf 后重试）"), 9, _hoisted_6$1)
                ])
              ]),
              createBaseVNode("li", _hoisted_7$1, [
                _cache[6] || (_cache[6] = createBaseVNode("span", { class: "step-no" }, "3", -1)),
                createBaseVNode("span", _hoisted_8$1, [
                  _cache[5] || (_cache[5] = createTextVNode(" 点浏览器工具栏的 Leaf 图标 → 「设置」，粘贴连接信息： ", -1)),
                  createBaseVNode("code", _hoisted_9$1, " 地址 http://127.0.0.1:" + toDisplayString(port.value ?? "—"), 1)
                ])
              ])
            ]),
            copyState.value ? (openBlock(), createElementBlock("p", _hoisted_10$1, toDisplayString(copyState.value), 1)) : createCommentVNode("", true)
          ])
        ]),
        _: 1
      });
    };
  }
}
