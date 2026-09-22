/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$b = /* @__PURE__ */ defineComponent(
*/
{
  __name: "LockModal",
  emits: ["close", "changed", "lock"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const toast2 = useToast();
    const enabled = ref(false);
    const password = ref("");
    const confirm = ref("");
    const current = ref("");
    const busy = ref(false);
    onMounted(async () => {
      enabled.value = await window.api.photos.lockIsEnabled();
    });
    async function handleSet() {
      if (!password.value || password.value !== confirm.value) return;
      busy.value = true;
      try {
        await window.api.photos.lockSetPassword(password.value);
        toast2.success("密码锁已启用");
        emit("changed");
        emit("close");
      } catch (error2) {
        toast2.error("启用失败", { description: error2.message });
      } finally {
        busy.value = false;
      }
    }
    async function handleRemove() {
      busy.value = true;
      try {
        const ok = await window.api.photos.lockClear(current.value);
        if (!ok) {
          toast2.error("密码不正确");
          return;
        }
        toast2.success("密码锁已移除");
        emit("changed");
        emit("close");
      } catch (error2) {
        toast2.error("移除失败", { description: error2.message });
      } finally {
        busy.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": true,
        size: "sm",
        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [..._cache[6] || (_cache[6] = [
          createBaseVNode("span", { class: "flex items-center gap-2" }, [
            createBaseVNode("span", null, "🔒"),
            createTextVNode(" 素材库密码 ")
          ], -1)
        ])]),
        footer: withCtx(() => [
          createVNode(_sfc_main$N, {
            variant: "ghost",
            onClick: _cache[4] || (_cache[4] = ($event) => _ctx.$emit("close"))
          }, {
            default: withCtx(() => [..._cache[13] || (_cache[13] = [
              createTextVNode("关闭", -1)
            ])]),
            _: 1
          }),
          !enabled.value ? (openBlock(), createBlock(_sfc_main$N, {
            key: 0,
            variant: "primary",
            disabled: !password.value || password.value !== confirm.value,
            loading: busy.value,
            onClick: handleSet
          }, {
            default: withCtx(() => [..._cache[14] || (_cache[14] = [
              createTextVNode(" 启用 ", -1)
            ])]),
            _: 1
          }, 8, ["disabled", "loading"])) : createCommentVNode("", true)
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$b, [
            !enabled.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              createBaseVNode("div", null, [
                _cache[7] || (_cache[7] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "设置密码", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => password.value = $event),
                  type: "password",
                  placeholder: "下次打开素材库需输入",
                  class: "w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
                }, null, 512), [
                  [vModelText, password.value]
                ])
              ]),
              createBaseVNode("div", null, [
                _cache[8] || (_cache[8] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "确认密码", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => confirm.value = $event),
                  type: "password",
                  class: "w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500",
                  onKeyup: withKeys(handleSet, ["enter"])
                }, null, 544), [
                  [vModelText, confirm.value]
                ])
              ]),
              _cache[9] || (_cache[9] = createBaseVNode("p", { class: "text-xs text-fg-muted" }, " 密码经系统钥匙串（Keychain/DPAPI）加密存储；仅锁定素材库视图，不加密素材文件本身。 ", -1))
            ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              createBaseVNode("div", null, [
                _cache[10] || (_cache[10] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "输入当前密码以移除密码锁", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => current.value = $event),
                  type: "password",
                  class: "w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500",
                  onKeyup: withKeys(handleRemove, ["enter"])
                }, null, 544), [
                  [vModelText, current.value]
                ])
              ]),
              createBaseVNode("div", _hoisted_2$b, [
                createVNode(_sfc_main$N, {
                  variant: "primary",
                  size: "sm",
                  onClick: _cache[3] || (_cache[3] = ($event) => _ctx.$emit("lock"))
                }, {
                  default: withCtx(() => [..._cache[11] || (_cache[11] = [
                    createTextVNode("立即锁定", -1)
                  ])]),
                  _: 1
                }),
                createVNode(_sfc_main$N, {
                  variant: "danger",
                  size: "sm",
                  loading: busy.value,
                  onClick: handleRemove
                }, {
                  default: withCtx(() => [..._cache[12] || (_cache[12] = [
                    createTextVNode("移除密码锁", -1)
                  ])]),
                  _: 1
                }, 8, ["loading"])
              ])
            ], 64))
          ])
        ]),
        _: 1
      });
    };
  }
}
