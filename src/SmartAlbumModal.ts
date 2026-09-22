/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$d = /* @__PURE__ */ defineComponent(
*/
{
  __name: "SmartAlbumModal",
  props: {
    album: {},
    presetRules: {},
    availableTags: {}
  },
  emits: ["close", "saved"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const toast2 = useToast();
    const ALL_FORMATS = FORMAT_FILTER_EXTENSIONS;
    const name = ref("");
    const selectedTagIds = ref([]);
    const selectedKinds = ref([]);
    const favorite = ref(false);
    const minRating = ref(0);
    const formats = ref([]);
    const minWidth = ref(null);
    const minHeight = ref(null);
    const keyword = ref("");
    const colorHue = ref(null);
    const minFileSizeKb = ref(null);
    const maxFileSizeKb = ref(null);
    const minDurationSec = ref(null);
    const maxDurationSec = ref(null);
    const sourceUrl = ref("");
    const descriptionKeyword = ref("");
    const matchCount = ref(null);
    const matchMode = ref("all");
    const folderIds = ref([]);
    const modFrom = ref("");
    const modTo = ref("");
    const sourceUrlExact = ref("");
    const descriptionExact = ref("");
    const folders = ref([]);
    const tagLogic = ref("all");
    const tagNames = ref([]);
    const tagExcludeNames = ref([]);
    const untaggedOnly = ref(false);
    const shapesInclude = ref([]);
    const shapesExclude = ref([]);
    const ratioW = ref(null);
    const ratioH = ref(null);
    const resolutionMin = ref(null);
    const maxWidth = ref(null);
    const maxHeight = ref(null);
    const impFrom = ref("");
    const impTo = ref("");
    const takenFrom = ref("");
    const takenTo = ref("");
    const excludeKeyword = ref("");
    const semanticQuery = ref("");
    const semantic = useSemanticSearch();
    const semanticReady = computed(() => semantic.state.value.ready);
    const closeHex = ref("");
    const closeAccuracy = ref(20);
    const extExclude = ref([]);
    const passthrough = ref({});
    const OWNED_RULE_KEYS = [
      "match",
      "tags",
      "kinds",
      "favorite",
      "minRating",
      "formats",
      "fileExtsInclude",
      "fileExtsExclude",
      "minWidth",
      "minHeight",
      "maxWidth",
      "maxHeight",
      "keyword",
      "colorHue",
      "colorClose",
      "minFileSize",
      "maxFileSize",
      "minDurationMs",
      "maxDurationMs",
      "sourceUrl",
      "sourceUrlExact",
      "descriptionKeyword",
      "descriptionExact",
      "folderIds",
      "modifiedFrom",
      "modifiedTo",
      "importedFrom",
      "importedTo",
      "takenFrom",
      "takenTo",
      "tagNamesAny",
      "tagNamesAll",
      "tagNamesExact",
      "tagNamesExclude",
      "untaggedOnly",
      "shapesInclude",
      "shapesExclude",
      "ratioWidth",
      "ratioHeight",
      "resolutionMin",
      "excludeKeyword",
      "semanticQuery",
      // 快照字段：编辑器不呈现它，但 passthrough 不能把它丢掉（下次保存要带走的是 semanticQuery）
      "semanticIds"
    ];
    const RULE_LABEL = {
      searchKeyword: "搜索关键词",
      searchScopes: "搜索范围",
      advancedAst: "高级搜索语法",
      folderExcludeIds: "排除文件夹",
      fileExtsExclude: "排除扩展名",
      tags: "标签（按 id）",
      notesKeyword: "注释关键词",
      urlKeyword: "链接关键词"
    };
    const unownedLabels = computed(
      () => Object.keys(passthrough.value).map((k2) => RULE_LABEL[k2] ?? k2)
    );
    const TAG_LOGICS = [
      { key: "all", label: "全部包含" },
      { key: "any", label: "任一" },
      { key: "exact", label: "完全相同" }
    ];
    const SHAPE_OPTIONS = [
      { key: "landscape", label: "横图" },
      { key: "portrait", label: "竖图" },
      { key: "square", label: "方形" },
      { key: "panoramic", label: "细长横" },
      { key: "panoramicPortrait", label: "细长竖" }
    ];
    function toggleShape(key, include) {
      const list2 = include ? shapesInclude.value : shapesExclude.value;
      const other = include ? shapesExclude.value : shapesInclude.value;
      const i2 = list2.indexOf(key);
      if (i2 >= 0) {
        list2.splice(i2, 1);
        return;
      }
      list2.push(key);
      const j2 = other.indexOf(key);
      if (j2 >= 0) other.splice(j2, 1);
    }
    const splitList = (s2) => s2.split(/[,，、]/).map((x2) => x2.trim().toLowerCase()).filter(Boolean);
    const tagNamesText = computed({
      get: () => tagNames.value.join(", "),
      set: (v2) => {
        tagNames.value = v2.split(/[,，、]/).map((x2) => x2.trim()).filter(Boolean);
      }
    });
    const extExcludeText = computed({
      get: () => extExclude.value.join(", "),
      set: (v2) => {
        extExclude.value = splitList(v2);
      }
    });
    const resolutionMinSel = computed({
      get: () => resolutionMin.value ?? 0,
      set: (v2) => {
        resolutionMin.value = v2 > 0 ? v2 : null;
      }
    });
    function localDayMs(str, endOfDay = false) {
      const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
      if (!m2) return null;
      const base2 = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3])).getTime();
      return endOfDay ? base2 + 86399e3 : base2;
    }
    onMounted(async () => {
      void semantic.refreshReady();
      const a2 = props.album;
      const src = a2 ? a2.rules : props.presetRules ?? null;
      if (src) {
        name.value = a2?.name ?? "";
        selectedTagIds.value = src.tags ?? [];
        selectedKinds.value = src.kinds ?? [];
        favorite.value = src.favorite ?? false;
        minRating.value = src.minRating ?? 0;
        formats.value = [...src.formats ?? [], ...src.fileExtsInclude ?? []].map((f2) => f2.replace(/^\./, "").toLowerCase()).filter((f2, i2, arr) => f2 && arr.indexOf(f2) === i2);
        minWidth.value = src.minWidth ?? null;
        minHeight.value = src.minHeight ?? null;
        keyword.value = src.keyword ?? "";
        colorHue.value = src.colorHue ?? null;
        minFileSizeKb.value = src.minFileSize ? Math.round(src.minFileSize / 1024) : null;
        maxFileSizeKb.value = src.maxFileSize ? Math.round(src.maxFileSize / 1024) : null;
        minDurationSec.value = src.minDurationMs ? Math.round(src.minDurationMs / 1e3) : null;
        maxDurationSec.value = src.maxDurationMs ? Math.round(src.maxDurationMs / 1e3) : null;
        sourceUrl.value = src.sourceUrl ?? "";
        sourceUrlExact.value = src.sourceUrlExact ?? "";
        descriptionKeyword.value = src.descriptionKeyword ?? "";
        descriptionExact.value = src.descriptionExact ?? "";
        matchMode.value = src.match ?? "all";
        folderIds.value = [...src.folderIds ?? []];
        modFrom.value = toDateInputValue(src.modifiedFrom);
        modTo.value = toDateInputValue(src.modifiedTo);
        tagNames.value = [
          ...src.tagNamesAny ?? [],
          ...src.tagNamesAll ?? [],
          ...src.tagNamesExact ?? []
        ];
        tagLogic.value = src.tagNamesExact?.length ? "exact" : src.tagNamesAny?.length ? "any" : "all";
        tagExcludeNames.value = [...src.tagNamesExclude ?? []];
        untaggedOnly.value = !!src.untaggedOnly;
        shapesInclude.value = [...src.shapesInclude ?? []];
        shapesExclude.value = [...src.shapesExclude ?? []];
        ratioW.value = src.ratioWidth ?? null;
        ratioH.value = src.ratioHeight ?? null;
        resolutionMin.value = src.resolutionMin ?? null;
        maxWidth.value = src.maxWidth ?? null;
        maxHeight.value = src.maxHeight ?? null;
        impFrom.value = toDateInputValue(src.importedFrom);
        impTo.value = toDateInputValue(src.importedTo);
        takenFrom.value = toDateInputValue(src.takenFrom);
        takenTo.value = toDateInputValue(src.takenTo);
        excludeKeyword.value = src.excludeKeyword ?? "";
        semanticQuery.value = src.semanticQuery ?? "";
        closeHex.value = src.colorClose?.hex ?? "";
        closeAccuracy.value = src.colorClose?.accuracy ?? 20;
        extExclude.value = [...src.fileExtsExclude ?? []];
        passthrough.value = Object.fromEntries(
          Object.entries(src).filter(([k2]) => !OWNED_RULE_KEYS.includes(k2))
        );
      }
      try {
        const all = await window.api.photos.listPhotoFolders();
        folders.value = all.map((f2) => ({ id: f2.id, name: f2.name }));
      } catch {
      }
    });
    function toDateInputValue(ms2) {
      if (!ms2) return "";
      const d2 = new Date(ms2);
      return `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}-${String(d2.getDate()).padStart(2, "0")}`;
    }
    const currentRules = computed(() => {
      const rules = {};
      if (selectedTagIds.value.length > 0) rules.tags = [...selectedTagIds.value];
      if (selectedKinds.value.length > 0) rules.kinds = [...selectedKinds.value];
      if (favorite.value) rules.favorite = true;
      if (minRating.value > 0) rules.minRating = minRating.value;
      if (typeof minWidth.value === "number" && minWidth.value > 0) rules.minWidth = minWidth.value;
      if (typeof minHeight.value === "number" && minHeight.value > 0) rules.minHeight = minHeight.value;
      if (keyword.value.trim()) rules.keyword = keyword.value.trim();
      if (colorHue.value) rules.colorHue = colorHue.value;
      if (typeof minFileSizeKb.value === "number" && minFileSizeKb.value > 0)
        rules.minFileSize = minFileSizeKb.value * 1024;
      if (typeof maxFileSizeKb.value === "number" && maxFileSizeKb.value > 0)
        rules.maxFileSize = maxFileSizeKb.value * 1024;
      if (typeof minDurationSec.value === "number" && minDurationSec.value > 0)
        rules.minDurationMs = minDurationSec.value * 1e3;
      if (typeof maxDurationSec.value === "number" && maxDurationSec.value > 0)
        rules.maxDurationMs = maxDurationSec.value * 1e3;
      if (sourceUrl.value.trim()) {
        rules.sourceUrl = sourceUrl.value.trim();
        if (sourceUrlExact.value.trim()) rules.sourceUrlExact = sourceUrlExact.value.trim();
      }
      if (descriptionKeyword.value.trim()) {
        rules.descriptionKeyword = descriptionKeyword.value.trim();
        if (descriptionExact.value.trim()) rules.descriptionExact = descriptionExact.value.trim();
      }
      if (matchMode.value === "any") rules.match = "any";
      if (folderIds.value.length > 0) rules.folderIds = [...folderIds.value];
      const modFromMs = localDayMs(modFrom.value);
      if (modFromMs !== null) rules.modifiedFrom = modFromMs;
      const modToMs = localDayMs(modTo.value, true);
      if (modToMs !== null) rules.modifiedTo = modToMs;
      const names = tagNames.value.map((n2) => n2.trim()).filter(Boolean);
      if (names.length > 0) {
        if (tagLogic.value === "any") rules.tagNamesAny = names;
        else if (tagLogic.value === "exact") rules.tagNamesExact = names;
        else rules.tagNamesAll = names;
      }
      if (tagExcludeNames.value.length > 0) rules.tagNamesExclude = [...tagExcludeNames.value];
      if (untaggedOnly.value) rules.untaggedOnly = true;
      if (shapesInclude.value.length > 0) rules.shapesInclude = [...shapesInclude.value];
      if (shapesExclude.value.length > 0) rules.shapesExclude = [...shapesExclude.value];
      if (ratioW.value && ratioH.value) {
        rules.ratioWidth = ratioW.value;
        rules.ratioHeight = ratioH.value;
      }
      if (resolutionMin.value) rules.resolutionMin = resolutionMin.value;
      if (maxWidth.value) rules.maxWidth = maxWidth.value;
      if (maxHeight.value) rules.maxHeight = maxHeight.value;
      const impFromMs = localDayMs(impFrom.value);
      if (impFromMs !== null) rules.importedFrom = impFromMs;
      const impToMs = localDayMs(impTo.value, true);
      if (impToMs !== null) rules.importedTo = impToMs;
      const takenFromMs = localDayMs(takenFrom.value);
      if (takenFromMs !== null) rules.takenFrom = takenFromMs;
      const takenToMs = localDayMs(takenTo.value, true);
      if (takenToMs !== null) rules.takenTo = takenToMs;
      if (excludeKeyword.value.trim()) rules.excludeKeyword = excludeKeyword.value.trim();
      if (semanticQuery.value.trim()) rules.semanticQuery = semanticQuery.value.trim();
      if (/^#?[0-9a-fA-F]{6}$/.test(closeHex.value.trim())) {
        const hex = closeHex.value.trim();
        rules.colorClose = { hex: hex.startsWith("#") ? hex : `#${hex}`, accuracy: closeAccuracy.value };
      }
      if (extExclude.value.length > 0) rules.fileExtsExclude = [...extExclude.value];
      if (formats.value.length > 0) {
        rules.fileExtsInclude = formats.value.map((f2) => f2.replace(/^\./, "").toLowerCase());
      }
      return { ...passthrough.value, ...rules };
    });
    let debounceTimer;
    let rulesQuerySeq = 0;
    watch(
      currentRules,
      () => {
        window.clearTimeout(debounceTimer);
        const seq = ++rulesQuerySeq;
        debounceTimer = window.setTimeout(async () => {
          if (seq !== rulesQuerySeq) return;
          try {
            const result2 = await window.api.photos.queryPhotosByRules(currentRules.value);
            if (seq !== rulesQuerySeq) return;
            matchCount.value = result2.length;
          } catch {
            if (seq === rulesQuerySeq) matchCount.value = null;
          }
        }, 300);
      },
      { immediate: true }
    );
    onUnmounted(() => window.clearTimeout(debounceTimer));
    function toggleTag(id3) {
      const i2 = selectedTagIds.value.indexOf(id3);
      if (i2 >= 0) selectedTagIds.value.splice(i2, 1);
      else selectedTagIds.value.push(id3);
    }
    function toggleKind(k2) {
      const i2 = selectedKinds.value.indexOf(k2);
      if (i2 >= 0) selectedKinds.value.splice(i2, 1);
      else selectedKinds.value.push(k2);
    }
    function toggleFormat(f2) {
      const i2 = formats.value.indexOf(f2);
      if (i2 >= 0) formats.value.splice(i2, 1);
      else formats.value.push(f2);
    }
    async function handleSave() {
      const trimmed = name.value.trim();
      if (!trimmed) return;
      try {
        if (props.album) {
          await window.api.photos.updateSmartAlbum(props.album.id, {
            name: trimmed,
            rules: currentRules.value
          });
          toast2.success("智能文件夹已更新");
        } else {
          await window.api.photos.createSmartAlbum(trimmed, currentRules.value);
          toast2.success("智能文件夹已创建");
        }
        emit("saved");
        emit("close");
      } catch (error2) {
        toast2.error("保存失败", { description: error2.message });
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(UModal, {
        "model-value": true,
        size: "md",
        "onUpdate:modelValue": _cache[34] || (_cache[34] = ($event) => _ctx.$emit("close"))
      }, {
        title: withCtx(() => [
          createBaseVNode("span", _hoisted_1$d, [
            createVNode(_sfc_main$L, { icon: "context-menu/ic-smart-folder-rule" }),
            createTextVNode(" " + toDisplayString(__props.album ? "编辑智能文件夹" : "新增智能文件夹"), 1)
          ])
        ]),
        footer: withCtx(() => [
          createVNode(_sfc_main$N, {
            variant: "ghost",
            onClick: _cache[33] || (_cache[33] = ($event) => _ctx.$emit("close"))
          }, {
            default: withCtx(() => [..._cache[75] || (_cache[75] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_sfc_main$N, {
            variant: "primary",
            disabled: !name.value.trim(),
            onClick: handleSave
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(__props.album ? "保存" : "创建"), 1)
            ]),
            _: 1
          }, 8, ["disabled"])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_2$d, [
            createBaseVNode("div", null, [
              _cache[35] || (_cache[35] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "名称", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => name.value = $event),
                type: "text",
                placeholder: "例如：大尺寸截图、五星级照片...",
                class: "w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
              }, null, 512), [
                [vModelText, name.value]
              ])
            ]),
            __props.availableTags.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_3$c, [
              _cache[37] || (_cache[37] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "匹配模式", -1)),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => matchMode.value = $event),
                class: "mb-3 h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
              }, [..._cache[36] || (_cache[36] = [
                createBaseVNode("option", { value: "all" }, "所有条件满足", -1),
                createBaseVNode("option", { value: "any" }, "任一条件满足", -1)
              ])], 512), [
                [vModelSelect, matchMode.value]
              ]),
              _cache[38] || (_cache[38] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "包含标签（全部满足）", -1)),
              createBaseVNode("div", _hoisted_4$a, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(__props.availableTags, (t3) => {
                  return openBlock(), createElementBlock("button", {
                    key: t3.id,
                    class: normalizeClass([
                      "px-2.5 py-1 rounded-full text-xs border transition-colors",
                      selectedTagIds.value.includes(t3.id) ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-line-default text-fg-secondary hover:border-brand-400"
                    ]),
                    onClick: ($event) => toggleTag(t3.id)
                  }, toDisplayString(t3.name), 11, _hoisted_5$a);
                }), 128))
              ])
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_6$a, [
              createBaseVNode("label", _hoisted_7$9, [
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => favorite.value = $event),
                  type: "checkbox",
                  class: "accent-brand-500"
                }, null, 512), [
                  [vModelCheckbox, favorite.value]
                ]),
                _cache[39] || (_cache[39] = createTextVNode(" 仅收藏 ", -1))
              ]),
              createBaseVNode("div", _hoisted_8$7, [
                _cache[41] || (_cache[41] = createBaseVNode("span", { class: "text-xs text-fg-muted" }, "最低评分", -1)),
                withDirectives(createBaseVNode("select", {
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => minRating.value = $event),
                  class: "flex-1 px-2 py-1.5 rounded-md border border-line-default bg-surface-1 text-sm text-fg-primary"
                }, [
                  _cache[40] || (_cache[40] = createBaseVNode("option", { value: 0 }, "不限", -1)),
                  (openBlock(), createElementBlock(Fragment, null, renderList(5, (n2) => {
                    return createBaseVNode("option", {
                      key: n2,
                      value: n2
                    }, toDisplayString(n2) + " 星", 9, _hoisted_9$7);
                  }), 64))
                ], 512), [
                  [
                    vModelSelect,
                    minRating.value,
                    void 0,
                    { number: true }
                  ]
                ])
              ])
            ]),
            createBaseVNode("div", null, [
              _cache[42] || (_cache[42] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "类型", -1)),
              createBaseVNode("div", _hoisted_10$7, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(ALL_KINDS), (k2) => {
                  return openBlock(), createElementBlock("button", {
                    key: k2,
                    class: normalizeClass([
                      "px-2.5 py-1 rounded-full text-xs border transition-colors",
                      selectedKinds.value.includes(k2) ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-line-default text-fg-secondary hover:border-brand-400"
                    ]),
                    onClick: ($event) => toggleKind(k2)
                  }, toDisplayString(unref(KIND_LABELS)[k2]), 11, _hoisted_11$3);
                }), 128))
              ])
            ]),
            createBaseVNode("div", null, [
              _cache[43] || (_cache[43] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "格式", -1)),
              createBaseVNode("div", _hoisted_12$3, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(ALL_FORMATS), (f2) => {
                  return openBlock(), createElementBlock("button", {
                    key: f2,
                    class: normalizeClass([
                      "px-2.5 py-1 rounded-full text-xs border transition-colors uppercase",
                      formats.value.includes(f2) ? "border-brand-500 bg-brand-500/10 text-brand-600" : "border-line-default text-fg-secondary hover:border-brand-400"
                    ]),
                    onClick: ($event) => toggleFormat(f2)
                  }, toDisplayString(f2), 11, _hoisted_13$3);
                }), 128))
              ])
            ]),
            createBaseVNode("div", _hoisted_14$2, [
              createBaseVNode("div", null, [
                _cache[44] || (_cache[44] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "最小宽度 px", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => minWidth.value = $event),
                  type: "number",
                  min: "0",
                  class: "w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [
                    vModelText,
                    minWidth.value,
                    void 0,
                    { number: true }
                  ]
                ])
              ]),
              createBaseVNode("div", null, [
                _cache[45] || (_cache[45] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "最小高度 px", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => minHeight.value = $event),
                  type: "number",
                  min: "0",
                  class: "w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [
                    vModelText,
                    minHeight.value,
                    void 0,
                    { number: true }
                  ]
                ])
              ]),
              createBaseVNode("div", null, [
                _cache[46] || (_cache[46] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "关键词", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => keyword.value = $event),
                  type: "text",
                  placeholder: "文件名/描述",
                  class: "w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [vModelText, keyword.value]
                ])
              ])
            ]),
            createBaseVNode("div", null, [
              _cache[47] || (_cache[47] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "主色（色相桶）", -1)),
              createVNode(_sfc_main$e, {
                modelValue: colorHue.value,
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => colorHue.value = $event),
                "show-clear": ""
              }, null, 8, ["modelValue"])
            ]),
            createBaseVNode("div", _hoisted_15$2, [
              createBaseVNode("div", null, [
                _cache[48] || (_cache[48] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "最小文件大小 (KB)", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => minFileSizeKb.value = $event),
                  type: "number",
                  min: "0",
                  placeholder: "不限",
                  class: "w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [
                    vModelText,
                    minFileSizeKb.value,
                    void 0,
                    { number: true }
                  ]
                ])
              ]),
              createBaseVNode("div", null, [
                _cache[49] || (_cache[49] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "最大文件大小 (KB)", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => maxFileSizeKb.value = $event),
                  type: "number",
                  min: "0",
                  placeholder: "不限",
                  class: "w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [
                    vModelText,
                    maxFileSizeKb.value,
                    void 0,
                    { number: true }
                  ]
                ])
              ]),
              createBaseVNode("div", null, [
                _cache[50] || (_cache[50] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "最短时长 (秒，视频/音频)", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => minDurationSec.value = $event),
                  type: "number",
                  min: "0",
                  placeholder: "不限",
                  class: "w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [
                    vModelText,
                    minDurationSec.value,
                    void 0,
                    { number: true }
                  ]
                ])
              ]),
              createBaseVNode("div", null, [
                _cache[51] || (_cache[51] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "最长时长 (秒，视频/音频)", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => maxDurationSec.value = $event),
                  type: "number",
                  min: "0",
                  placeholder: "不限",
                  class: "w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [
                    vModelText,
                    maxDurationSec.value,
                    void 0,
                    { number: true }
                  ]
                ])
              ])
            ]),
            createBaseVNode("div", _hoisted_16$2, [
              createBaseVNode("div", null, [
                _cache[52] || (_cache[52] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "书签来源 URL 包含", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => sourceUrl.value = $event),
                  type: "text",
                  placeholder: "如 github.com",
                  class: "w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [vModelText, sourceUrl.value]
                ])
              ]),
              createBaseVNode("div", null, [
                _cache[54] || (_cache[54] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "所属文件夹（⌘/Ctrl 多选，不选=不限）", -1)),
                withDirectives(createBaseVNode("select", {
                  "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => folderIds.value = $event),
                  multiple: "",
                  size: "4",
                  class: "h-[74px] w-full rounded-md border border-line-default bg-surface-1 px-2 py-1 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
                }, [
                  _cache[53] || (_cache[53] = createBaseVNode("option", { value: "none" }, "未分类到文件夹", -1)),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(folders.value, (f2) => {
                    return openBlock(), createElementBlock("option", {
                      key: f2.id,
                      value: f2.id
                    }, toDisplayString(f2.name), 9, _hoisted_17$1);
                  }), 128))
                ], 512), [
                  [vModelSelect, folderIds.value]
                ])
              ]),
              createBaseVNode("div", _hoisted_18, [
                _cache[56] || (_cache[56] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "修改日期（文件系统）", -1)),
                createBaseVNode("div", _hoisted_19, [
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => modFrom.value = $event),
                    type: "date",
                    class: "h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
                  }, null, 512), [
                    [vModelText, modFrom.value]
                  ]),
                  _cache[55] || (_cache[55] = createBaseVNode("span", { class: "text-fg-muted" }, "~", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => modTo.value = $event),
                    type: "date",
                    class: "h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
                  }, null, 512), [
                    [vModelText, modTo.value]
                  ])
                ])
              ]),
              createBaseVNode("div", _hoisted_20, [
                _cache[57] || (_cache[57] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "描述关键词", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => descriptionKeyword.value = $event),
                  type: "text",
                  placeholder: "仅匹配描述字段",
                  class: "w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
                }, null, 512), [
                  [vModelText, descriptionKeyword.value]
                ])
              ])
            ]),
            createBaseVNode("fieldset", _hoisted_21, [
              _cache[74] || (_cache[74] = createBaseVNode("legend", { class: "px-1 text-xs text-fg-muted" }, "更多条件（保存筛选下发过但此前没入口）", -1)),
              createBaseVNode("div", _hoisted_22, [
                createBaseVNode("div", null, [
                  _cache[58] || (_cache[58] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "标签匹配逻辑（按名字那组）", -1)),
                  createBaseVNode("div", _hoisted_23, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(TAG_LOGICS, (l2) => {
                      return createBaseVNode("button", {
                        key: l2.key,
                        type: "button",
                        class: normalizeClass([
                          "rounded border px-2 py-1 text-xs",
                          tagLogic.value === l2.key ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400" : "border-line-default bg-surface-1 text-fg-muted"
                        ]),
                        onClick: ($event) => tagLogic.value = l2.key
                      }, toDisplayString(l2.label), 11, _hoisted_24);
                    }), 64))
                  ]),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => tagNamesText.value = $event),
                    type: "text",
                    placeholder: "标签名，逗号分隔",
                    class: "mt-1 w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                  }, null, 512), [
                    [vModelText, tagNamesText.value]
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[59] || (_cache[59] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "形状（左键包含 / 右键排除）", -1)),
                  createBaseVNode("div", _hoisted_25, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(SHAPE_OPTIONS, (s2) => {
                      return createBaseVNode("button", {
                        key: s2.key,
                        type: "button",
                        class: normalizeClass([
                          "rounded border px-2 py-1 text-xs",
                          shapesInclude.value.includes(s2.key) ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400" : shapesExclude.value.includes(s2.key) ? "border-danger text-danger-500 line-through" : "border-line-default bg-surface-1 text-fg-muted"
                        ]),
                        title: `左键包含，右键排除：${s2.label}`,
                        onClick: ($event) => toggleShape(s2.key, true),
                        onContextmenu: withModifiers(($event) => toggleShape(s2.key, false), ["prevent"])
                      }, toDisplayString(s2.label), 43, _hoisted_26);
                    }), 64))
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[61] || (_cache[61] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "比例 W : H（2% 容差）", -1)),
                  createBaseVNode("div", _hoisted_27, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => ratioW.value = $event),
                      type: "number",
                      min: "0",
                      class: "w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary",
                      placeholder: "16"
                    }, null, 512), [
                      [
                        vModelText,
                        ratioW.value,
                        void 0,
                        { number: true }
                      ]
                    ]),
                    _cache[60] || (_cache[60] = createBaseVNode("span", { class: "text-fg-muted" }, ":", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => ratioH.value = $event),
                      type: "number",
                      min: "0",
                      class: "w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary",
                      placeholder: "9"
                    }, null, 512), [
                      [
                        vModelText,
                        ratioH.value,
                        void 0,
                        { number: true }
                      ]
                    ])
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[63] || (_cache[63] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "分辨率下限（短边）", -1)),
                  withDirectives(createBaseVNode("select", {
                    "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => resolutionMinSel.value = $event),
                    class: "h-7 w-full rounded border border-line-default bg-surface-1 px-2 text-xs text-fg-primary"
                  }, [..._cache[62] || (_cache[62] = [
                    createBaseVNode("option", { value: 0 }, "不限", -1),
                    createBaseVNode("option", { value: 1280 }, "≥ 1280（1K）", -1),
                    createBaseVNode("option", { value: 1920 }, "≥ 1920（2K）", -1),
                    createBaseVNode("option", { value: 3840 }, "≥ 3840（4K）", -1)
                  ])], 512), [
                    [
                      vModelSelect,
                      resolutionMinSel.value,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[64] || (_cache[64] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "最大宽 / 高（超尺寸排除用）", -1)),
                  createBaseVNode("div", _hoisted_28, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => maxWidth.value = $event),
                      type: "number",
                      min: "0",
                      placeholder: "宽",
                      class: "w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                    }, null, 512), [
                      [
                        vModelText,
                        maxWidth.value,
                        void 0,
                        { number: true }
                      ]
                    ]),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => maxHeight.value = $event),
                      type: "number",
                      min: "0",
                      placeholder: "高",
                      class: "w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                    }, null, 512), [
                      [
                        vModelText,
                        maxHeight.value,
                        void 0,
                        { number: true }
                      ]
                    ])
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[65] || (_cache[65] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "排除关键词（命中即排除）", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => excludeKeyword.value = $event),
                    type: "text",
                    placeholder: "如 临时",
                    class: "w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                  }, null, 512), [
                    [vModelText, excludeKeyword.value]
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[66] || (_cache[66] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "AI 语义（按画面内容匹配）", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => semanticQuery.value = $event),
                    type: "text",
                    placeholder: "如 红色日落的海边",
                    class: "w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                  }, null, 512), [
                    [vModelText, semanticQuery.value]
                  ]),
                  semanticQuery.value.trim() && !semanticReady.value ? (openBlock(), createElementBlock("p", _hoisted_29, " 向量模型未下载：这条条件现在会判定为「无匹配」（相册显示空）， 到 设置 › 内容识别 下载后自动生效。 ")) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", null, [
                  _cache[68] || (_cache[68] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "添加日期", -1)),
                  createBaseVNode("div", _hoisted_30, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => impFrom.value = $event),
                      type: "date",
                      class: "w-1/2 px-1 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                    }, null, 512), [
                      [vModelText, impFrom.value]
                    ]),
                    _cache[67] || (_cache[67] = createBaseVNode("span", { class: "text-fg-muted" }, "~", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => impTo.value = $event),
                      type: "date",
                      class: "w-1/2 px-1 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                    }, null, 512), [
                      [vModelText, impTo.value]
                    ])
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[70] || (_cache[70] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "拍摄日期（EXIF）", -1)),
                  createBaseVNode("div", _hoisted_31, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[27] || (_cache[27] = ($event) => takenFrom.value = $event),
                      type: "date",
                      class: "w-1/2 px-1 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                    }, null, 512), [
                      [vModelText, takenFrom.value]
                    ]),
                    _cache[69] || (_cache[69] = createBaseVNode("span", { class: "text-fg-muted" }, "~", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[28] || (_cache[28] = ($event) => takenTo.value = $event),
                      type: "date",
                      class: "w-1/2 px-1 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                    }, null, 512), [
                      [vModelText, takenTo.value]
                    ])
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[71] || (_cache[71] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "近似色（HEX + 准确度，留空=不用）", -1)),
                  createBaseVNode("div", _hoisted_32, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[29] || (_cache[29] = ($event) => closeHex.value = $event),
                      type: "text",
                      placeholder: "#FF0000",
                      class: "w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary uppercase"
                    }, null, 512), [
                      [vModelText, closeHex.value]
                    ]),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[30] || (_cache[30] = ($event) => closeAccuracy.value = $event),
                      type: "number",
                      min: "5",
                      max: "40",
                      class: "w-1/4 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary",
                      title: "准确度（5–40，越大越严）"
                    }, null, 512), [
                      [
                        vModelText,
                        closeAccuracy.value,
                        void 0,
                        { number: true }
                      ]
                    ])
                  ])
                ]),
                createBaseVNode("div", null, [
                  _cache[72] || (_cache[72] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "排除扩展名（逗号分隔）", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[31] || (_cache[31] = ($event) => extExcludeText.value = $event),
                    type: "text",
                    placeholder: "如 gif, tmp",
                    class: "w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                  }, null, 512), [
                    [vModelText, extExcludeText.value]
                  ])
                ]),
                createBaseVNode("label", _hoisted_33, [
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[32] || (_cache[32] = ($event) => untaggedOnly.value = $event),
                    type: "checkbox",
                    class: "accent-brand-500"
                  }, null, 512), [
                    [vModelCheckbox, untaggedOnly.value]
                  ]),
                  _cache[73] || (_cache[73] = createTextVNode(" 仅看未标签 ", -1))
                ])
              ])
            ]),
            unownedLabels.value.length > 0 ? (openBlock(), createElementBlock("p", _hoisted_34, " 这条还带着编辑器暂不支持编辑的条件，将原样保留：" + toDisplayString(unownedLabels.value.join("、")), 1)) : createCommentVNode("", true),
            createBaseVNode("p", _hoisted_35, toDisplayString(matchCount.value === null ? "正在计算匹配数量..." : `当前条件匹配 ${matchCount.value} 张图片`), 1)
          ])
        ]),
        _: 1
      });
    };
  }
}
