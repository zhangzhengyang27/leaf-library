/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$q = /* @__PURE__ */ defineComponent(
*/
{
  __name: "AssetThumb",
  props: {
    photo: {},
    natural: { type: Boolean, default: false },
    cover: { type: Boolean, default: false }
  },
  setup(__props) {
    const props = __props;
    const hoverPlay = ref(false);
    const thumbSizeCls = computed(() => {
      return "w-full h-full object-cover";
    });
    const videoUrl = computed(() => {
      return mediaUrl("video", props.photo.filePath);
    });
    const thumbFailed = ref(false);
    const thumbRetryKey = ref(0);
    let thumbRetryTimer;
    let thumbRetryCount = 0;
    const retryThumb = () => {
      thumbFailed.value = false;
      thumbRetryKey.value++;
    };
    const handleImageError = () => {
      thumbFailed.value = true;
      if (thumbRetryCount >= 2 || props.photo.thumbStatus === 2) return;
      thumbRetryCount++;
      if (thumbRetryTimer !== void 0) clearTimeout(thumbRetryTimer);
      thumbRetryTimer = window.setTimeout(() => {
        thumbRetryTimer = void 0;
        if (!thumbFailed.value) return;
        if (props.photo.thumbStatus === 2) return;
        retryThumb();
      }, 5e3);
    };
    watch(
      () => props.photo,
      (next) => {
        thumbRetryCount = 0;
        if (!thumbFailed.value) return;
        if (next && next.thumbStatus !== 2) retryThumb();
      }
    );
    onUnmounted(() => {
      if (thumbRetryTimer !== void 0) clearTimeout(thumbRetryTimer);
    });
    const durationLabel = computed(() => {
      const ms2 = props.photo.durationMs;
      if (!ms2) return "";
      const total = Math.round(ms2 / 1e3);
      const m2 = Math.floor(total / 60);
      const s2 = total % 60;
      return m2 > 0 ? `${m2}:${String(s2).padStart(2, "0")}` : `0:${String(s2).padStart(2, "0")}`;
    });
    const fontNameCache = reactive(/* @__PURE__ */ new Map());
    function cacheFontName(id3, name) {
      if (fontNameCache.size >= FONT_CACHE_MAX) {
        const oldest = fontNameCache.keys().next().value;
        if (oldest !== void 0) fontNameCache.delete(oldest);
      }
      fontNameCache.set(id3, name);
    }
    const fallbackFontName = (fileName) => fileName.replace(/\.(ttf|otf|woff2?|ttc)$/i, "").replace(/[-_]/g, " ");
    const fontDisplayName = computed(() => {
      const photo = props.photo;
      if (!isFontFile(photo.fileName)) return "";
      return fontNameCache.get(photo.id) ?? fallbackFontName(photo.fileName);
    });
    watch(
      () => props.photo.id,
      () => {
        const photo = props.photo;
        if (!isFontFile(photo.fileName) || fontNameCache.has(photo.id)) return;
        cacheFontName(photo.id, fallbackFontName(photo.fileName));
        void window.api.photos.fontInfo(photo.filePath).then((info) => {
          if (info?.familyName) {
            const label = info.subfamilyName && !/^regular$/i.test(info.subfamilyName) ? `${info.familyName} ${info.subfamilyName}` : info.familyName;
            cacheFontName(photo.id, label);
          }
        }).catch(() => {
        });
      },
      { immediate: true }
    );
    const bookmarkTitle = computed(
      () => props.photo.fileName.replace(/\.png$/i, "").replace(/^\d+_/, "")
    );
    const bookmarkDomain = computed(() => {
      try {
        return new URL(props.photo.sourceUrl ?? "").hostname;
      } catch {
        return "";
      }
    });
    const fileExtension = computed(() => {
      const idx = props.photo.fileName.lastIndexOf(".");
      return idx >= 0 ? props.photo.fileName.slice(idx + 1) : "file";
    });
    const tabs = useLibraryTabs();
    const isAnimated = computed(
      () => props.photo.kind === "image" && /\.(gif|webp)$/i.test(props.photo.fileName)
    );
    const thumbSrc = computed(() => {
      if (isAnimated.value && tabs.active.display.autoPlayGif) {
        return mediaUrl("image", props.photo.filePath);
      }
      return `thumb://256/${props.photo.id}`;
    });
    const TEXT_EXTS = /* @__PURE__ */ new Set([...TEXT_EXTENSIONS, ...CODE_EXTENSIONS]);
    const isTextFile2 = computed(
      () => (props.photo.kind === "file" || props.photo.kind === "text") && TEXT_EXTS.has(fileExtension.value.toLowerCase())
    );
    const textTitle = computed(() => {
      const i2 = props.photo.fileName.lastIndexOf(".");
      return i2 > 0 ? props.photo.fileName.slice(0, i2) : props.photo.fileName;
    });
    const textCache = reactive(/* @__PURE__ */ new Map());
    const textContent2 = computed(() => isTextFile2.value ? textCache.get(props.photo.id) : void 0);
    watch(
      () => props.photo.id,
      () => {
        const photo = props.photo;
        if (!isTextFile2.value || textCache.has(photo.id)) return;
        textCache.set(photo.id, null);
        void window.api.photos.readTextFile(photo.filePath, 8192).then((r2) => {
          textCache.set(photo.id, r2.ok ? r2.content.slice(0, 400) : null);
        }).catch(() => textCache.set(photo.id, null));
        if (textCache.size > TEXT_CACHE_MAX) {
          const oldest = textCache.keys().next().value;
          if (oldest !== void 0) textCache.delete(oldest);
        }
      },
      { immediate: true }
    );
    return (_ctx, _cache) => {
      return __props.photo.kind === "image" && __props.photo.thumbStatus === 2 ? (openBlock(), createElementBlock("div", _hoisted_1$q, [
        _cache[3] || (_cache[3] = createBaseVNode("span", { class: "text-4xl" }, "🖼️", -1)),
        createBaseVNode("span", _hoisted_2$q, toDisplayString(fileExtension.value.toUpperCase()), 1)
      ])) : __props.photo.kind === "image" ? (openBlock(), createElementBlock("img", {
        key: thumbRetryKey.value,
        src: thumbFailed.value ? THUMB_PLACEHOLDER : thumbSrc.value,
        alt: __props.photo.fileName,
        class: normalizeClass(thumbSizeCls.value),
        loading: "lazy",
        onError: handleImageError
      }, null, 42, _hoisted_3$m)) : __props.photo.kind === "video" ? (openBlock(), createElementBlock("div", {
        key: 2,
        class: "relative w-full h-full",
        onMouseenter: _cache[1] || (_cache[1] = ($event) => hoverPlay.value = true),
        onMouseleave: _cache[2] || (_cache[2] = ($event) => hoverPlay.value = false)
      }, [
        hoverPlay.value ? (openBlock(), createElementBlock("video", {
          key: 0,
          src: videoUrl.value,
          muted: "",
          autoplay: "",
          loop: "",
          playsinline: "",
          class: "w-full h-full object-cover",
          onError: _cache[0] || (_cache[0] = ($event) => hoverPlay.value = false)
        }, null, 40, _hoisted_4$j)) : (openBlock(), createElementBlock("img", {
          key: thumbRetryKey.value,
          src: thumbFailed.value ? THUMB_PLACEHOLDER : `thumb://256/${__props.photo.id}`,
          alt: __props.photo.fileName,
          class: normalizeClass(thumbSizeCls.value),
          loading: "lazy",
          onError: handleImageError
        }, null, 42, _hoisted_5$j)),
        durationLabel.value ? (openBlock(), createElementBlock("span", _hoisted_6$j, toDisplayString(durationLabel.value), 1)) : createCommentVNode("", true)
      ], 32)) : __props.photo.kind === "audio" ? (openBlock(), createElementBlock("div", _hoisted_7$h, [
        _cache[4] || (_cache[4] = createBaseVNode("span", { class: "text-4xl" }, "🎵", -1)),
        durationLabel.value ? (openBlock(), createElementBlock("span", _hoisted_8$f, toDisplayString(durationLabel.value), 1)) : createCommentVNode("", true)
      ])) : __props.photo.kind === "font" ? (openBlock(), createElementBlock("div", _hoisted_9$e, [
        _cache[5] || (_cache[5] = createBaseVNode("span", { class: "text-4xl font-serif text-gray-700 dark:text-gray-200" }, "Aa", -1)),
        createBaseVNode("span", _hoisted_10$e, toDisplayString(fontDisplayName.value), 1)
      ])) : __props.photo.kind === "bookmark" ? (openBlock(), createElementBlock("div", _hoisted_11$a, [
        _cache[6] || (_cache[6] = createBaseVNode("span", { class: "text-4xl" }, "🌐", -1)),
        createBaseVNode("span", _hoisted_12$a, toDisplayString(bookmarkTitle.value), 1),
        createBaseVNode("span", _hoisted_13$9, toDisplayString(bookmarkDomain.value), 1)
      ])) : isTextFile2.value && textContent2.value ? (openBlock(), createElementBlock("div", _hoisted_14$8, [
        createBaseVNode("p", _hoisted_15$8, toDisplayString(textTitle.value), 1),
        createBaseVNode("pre", _hoisted_16$7, toDisplayString(textContent2.value), 1)
      ])) : (openBlock(), createElementBlock("div", _hoisted_17$5, [
        _cache[7] || (_cache[7] = createBaseVNode("span", { class: "text-3xl" }, "📄", -1)),
        createBaseVNode("span", _hoisted_18$4, toDisplayString(fileExtension.value), 1)
      ]));
    };
  }
}
