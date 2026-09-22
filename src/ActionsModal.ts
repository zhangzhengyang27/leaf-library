/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$w = /* @__PURE__ */ defineComponent(
*/
{
  __name: "ActionsModal",
  props: {
    modelValue: { type: Boolean }
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { macros: macros2, save, remove, runMacro } = useAssetMacros();
    const data = usePhotoData();
    const selection = usePhotoSelection();
    const close = () => emit("update:modelValue", false);
    const editing = ref(null);
    const nameDraft = ref("");
    const stepsDraft = ref([]);
    const STEP_LABELS = {
      rename: "重命名",
      addTags: "添加标签",
      rating: "评分",
      description: "备注",
      webp: "转换为 WebP",
      moveToFolder: "移入文件夹"
    };
    function startCreate() {
      editing.value = { id: `m-${Date.now()}`, name: "", steps: [] };
      nameDraft.value = "";
      stepsDraft.value = [];
    }
    function startEdit(m2) {
      editing.value = { id: m2.id, name: m2.name, steps: JSON.parse(JSON.stringify(m2.steps)) };
      nameDraft.value = m2.name;
      stepsDraft.value = JSON.parse(JSON.stringify(m2.steps));
    }
    function addStep(type) {
      const defaults = {
        rename: { type: "rename", pattern: "素材-{n}" },
        addTags: { type: "addTags", tags: "" },
        rating: { type: "rating", value: 5 },
        description: { type: "description", text: "" },
        webp: { type: "webp" },
        moveToFolder: { type: "moveToFolder", folderId: data.folders.value[0]?.id ?? "" }
      };
      stepsDraft.value.push(defaults[type]);
    }
    function stepSummary(s2) {
      switch (s2.type) {
        case "rename":
          return `重命名为「${s2.pattern}」`;
        case "addTags":
          return `添加标签 ${s2.tags || "（空）"}`;
        case "rating":
          return `评分 ${s2.value} ★`;
        case "description":
          return `备注「${s2.text || "（空）"}」`;
        case "webp":
          return "转换为 WebP";
        case "moveToFolder": {
          const f2 = data.folders.value.find((x2) => x2.id === s2.folderId);
          return `移入「${f2?.name ?? "未知文件夹"}」`;
        }
      }
    }
    function saveDraft() {
      if (!editing.value) return;
      const name = nameDraft.value.trim();
      if (!name || stepsDraft.value.length === 0) return;
      save({ id: editing.value.id, name, steps: stepsDraft.value });
      editing.value = null;
    }
    const selectedIds = computed(() => selection.selectedIds.value);
    async function run(m2) {
      const ok = await runMacro(m2, [...selectedIds.value]);
      if (ok) close();
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": __props.modelValue,
        title: "素材动作",
        size: "md",
        "onUpdate:modelValue": close
      }, {
        default: withCtx(() => [
          editing.value ? (openBlock(), createElementBlock("div", _hoisted_1$w, [
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => nameDraft.value = $event),
              type: "text",
              placeholder: "动作名称",
              class: "h-8 w-full rounded-md border border-line-default bg-surface-0 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
            }, null, 512), [
              [vModelText, nameDraft.value]
            ]),
            createBaseVNode("div", _hoisted_2$w, [
              _cache[4] || (_cache[4] = createBaseVNode("p", { class: "text-[11px] font-medium text-fg-secondary" }, "步骤（按序执行）", -1)),
              (openBlock(true), createElementBlock(Fragment, null, renderList(stepsDraft.value, (s2, i2) => {
                return openBlock(), createElementBlock("div", {
                  key: i2,
                  class: "flex items-center gap-1.5 rounded-md border border-line-default bg-surface-0 p-1.5"
                }, [
                  createBaseVNode("span", _hoisted_3$s, toDisplayString(STEP_LABELS[s2.type]), 1),
                  s2.type === "rename" ? withDirectives((openBlock(), createElementBlock("input", {
                    key: 0,
                    "onUpdate:modelValue": ($event) => s2.pattern = $event,
                    type: "text",
                    placeholder: "模式，{n} 为序号",
                    class: "h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1.5 text-[11px] text-fg-primary focus:outline-none"
                  }, null, 8, _hoisted_4$p)), [
                    [vModelText, s2.pattern]
                  ]) : s2.type === "addTags" ? withDirectives((openBlock(), createElementBlock("input", {
                    key: 1,
                    "onUpdate:modelValue": ($event) => s2.tags = $event,
                    type: "text",
                    placeholder: "标签，逗号分隔",
                    class: "h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1.5 text-[11px] text-fg-primary focus:outline-none"
                  }, null, 8, _hoisted_5$p)), [
                    [vModelText, s2.tags]
                  ]) : s2.type === "description" ? withDirectives((openBlock(), createElementBlock("input", {
                    key: 2,
                    "onUpdate:modelValue": ($event) => s2.text = $event,
                    type: "text",
                    placeholder: "备注文本",
                    class: "h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1.5 text-[11px] text-fg-primary focus:outline-none"
                  }, null, 8, _hoisted_6$p)), [
                    [vModelText, s2.text]
                  ]) : s2.type === "rating" ? withDirectives((openBlock(), createElementBlock("select", {
                    key: 3,
                    "onUpdate:modelValue": ($event) => s2.value = $event,
                    class: "h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1 text-[11px] text-fg-primary focus:outline-none"
                  }, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(5, (r2) => {
                      return createBaseVNode("option", {
                        key: r2,
                        value: r2
                      }, toDisplayString(r2) + " 星", 9, _hoisted_8$k);
                    }), 64))
                  ], 8, _hoisted_7$m)), [
                    [
                      vModelSelect,
                      s2.value,
                      void 0,
                      { number: true }
                    ]
                  ]) : s2.type === "moveToFolder" ? withDirectives((openBlock(), createElementBlock("select", {
                    key: 4,
                    "onUpdate:modelValue": ($event) => s2.folderId = $event,
                    class: "h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1 text-[11px] text-fg-primary focus:outline-none"
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(unref(data).folders.value, (f2) => {
                      return openBlock(), createElementBlock("option", {
                        key: f2.id,
                        value: f2.id
                      }, toDisplayString(f2.name), 9, _hoisted_10$h);
                    }), 128))
                  ], 8, _hoisted_9$h)), [
                    [vModelSelect, s2.folderId]
                  ]) : (openBlock(), createElementBlock("span", _hoisted_11$d, "无需参数")),
                  createBaseVNode("button", {
                    type: "button",
                    class: "shrink-0 text-fg-muted hover:text-danger",
                    onClick: ($event) => stepsDraft.value.splice(i2, 1)
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "ic-modal-close",
                      size: 12
                    })
                  ], 8, _hoisted_12$d)
                ]);
              }), 128)),
              createBaseVNode("select", {
                class: "h-7 w-full rounded-md border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-secondary focus:outline-none",
                value: "",
                onChange: _cache[1] || (_cache[1] = ($event) => {
                  addStep($event.target.value);
                  $event.target.value = "";
                })
              }, [
                _cache[3] || (_cache[3] = createBaseVNode("option", {
                  value: "",
                  disabled: ""
                }, "+ 添加步骤…", -1)),
                (openBlock(), createElementBlock(Fragment, null, renderList(STEP_LABELS, (label, t3) => {
                  return createBaseVNode("option", {
                    key: t3,
                    value: t3
                  }, toDisplayString(label), 9, _hoisted_13$c);
                }), 64))
              ], 32)
            ]),
            createBaseVNode("div", _hoisted_14$b, [
              createVNode(_sfc_main$N, {
                variant: "ghost",
                onClick: _cache[2] || (_cache[2] = ($event) => editing.value = null)
              }, {
                default: withCtx(() => [..._cache[5] || (_cache[5] = [
                  createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              createVNode(_sfc_main$N, {
                disabled: !nameDraft.value.trim() || stepsDraft.value.length === 0,
                onClick: saveDraft
              }, {
                default: withCtx(() => [..._cache[6] || (_cache[6] = [
                  createTextVNode(" 保存动作 ", -1)
                ])]),
                _: 1
              }, 8, ["disabled"])
            ])
          ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            unref(macros2).length === 0 ? (openBlock(), createElementBlock("div", _hoisted_15$b, [
              _cache[8] || (_cache[8] = createBaseVNode("span", { class: "text-3xl" }, "✦", -1)),
              _cache[9] || (_cache[9] = createBaseVNode("p", { class: "text-sm font-medium text-fg-primary" }, "建立动作", -1)),
              _cache[10] || (_cache[10] = createBaseVNode("p", { class: "max-w-[16rem] text-[11px] text-fg-tertiary" }, " 把常用的整理流程（重命名、打标签、评分、转格式、归组）串成动作，对选中素材一键执行。 ", -1)),
              createVNode(_sfc_main$N, {
                class: "mt-1",
                onClick: startCreate
              }, {
                default: withCtx(() => [..._cache[7] || (_cache[7] = [
                  createTextVNode("建立动作", -1)
                ])]),
                _: 1
              })
            ])) : (openBlock(), createElementBlock("div", _hoisted_16$a, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(macros2), (m2) => {
                return openBlock(), createElementBlock("div", {
                  key: m2.id,
                  class: "group flex items-center gap-2 rounded-md border border-line-default bg-surface-0 p-2"
                }, [
                  createBaseVNode("div", _hoisted_17$8, [
                    createBaseVNode("p", _hoisted_18$7, toDisplayString(m2.name), 1),
                    createBaseVNode("p", _hoisted_19$6, toDisplayString(m2.steps.map(stepSummary).join(" → ")), 1)
                  ]),
                  createVNode(_sfc_main$N, {
                    size: "sm",
                    disabled: selectedIds.value.length === 0,
                    onClick: ($event) => run(m2)
                  }, {
                    default: withCtx(() => [
                      createTextVNode(" 运行" + toDisplayString(selectedIds.value.length ? `(${selectedIds.value.length})` : ""), 1)
                    ]),
                    _: 1
                  }, 8, ["disabled", "onClick"]),
                  createBaseVNode("button", {
                    type: "button",
                    class: "shrink-0 text-fg-muted opacity-0 transition-opacity hover:text-fg-primary group-hover:opacity-100",
                    title: "编辑",
                    onClick: ($event) => startEdit(m2)
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "context-menu/ic-rename",
                      size: 13
                    })
                  ], 8, _hoisted_20$6),
                  createBaseVNode("button", {
                    type: "button",
                    class: "shrink-0 text-fg-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100",
                    title: "删除",
                    onClick: ($event) => unref(remove)(m2.id)
                  }, [
                    createVNode(_sfc_main$L, {
                      icon: "context-menu/ic-file-delete-permanently",
                      size: 13
                    })
                  ], 8, _hoisted_21$6)
                ]);
              }), 128)),
              createVNode(_sfc_main$N, {
                variant: "ghost",
                class: "w-full",
                onClick: startCreate
              }, {
                default: withCtx(() => [..._cache[11] || (_cache[11] = [
                  createTextVNode("+ 新建动作", -1)
                ])]),
                _: 1
              })
            ])),
            createBaseVNode("p", _hoisted_22$5, " 运行对象 = 当前选中的 " + toDisplayString(selectedIds.value.length) + " 项素材；步骤按序执行，失败即中断。 ", 1)
          ], 64))
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
}
