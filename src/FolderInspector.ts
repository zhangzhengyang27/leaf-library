/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$g = /* @__PURE__ */ defineComponent(
*/
{
  __name: "FolderInspector",
  props: {
    folder: {}
  },
  emits: ["close", "changed", "open-settings"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const toast2 = useToast();
    const name = ref(props.folder.name);
    const description = ref(props.folder.description ?? "");
    const hasPassword = ref(!!props.folder.hasPassword);
    const photoCount = ref(props.folder.photoCount);
    const totalSize = ref(0);
    watch(
      () => props.folder.id,
      () => {
        name.value = props.folder.name;
        description.value = props.folder.description ?? "";
        hasPassword.value = !!props.folder.hasPassword;
        void loadStats();
      },
      { immediate: true }
    );
    async function loadStats() {
      const fid = props.folder.id;
      try {
        const photos = await window.api.photos.getFolderPhotos(fid);
        if (props.folder.id !== fid) return;
        photoCount.value = photos.length;
        totalSize.value = photos.reduce((n2, p2) => n2 + (p2.fileSize || 0), 0);
      } catch {
      }
    }
    function fmtSize(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }
    function fmtDate(ms2) {
      const d2 = new Date(ms2);
      return `${d2.getFullYear()}/${String(d2.getMonth() + 1).padStart(2, "0")}/${String(
        d2.getDate()
      ).padStart(
        2,
        "0"
      )} ${String(d2.getHours()).padStart(2, "0")}:${String(d2.getMinutes()).padStart(2, "0")}`;
    }
    const addedAt = computed(() => fmtDate(props.folder.createdAt));
    computed(() => name.value.trim() !== props.folder.name && name.value.trim());
    const descDirty = computed(
      () => (description.value.trim() || props.folder.description) && description.value !== (props.folder.description ?? "")
    );
    async function saveName() {
      const next = name.value.trim();
      if (!next || next === props.folder.name) return;
      const ok = await window.api.photos.renamePhotoFolder(props.folder.id, next);
      if (ok) {
        toast2.success("已重命名文件夹", { description: next });
        emit("changed");
      } else {
        toast2.error("重命名失败", { description: "可能已存在同名文件夹" });
        name.value = props.folder.name;
      }
    }
    async function saveDescription() {
      if (!descDirty.value) return;
      try {
        await window.api.photos.setFolderDescription(props.folder.id, description.value);
        toast2.success("描述已保存");
        emit("changed");
      } catch (error2) {
        toast2.error("保存失败", { description: error2.message });
      }
    }
    const passwordPromptOpen = ref(false);
    const passwordInput = ref("");
    async function setPassword() {
      const pw = passwordInput.value;
      if (!pw) return;
      try {
        await window.api.photos.setFolderPassword(props.folder.id, pw);
        hasPassword.value = true;
        passwordPromptOpen.value = false;
        passwordInput.value = "";
        toast2.success("文件夹密码已设置", { description: "打开该文件夹需输入密码" });
        emit("changed");
      } catch (error2) {
        toast2.error("设置失败", { description: error2.message });
      }
    }
    const removePromptOpen = ref(false);
    const removeInput = ref("");
    async function removePassword() {
      try {
        const ok = await window.api.photos.removeFolderPassword(props.folder.id, removeInput.value);
        if (ok) {
          hasPassword.value = false;
          removePromptOpen.value = false;
          removeInput.value = "";
          toast2.success("已移除文件夹密码");
          emit("changed");
        } else {
          toast2.error("密码错误，移除失败");
        }
      } catch (error2) {
        toast2.error("移除失败", { description: error2.message });
      }
    }
    async function handleExport() {
      try {
        const n2 = await window.api.photos.exportFolder(props.folder.id);
        toast2.success(`已导出 ${n2} 个文件`, { description: "见所选目录" });
      } catch (error2) {
        toast2.error("导出失败", { description: error2.message });
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("aside", _hoisted_1$g, [
        createBaseVNode("header", _hoisted_2$g, [
          _cache[7] || (_cache[7] = createBaseVNode("h3", { class: "text-xs font-semibold text-fg-secondary" }, "文件夹", -1)),
          createBaseVNode("div", _hoisted_3$e, [
            createBaseVNode("button", {
              type: "button",
              class: "flex size-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary",
              "aria-label": "文件夹设置",
              title: "文件夹设置",
              onClick: _cache[0] || (_cache[0] = ($event) => emit("open-settings"))
            }, [
              createVNode(_sfc_main$L, { icon: "ic_cog" })
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "flex size-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary",
              "aria-label": "关闭",
              onClick: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("close"))
            }, [
              createVNode(_sfc_main$L, { icon: "ic-modal-close" })
            ])
          ])
        ]),
        createBaseVNode("div", _hoisted_4$c, [
          _cache[14] || (_cache[14] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "名称", -1)),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => name.value = $event),
            type: "text",
            class: "mb-2 h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500",
            onKeyup: withKeys(saveName, ["enter"]),
            onBlur: saveName
          }, null, 544), [
            [vModelText, name.value]
          ]),
          _cache[15] || (_cache[15] = createBaseVNode("label", { class: "mb-1 block text-xs text-fg-muted" }, "描述", -1)),
          withDirectives(createBaseVNode("textarea", {
            "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => description.value = $event),
            rows: "2",
            placeholder: "描述",
            class: "mb-2 w-full rounded-md border border-line-default bg-surface-1 px-2 py-1.5 text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500",
            onBlur: saveDescription
          }, null, 544), [
            [vModelText, description.value]
          ]),
          _cache[16] || (_cache[16] = createBaseVNode("p", { class: "mb-1 mt-3 text-[11px] font-medium text-fg-secondary" }, "基本信息", -1)),
          createBaseVNode("dl", _hoisted_5$c, [
            createBaseVNode("div", _hoisted_6$c, [
              _cache[8] || (_cache[8] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "文件数", -1)),
              createBaseVNode("dd", _hoisted_7$b, toDisplayString(photoCount.value), 1)
            ]),
            createBaseVNode("div", _hoisted_8$9, [
              _cache[9] || (_cache[9] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "占用空间", -1)),
              createBaseVNode("dd", _hoisted_9$9, toDisplayString(fmtSize(totalSize.value)), 1)
            ]),
            createBaseVNode("div", _hoisted_10$9, [
              _cache[10] || (_cache[10] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "添加日期", -1)),
              createBaseVNode("dd", _hoisted_11$5, toDisplayString(addedAt.value), 1)
            ]),
            createBaseVNode("div", _hoisted_12$5, [
              _cache[11] || (_cache[11] = createBaseVNode("dt", { class: "text-fg-tertiary" }, "密码保护", -1)),
              createBaseVNode("dd", null, [
                createBaseVNode("button", {
                  type: "button",
                  class: "text-xs text-fg-primary underline underline-offset-2 transition-colors hover:text-brand-400",
                  onClick: _cache[4] || (_cache[4] = ($event) => hasPassword.value ? removePromptOpen.value = !removePromptOpen.value : passwordPromptOpen.value = !passwordPromptOpen.value)
                }, toDisplayString(hasPassword.value ? "移除" : "设置"), 1)
              ])
            ])
          ]),
          passwordPromptOpen.value ? (openBlock(), createElementBlock("div", _hoisted_13$5, [
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => passwordInput.value = $event),
              type: "password",
              placeholder: "输入文件夹密码",
              class: "h-7 min-w-0 flex-1 rounded-md border border-line-default bg-surface-1 px-2 text-xs text-fg-primary focus:outline-none focus:border-brand-500",
              onKeyup: withKeys(setPassword, ["enter"])
            }, null, 544), [
              [vModelText, passwordInput.value]
            ]),
            createVNode(_sfc_main$N, {
              size: "sm",
              variant: "primary",
              onClick: setPassword
            }, {
              default: withCtx(() => [..._cache[12] || (_cache[12] = [
                createTextVNode("保存", -1)
              ])]),
              _: 1
            })
          ])) : createCommentVNode("", true),
          removePromptOpen.value ? (openBlock(), createElementBlock("div", _hoisted_14$4, [
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => removeInput.value = $event),
              type: "password",
              placeholder: "输入原密码以移除",
              class: "h-7 min-w-0 flex-1 rounded-md border border-line-default bg-surface-1 px-2 text-xs text-fg-primary focus:outline-none focus:border-brand-500",
              onKeyup: withKeys(removePassword, ["enter"])
            }, null, 544), [
              [vModelText, removeInput.value]
            ]),
            createVNode(_sfc_main$N, {
              size: "sm",
              variant: "danger",
              onClick: removePassword
            }, {
              default: withCtx(() => [..._cache[13] || (_cache[13] = [
                createTextVNode("移除", -1)
              ])]),
              _: 1
            })
          ])) : createCommentVNode("", true)
        ]),
        createBaseVNode("div", _hoisted_15$4, [
          createVNode(_sfc_main$N, {
            variant: "secondary",
            class: "w-full",
            onClick: handleExport
          }, {
            default: withCtx(() => [
              createBaseVNode("span", _hoisted_16$3, [
                createVNode(_sfc_main$L, { icon: "ic-inspector-export" }),
                _cache[17] || (_cache[17] = createTextVNode(" 导出文件夹 ", -1))
              ])
            ]),
            _: 1
          })
        ])
      ]);
    };
  }
}
