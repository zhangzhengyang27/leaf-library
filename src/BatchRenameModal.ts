/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$5 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "BatchRenameModal",
  props: {
    photos: {}
  },
  emits: ["close", "renamed"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const toast2 = useToast();
    const data = usePhotoData();
    const pattern = ref("");
    const start = ref(1);
    const findPattern = ref("");
    const findReplacement = ref("");
    const caseMode = ref("none");
    const CASE_MODES = [
      { id: "none", label: "不变", hint: "保持展开后的原样" },
      { id: "upper", label: "全大写", hint: "ABC" },
      { id: "lower", label: "全小写", hint: "abc" },
      { id: "title", label: "首字母大写", hint: "每个词首字母大写，其余不动" }
    ];
    const findError = computed(() => validateFindPattern(findPattern.value));
    const pad = ref(3);
    const renaming = ref(false);
    const patternInput = ref(null);
    const TOKENS = [
      { token: "{name}", hint: "原文件名（不含扩展名）" },
      { token: "{n}", hint: "序号（配合起始编号/位数）" },
      { token: "{date}", hint: "导入日期 YYYYMMDD" },
      { token: "{time}", hint: "导入时间 HHmmss" },
      { token: "{parent}", hint: "所在文件夹名" },
      { token: "{rand}", hint: "6 位随机串" }
    ];
    function insertToken(token) {
      const el2 = patternInput.value;
      const value = pattern.value;
      if (!el2) {
        pattern.value = value + token;
        return;
      }
      const s2 = el2.selectionStart ?? value.length;
      const e64 = el2.selectionEnd ?? s2;
      pattern.value = value.slice(0, s2) + token + value.slice(e64);
      void nextTick(() => {
        el2.focus();
        el2.setSelectionRange(s2 + token.length, s2 + token.length);
      });
    }
    const aiAsk = ref("");
    const aiBusy = ref(false);
    const aiError = ref("");
    async function handleAiPattern() {
      if (aiBusy.value || !aiAsk.value.trim()) return;
      aiBusy.value = true;
      aiError.value = "";
      try {
        const r2 = await window.api.ai.renamePattern(
          aiAsk.value,
          props.photos.map((p2) => p2.fileName)
        );
        if (!r2.ok) {
          aiError.value = r2.error;
          return;
        }
        pattern.value = r2.pattern;
      } catch (error2) {
        aiError.value = error2.message;
      } finally {
        aiBusy.value = false;
      }
    }
    const previewList = computed(() => props.photos.slice(0, 3));
    function renderBase(p2, i2) {
      return renderRenameBase(
        pattern.value,
        {
          fileName: p2.fileName,
          folderName: data.folders.value.find((f2) => f2.id === p2.folderId)?.name,
          importedAt: p2.importedAt,
          index: start.value + i2,
          pad: pad.value
        },
        { find: findPattern.value, replacement: findReplacement.value, caseMode: caseMode.value }
      );
    }
    function extOf(name) {
      const idx = name.lastIndexOf(".");
      return idx > 0 ? name.slice(idx) : "";
    }
    const previewNames = computed(
      () => previewList.value.map((p2, i2) => renderBase(p2, i2) + extOf(p2.fileName))
    );
    async function handleRename() {
      if (findError.value) {
        toast2.error("正则不合法，先修正再重命名", { description: findError.value });
        return;
      }
      renaming.value = true;
      try {
        const result2 = await window.api.photos.renamePhotos(
          props.photos.map((p2, i2) => ({ id: p2.id, name: renderBase(p2, i2) }))
        );
        if (result2.conflicts.length > 0) {
          toast2.warning(`已重命名 ${result2.renamed.length} 项，${result2.conflicts.length} 项因重名跳过`);
        } else {
          toast2.success(`已重命名 ${result2.renamed.length} 项`);
        }
        emit("renamed");
        emit("close");
      } catch (error2) {
        toast2.error("批量重命名失败", { description: error2.message });
      } finally {
        renaming.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": true,
        size: "md",
        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [
          createBaseVNode("span", _hoisted_1$5, [
            createVNode(_sfc_main$L, { icon: "context-menu/ic-rename" }),
            createTextVNode(" 批量重命名（" + toDisplayString(__props.photos.length) + " 项） ", 1)
          ])
        ]),
        footer: withCtx(() => [
          createVNode(_sfc_main$N, {
            variant: "ghost",
            onClick: _cache[6] || (_cache[6] = ($event) => _ctx.$emit("close"))
          }, {
            default: withCtx(() => [..._cache[17] || (_cache[17] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_sfc_main$N, {
            variant: "primary",
            disabled: !pattern.value.trim(),
            loading: renaming.value,
            onClick: handleRename
          }, {
            default: withCtx(() => [
              createTextVNode(" 重命名 " + toDisplayString(__props.photos.length) + " 项 ", 1)
            ]),
            _: 1
          }, 8, ["disabled", "loading"])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_2$5, [
            createBaseVNode("div", null, [
              _cache[8] || (_cache[8] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, " 命名模式（任意组合字面文本与变量，扩展名自动保留） ", -1)),
              withDirectives(createBaseVNode("input", {
                ref_key: "patternInput",
                ref: patternInput,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => pattern.value = $event),
                type: "text",
                placeholder: "例如：旅行-{date}-{n}",
                class: "w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
              }, null, 512), [
                [vModelText, pattern.value]
              ]),
              createBaseVNode("div", _hoisted_3$5, [
                (openBlock(), createElementBlock(Fragment, null, renderList(TOKENS, (t3) => {
                  return createBaseVNode("button", {
                    key: t3.token,
                    type: "button",
                    class: "rounded border border-line-subtle bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-fg-secondary transition-colors hover:border-brand-400 hover:text-brand-600",
                    title: t3.hint,
                    onClick: ($event) => insertToken(t3.token)
                  }, toDisplayString(t3.token), 9, _hoisted_4$4);
                }), 64))
              ])
            ]),
            createBaseVNode("div", _hoisted_5$4, [
              _cache[10] || (_cache[10] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "正则替换（作用于展开后的名字，支持 $1 捕获组）", -1)),
              createBaseVNode("div", _hoisted_6$4, [
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => findPattern.value = $event),
                  type: "text",
                  placeholder: "查找，如 ^IMG_",
                  class: normalizeClass(["h-8 min-w-0 flex-1 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500", findError.value ? "border-danger" : ""])
                }, null, 2), [
                  [vModelText, findPattern.value]
                ]),
                _cache[9] || (_cache[9] = createBaseVNode("span", { class: "text-[11px] text-fg-tertiary" }, "→", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => findReplacement.value = $event),
                  type: "text",
                  placeholder: "替换为，留空即删除",
                  class: "h-8 min-w-0 flex-1 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
                }, null, 512), [
                  [vModelText, findReplacement.value]
                ])
              ]),
              findError.value ? (openBlock(), createElementBlock("p", _hoisted_7$4, "正则不合法：" + toDisplayString(findError.value), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_8$2, [
              _cache[11] || (_cache[11] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "大小写", -1)),
              createBaseVNode("div", _hoisted_9$2, [
                (openBlock(), createElementBlock(Fragment, null, renderList(CASE_MODES, (m2) => {
                  return createBaseVNode("button", {
                    key: m2.id,
                    type: "button",
                    class: normalizeClass([
                      "rounded border px-2 py-0.5 text-[11px] transition-colors",
                      caseMode.value === m2.id ? "border-brand-400 bg-brand-50 text-brand-700 dark:text-brand-300" : "border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400"
                    ]),
                    title: m2.hint,
                    onClick: ($event) => caseMode.value = m2.id
                  }, toDisplayString(m2.label), 11, _hoisted_10$2);
                }), 64))
              ])
            ]),
            createBaseVNode("div", _hoisted_11, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => aiAsk.value = $event),
                type: "text",
                placeholder: "用一句话说规则，例如「前面加文件夹名，按导入日期编号 3 位」",
                class: "h-8 min-w-0 flex-1 rounded-md border border-line-default bg-surface-1 px-3 text-sm text-fg-primary focus:outline-none focus:border-brand-500",
                onKeyup: withKeys(handleAiPattern, ["enter"])
              }, null, 544), [
                [vModelText, aiAsk.value]
              ]),
              createVNode(_sfc_main$N, {
                size: "sm",
                variant: "secondary",
                loading: aiBusy.value,
                disabled: !aiAsk.value.trim(),
                onClick: handleAiPattern
              }, {
                default: withCtx(() => [..._cache[12] || (_cache[12] = [
                  createTextVNode("✨ 生成", -1)
                ])]),
                _: 1
              }, 8, ["loading", "disabled"])
            ]),
            aiError.value ? (openBlock(), createElementBlock("p", _hoisted_12, toDisplayString(aiError.value), 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("div", _hoisted_14, [
                _cache[13] || (_cache[13] = createBaseVNode("label", { class: "text-xs text-fg-muted" }, "起始编号", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => start.value = $event),
                  type: "number",
                  min: "0",
                  class: "w-20 px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [
                    vModelText,
                    start.value,
                    void 0,
                    { number: true }
                  ]
                ])
              ]),
              createBaseVNode("div", _hoisted_15, [
                _cache[14] || (_cache[14] = createBaseVNode("label", {
                  class: "text-xs text-fg-muted",
                  title: "{n} 补零位数"
                }, "编号位数", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => pad.value = $event),
                  type: "number",
                  min: "1",
                  max: "8",
                  class: "w-16 px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [
                    vModelText,
                    pad.value,
                    void 0,
                    { number: true }
                  ]
                ])
              ])
            ]),
            createBaseVNode("div", _hoisted_16, [
              _cache[15] || (_cache[15] = createBaseVNode("p", { class: "mb-1 text-fg-muted" }, "预览（前 3 项）：", -1)),
              (openBlock(true), createElementBlock(Fragment, null, renderList(previewList.value, (p2, i2) => {
                return openBlock(), createElementBlock("p", {
                  key: p2.id,
                  class: "truncate text-fg-secondary"
                }, [
                  createTextVNode(toDisplayString(p2.fileName) + " → ", 1),
                  createBaseVNode("span", _hoisted_17, toDisplayString(previewNames.value[i2]), 1)
                ]);
              }), 128))
            ]),
            _cache[16] || (_cache[16] = createBaseVNode("p", { class: "text-xs text-fg-muted" }, " ⚠️ 会直接重命名磁盘上的原文件；目标位置已有同名文件时该项自动跳过。 ", -1))
          ])
        ]),
        _: 1
      });
    };
  }
}
