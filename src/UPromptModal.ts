/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-C_4vKAXg.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$1 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "UPromptModal",
  setup(__props) {
    const { pendingPrompt: pendingPrompt2 } = useDialogs();
    const inputRef = ref(null);
    const value = ref("");
    const submitting = ref(false);
    watch(pendingPrompt2, async (req) => {
      if (req) {
        value.value = req.initialValue;
        await nextTick();
        inputRef.value?.focus();
        inputRef.value?.select();
      }
    });
    async function submit() {
      const req = pendingPrompt2.value;
      if (!req || submitting.value) return;
      submitting.value = true;
      try {
        await req.onSubmit(value.value);
        pendingPrompt2.value = null;
      } catch (error) {
        useToast().error("操作失败", { description: error.message });
      } finally {
        submitting.value = false;
      }
    }
    function cancel() {
      pendingPrompt2.value = null;
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": unref(pendingPrompt2) !== null,
        size: "sm",
        "onUpdate:modelValue": cancel
      }, {
        title: withCtx(() => [
          createBaseVNode("h3", _hoisted_1$1, toDisplayString(unref(pendingPrompt2)?.title), 1)
        ]),
        footer: withCtx(() => [
          createVNode(_sfc_main$4, {
            variant: "ghost",
            onClick: cancel
          }, {
            default: withCtx(() => [..._cache[1] || (_cache[1] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_sfc_main$4, {
            variant: "primary",
            loading: submitting.value,
            onClick: submit
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(unref(pendingPrompt2)?.confirmLabel), 1)
            ]),
            _: 1
          }, 8, ["loading"])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_2$1, [
            createBaseVNode("label", _hoisted_3$1, toDisplayString(unref(pendingPrompt2)?.label), 1),
            withDirectives(createBaseVNode("input", {
              ref_key: "inputRef",
              ref: inputRef,
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => value.value = $event),
              type: "text",
              class: "rounded-md border border-line-default bg-surface-1 h-8 px-3 text-sm text-fg-primary focus:outline-none focus:border-brand-500",
              onKeydown: withKeys(withModifiers(submit, ["prevent"]), ["enter"])
            }, null, 40, _hoisted_4), [
              [vModelText, value.value]
            ])
          ])
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
}
