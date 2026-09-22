/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$3 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "DuplicateScanModal",
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const scan = useDuplicateScan();
    const filters = usePhotoFilters();
    const { selectedIds } = usePhotoSelection();
    const MODES = [
      { value: "phash", label: "相似图片" },
      { value: "hash", label: "相同文件" }
    ];
    const mode = ref("phash");
    const scope = ref("all");
    const modeHint = computed(
      () => mode.value === "phash" ? "按感知哈希聚类，找出内容相近的图片（含缩放/压缩变体）" : "按文件 MD5 精确匹配，只找内容完全一致的文件"
    );
    const viewCount = computed(() => filters.flatDisplayPhotos.value.length);
    const selectedCount = computed(() => selectedIds.value.length);
    const scopes = computed(() => [
      { value: "all", label: "全部素材", disabled: false },
      {
        value: "view",
        label: `当前视图 (${viewCount.value})`,
        disabled: viewCount.value === 0
      },
      {
        value: "selection",
        label: `已选 (${selectedCount.value})`,
        disabled: selectedCount.value === 0
      }
    ]);
    function start() {
      const ids = scope.value === "view" ? filters.flatDisplayPhotos.value.map((p2) => p2.id) : scope.value === "selection" ? [...selectedIds.value] : void 0;
      emit("close");
      void scan.runDuplicateScan(mode.value, scope.value, ids);
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": true,
        size: "sm",
        "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [
          createBaseVNode("span", _hoisted_1$3, [
            createVNode(_sfc_main$L, { icon: "ic_search" }),
            _cache[2] || (_cache[2] = createTextVNode(" 相似查重设置 ", -1))
          ])
        ]),
        footer: withCtx(() => [
          createVNode(_sfc_main$N, {
            variant: "ghost",
            onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("close"))
          }, {
            default: withCtx(() => [..._cache[5] || (_cache[5] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_sfc_main$N, {
            variant: "primary",
            onClick: start
          }, {
            default: withCtx(() => [..._cache[6] || (_cache[6] = [
              createTextVNode("开始扫描", -1)
            ])]),
            _: 1
          })
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_2$3, [
            createBaseVNode("div", null, [
              _cache[3] || (_cache[3] = createBaseVNode("p", { class: "mb-1.5 text-xs text-fg-muted" }, "扫描模式", -1)),
              createBaseVNode("div", _hoisted_3$3, [
                (openBlock(), createElementBlock(Fragment, null, renderList(MODES, (m2) => {
                  return createBaseVNode("button", {
                    key: m2.value,
                    type: "button",
                    class: normalizeClass([
                      "flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors",
                      mode.value === m2.value ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400"
                    ]),
                    onClick: ($event) => mode.value = m2.value
                  }, toDisplayString(m2.label), 11, _hoisted_4$2);
                }), 64))
              ]),
              createBaseVNode("p", _hoisted_5$2, toDisplayString(modeHint.value), 1)
            ]),
            createBaseVNode("div", null, [
              _cache[4] || (_cache[4] = createBaseVNode("p", { class: "mb-1.5 text-xs text-fg-muted" }, "扫描范围", -1)),
              createBaseVNode("div", _hoisted_6$2, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(scopes.value, (s2) => {
                  return openBlock(), createElementBlock("button", {
                    key: s2.value,
                    type: "button",
                    disabled: s2.disabled,
                    class: normalizeClass([
                      "flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      scope.value === s2.value ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400"
                    ]),
                    onClick: ($event) => scope.value = s2.value
                  }, toDisplayString(s2.label), 11, _hoisted_7$2);
                }), 128))
              ])
            ])
          ])
        ]),
        _: 1
      });
    };
  }
}
