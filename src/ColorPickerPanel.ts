/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$E = /* @__PURE__ */ defineComponent(
*/
{
  __name: "ColorPickerPanel",
  setup(__props) {
    const tabs = useLibraryTabs();
    const hsv = reactive({ h: 0, s: 1, v: 1 });
    const svEl = ref(null);
    const hueEl = ref(null);
    const hexInput = ref("");
    const currentHex = computed(() => hsvToHex(hsv.h, hsv.s, hsv.v));
    function hsvToHex(h2, s2, v2) {
      const f2 = (n2) => {
        const k2 = (n2 + h2 / 60) % 6;
        const val = v2 - v2 * s2 * Math.max(Math.min(k2, 4 - k2, 1), 0);
        return Math.round(val * 255).toString(16).padStart(2, "0");
      };
      return `#${f2(5)}${f2(3)}${f2(1)}`.toUpperCase();
    }
    function hexToHsv(hex) {
      const m2 = hex.replace("#", "");
      const r2 = parseInt(m2.slice(0, 2), 16) / 255;
      const g2 = parseInt(m2.slice(2, 4), 16) / 255;
      const b2 = parseInt(m2.slice(4, 6), 16) / 255;
      const max = Math.max(r2, g2, b2);
      const min = Math.min(r2, g2, b2);
      const d2 = max - min;
      let h2 = 0;
      if (d2 > 0) {
        if (max === r2) h2 = (g2 - b2) / d2 % 6;
        else if (max === g2) h2 = (b2 - r2) / d2 + 2;
        else h2 = (r2 - g2) / d2 + 4;
        h2 = Math.round(h2 * 60);
        if (h2 < 0) h2 += 360;
      }
      return { h: h2, s: max === 0 ? 0 : d2 / max, v: max };
    }
    function applyBucket(bucket) {
      tabs.active.colorFilter = bucket;
      if (!bucket) tabs.active.colorClose = null;
      tabs.persist();
    }
    const MATCH_MODES = [
      { key: "bucket", label: "色系" },
      { key: "close", label: "近似色" }
    ];
    const matchMode = computed({
      get: () => tabs.active.colorMatch,
      set: (m2) => {
        tabs.active.colorMatch = m2;
        if (m2 === "close") {
          tabs.active.colorFilter = null;
          tabs.active.colorClose = tabs.active.colorClose ?? { hex: currentHex.value, accuracy: 20 };
        } else {
          tabs.active.colorClose = null;
        }
        tabs.persist();
      }
    });
    const accuracy = computed({
      get: () => tabs.active.colorClose?.accuracy ?? 20,
      set: (v2) => {
        tabs.active.colorClose = { hex: tabs.active.colorClose?.hex ?? currentHex.value, accuracy: v2 };
        tabs.persist();
      }
    });
    function applyHex(hex) {
      if (matchMode.value === "close") {
        tabs.active.colorClose = { hex: hex.toUpperCase(), accuracy: accuracy.value };
        tabs.active.colorFilter = null;
      } else {
        applyBucket(hueBucketOf(hex));
      }
      tabs.persist();
    }
    function commitHexInput() {
      const raw = hexInput.value.trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
        hexInput.value = "";
        return;
      }
      const { h: h2, s: s2, v: v2 } = hexToHsv(raw);
      hsv.h = h2;
      hsv.s = s2;
      hsv.v = v2;
      applyHex(raw);
      hexInput.value = "";
    }
    let dragging = null;
    function trackFromEvent(el2, e64) {
      if (!el2) return null;
      const rect = el2.getBoundingClientRect();
      const x2 = Math.min(Math.max((e64.clientX - rect.left) / rect.width, 0), 1);
      const y2 = Math.min(Math.max((e64.clientY - rect.top) / rect.height, 0), 1);
      return { x: x2, y: y2 };
    }
    function onSvDown(e64) {
      dragging = "sv";
      onSvMove(e64);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }
    function onHueDown(e64) {
      dragging = "hue";
      onHueMove(e64);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }
    function onSvMove(e64) {
      const pos = trackFromEvent(svEl.value, e64);
      if (!pos) return;
      hsv.s = pos.x;
      hsv.v = 1 - pos.y;
    }
    function onHueMove(e64) {
      const pos = trackFromEvent(hueEl.value, e64);
      if (!pos) return;
      hsv.h = Math.round(pos.y * 360) % 360;
    }
    function onPointerMove(e64) {
      if (dragging === "sv") onSvMove(e64);
      else if (dragging === "hue") onHueMove(e64);
    }
    function onPointerUp() {
      if (dragging) applyHex(currentHex.value);
      dragging = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }
    const SWATCHES = [
      { key: "none", css: "", label: "无色（清除筛选）" },
      { key: "#000000", css: "#000000", label: "黑" },
      { key: "#FFFFFF", css: "#FFFFFF", label: "白" },
      { key: "#C8C8C8", css: "#C8C8C8", label: "浅灰" },
      { key: "#7F7F7F", css: "#7F7F7F", label: "灰" },
      { key: "#8B5A2B", css: "#8B5A2B", label: "棕" },
      { key: "#F2A7C3", css: "#F2A7C3", label: "粉" },
      { key: "#E53935", css: "#E53935", label: "红" },
      { key: "#F57C00", css: "#F57C00", label: "橙" },
      { key: "#FDD835", css: "#FDD835", label: "黄" },
      { key: "#43A047", css: "#43A047", label: "绿" },
      { key: "#26A69A", css: "#26A69A", label: "青" },
      { key: "#1E88E5", css: "#1E88E5", label: "蓝" },
      { key: "#3949AB", css: "#3949AB", label: "靛" },
      { key: "#8E24AA", css: "#8E24AA", label: "紫" },
      { key: "#EC407A", css: "#EC407A", label: "洋红" }
    ];
    function pickSwatch(sw) {
      if (sw.key === "none") {
        applyBucket(null);
        return;
      }
      const { h: h2, s: s2, v: v2 } = hexToHsv(sw.css);
      hsv.h = h2;
      hsv.s = s2;
      hsv.v = v2;
      applyHex(sw.css);
    }
    const nativeInput = ref(null);
    function openNative() {
      nativeInput.value?.click();
    }
    function onNativePick(e64) {
      const v2 = e64.target.value;
      if (!v2) return;
      const { h: h2, s: s2, v: vv2 } = hexToHsv(v2);
      hsv.h = h2;
      hsv.s = s2;
      hsv.v = vv2;
      applyHex(v2);
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "w-64 p-2",
        onKeydown: withKeys(withModifiers(commitHexInput, ["prevent"]), ["enter"])
      }, [
        createBaseVNode("div", _hoisted_2$D, [
          createBaseVNode("div", {
            ref_key: "svEl",
            ref: svEl,
            class: "relative h-36 flex-1 cursor-crosshair rounded-sm",
            style: normalizeStyle({
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h}, 100%, 50%)`
            }),
            onPointerdown: withModifiers(onSvDown, ["prevent"])
          }, [
            createBaseVNode("span", {
              class: "pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow",
              style: normalizeStyle({
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                backgroundColor: currentHex.value
              })
            }, null, 4)
          ], 36),
          createBaseVNode("div", {
            ref_key: "hueEl",
            ref: hueEl,
            class: "relative w-3 cursor-pointer rounded-sm",
            style: { "background": "linear-gradient(\n            to bottom,\n            hsl(0 100% 50%),\n            hsl(60 100% 50%),\n            hsl(120 100% 50%),\n            hsl(180 100% 50%),\n            hsl(240 100% 50%),\n            hsl(300 100% 50%),\n            hsl(360 100% 50%)\n          )" },
            onPointerdown: withModifiers(onHueDown, ["prevent"])
          }, [
            createBaseVNode("span", {
              class: "pointer-events-none absolute -left-0.5 h-1.5 w-4 -translate-y-1/2 rounded-sm border border-white shadow",
              style: normalizeStyle({ top: `${hsv.h / 360 * 100}%`, backgroundColor: `hsl(${hsv.h}, 100%, 50%)` })
            }, null, 4)
          ], 544)
        ]),
        createBaseVNode("div", _hoisted_3$z, [
          (openBlock(), createElementBlock(Fragment, null, renderList(SWATCHES, (sw) => {
            return createBaseVNode("button", {
              key: sw.key,
              type: "button",
              class: normalizeClass(["aspect-square rounded-sm border border-black/10 transition-transform hover:scale-110", sw.key === "none" ? "bg-transparent" : ""]),
              style: normalizeStyle(
                sw.key === "none" ? "background: repeating-linear-gradient(45deg, #555 0 4px, #2a2a2a 4px 8px)" : { backgroundColor: sw.css }
              ),
              title: sw.label,
              onClick: ($event) => pickSwatch(sw)
            }, null, 14, _hoisted_4$w);
          }), 64))
        ]),
        createBaseVNode("div", _hoisted_5$w, [
          createBaseVNode("span", {
            class: "size-4 shrink-0 rounded-full border border-black/20",
            style: normalizeStyle({ backgroundColor: currentHex.value })
          }, null, 4),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => hexInput.value = $event),
            type: "text",
            placeholder: "#FF0000",
            spellcheck: "false",
            class: "min-w-0 flex-1 bg-transparent text-xs text-fg-primary uppercase placeholder:text-fg-muted focus:outline-none",
            "aria-label": "HEX 颜色值"
          }, null, 512), [
            [vModelText, hexInput.value]
          ]),
          createBaseVNode("button", {
            type: "button",
            class: "flex size-6 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110",
            style: {
              background: "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
            },
            title: "系统取色器",
            onClick: openNative
          }, [..._cache[2] || (_cache[2] = [
            createBaseVNode("span", { class: "size-3.5 rounded-full bg-surface-0" }, null, -1)
          ])]),
          createBaseVNode("input", {
            ref_key: "nativeInput",
            ref: nativeInput,
            type: "color",
            class: "hidden",
            onInput: onNativePick
          }, null, 544)
        ]),
        createBaseVNode("div", _hoisted_6$w, [
          (openBlock(), createElementBlock(Fragment, null, renderList(MATCH_MODES, (m2) => {
            return createBaseVNode("button", {
              key: m2.key,
              type: "button",
              class: normalizeClass([
                "rounded px-2 py-0.5 text-[11px] transition-colors",
                matchMode.value === m2.key ? "bg-brand-500 text-white" : "bg-surface-1 text-fg-muted hover:bg-surface-2"
              ]),
              onClick: ($event) => matchMode.value = m2.key
            }, toDisplayString(m2.label), 11, _hoisted_7$t);
          }), 64))
        ]),
        matchMode.value === "close" ? (openBlock(), createElementBlock("label", _hoisted_8$r, [
          createBaseVNode("span", _hoisted_9$o, [
            _cache[3] || (_cache[3] = createBaseVNode("span", null, "准确度", -1)),
            createBaseVNode("span", null, "色差 ≤ " + toDisplayString(unref(accuracyToMaxDelta)(accuracy.value)), 1)
          ]),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => accuracy.value = $event),
            type: "range",
            min: "5",
            max: "40",
            step: "1",
            class: "w-full",
            "aria-label": "颜色准确度"
          }, null, 512), [
            [
              vModelText,
              accuracy.value,
              void 0,
              { number: true }
            ]
          ])
        ])) : createCommentVNode("", true),
        createBaseVNode("p", _hoisted_10$o, toDisplayString(unref(tabs).active.colorClose ? `按近似色筛选：与 ${unref(tabs).active.colorClose.hex} 的色差 ≤ ${unref(accuracyToMaxDelta)(unref(tabs).active.colorClose.accuracy)}` : unref(tabs).active.colorFilter ? "已按最近色系过滤（9 桶等值）" : "未启用颜色筛选——任选颜色即按最近色系过滤"), 1)
      ], 40, _hoisted_1$E);
    };
  }
}
