/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$1 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "FreeformCanvas",
  props: {
    photos: {},
    selectedSet: {},
    display: {}
  },
  emits: ["click-select", "preview-photo", "context-menu"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const filters = usePhotoFilters();
    const folderId = computed(() => filters.activeFolder.value?.id ?? null);
    const positions = ref(/* @__PURE__ */ new Map());
    const containerRef = ref(null);
    const canvasW = ref(1200);
    const aspectOf = (p2) => p2.width && p2.height && p2.height > 0 ? p2.width / p2.height : 1;
    const itemW = (p2) => BASE_W * (positions.value.get(p2.id)?.scale ?? 1);
    const itemH = (p2) => itemW(p2) / aspectOf(p2);
    const itemStyle = (photo) => {
      const pos = positions.value.get(photo.id);
      return {
        left: `${pos?.x ?? 0}px`,
        top: `${pos?.y ?? 0}px`,
        width: `${itemW(photo)}px`,
        zIndex: props.selectedSet.has(photo.id) ? "10" : "1"
      };
    };
    const canvasHeight = computed(() => {
      let max = 240;
      for (const p2 of props.photos) {
        const pos = positions.value.get(p2.id);
        if (!pos) continue;
        max = Math.max(max, pos.y + itemH(p2) + 24);
      }
      return max;
    });
    let saveTimer = null;
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void persist2(), SAVE_DEBOUNCE_MS);
    }
    async function persist2() {
      const fid = folderId.value;
      if (!fid) return;
      const items2 = [...positions.value.entries()].map(([photoId, pos]) => ({
        photoId,
        x: pos.x,
        y: pos.y,
        scale: pos.scale
      }));
      try {
        await window.api.photos.setFreeformPositions(fid, items2);
      } catch (err) {
        console.error("[FreeformCanvas] save failed:", err);
      }
    }
    function ensurePositions() {
      const missing = props.photos.filter((p2) => !positions.value.has(p2.id));
      if (missing.length === 0) return;
      const existing = [];
      for (const p2 of props.photos) {
        const pos = positions.value.get(p2.id);
        if (pos)
          existing.push({
            x: pos.x,
            y: pos.y,
            w: BASE_W * pos.scale,
            h: BASE_W * pos.scale / aspectOf(p2)
          });
      }
      const heights = missing.map((p2) => BASE_W / aspectOf(p2));
      const placed = autoPlace(heights, existing, BASE_W, Math.max(canvasW.value, 800));
      missing.forEach((p2, i2) => {
        positions.value.set(p2.id, { x: placed[i2].x, y: placed[i2].y, scale: 1 });
      });
      scheduleSave();
    }
    watch(
      folderId,
      async (fid) => {
        positions.value = /* @__PURE__ */ new Map();
        if (!fid) return;
        try {
          const rows = await window.api.photos.getFreeformPositions(fid);
          if (folderId.value !== fid) return;
          const map2 = /* @__PURE__ */ new Map();
          for (const r2 of rows) map2.set(r2.photoId, { x: r2.x, y: r2.y, scale: r2.scale });
          positions.value = map2;
        } catch {
          if (folderId.value === fid) positions.value = /* @__PURE__ */ new Map();
        }
        if (folderId.value === fid) ensurePositions();
      },
      { immediate: true }
    );
    watch(
      () => props.photos.map((p2) => p2.id).join(","),
      () => {
        const alive = new Set(props.photos.map((p2) => p2.id));
        for (const id3 of [...positions.value.keys()]) {
          if (!alive.has(id3)) positions.value.delete(id3);
        }
        ensurePositions();
      }
    );
    let resizeObserver = null;
    watch(containerRef, (el2) => {
      resizeObserver?.disconnect();
      if (!el2) return;
      resizeObserver = new ResizeObserver((entries) => {
        const w2 = entries[0]?.contentRect.width ?? 0;
        if (w2 > 0) canvasW.value = w2;
      });
      resizeObserver.observe(el2);
    });
    onBeforeUnmount(() => {
      resizeObserver?.disconnect();
      if (saveTimer) clearTimeout(saveTimer);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      drag = null;
    });
    let drag = null;
    function snapshotOrig(ids) {
      const m2 = /* @__PURE__ */ new Map();
      for (const id3 of ids) {
        const pos = positions.value.get(id3);
        if (pos) m2.set(id3, { ...pos });
      }
      return m2;
    }
    function onPointerDown(e64, photo) {
      if (e64.button !== 0) return;
      const ids = props.selectedSet.has(photo.id) ? props.photos.filter((p2) => props.selectedSet.has(p2.id) && positions.value.has(p2.id)).map((p2) => p2.id) : [photo.id];
      drag = {
        kind: "move",
        id: photo.id,
        startX: e64.clientX,
        startY: e64.clientY,
        moved: false,
        orig: snapshotOrig(ids),
        origScale: positions.value.get(photo.id)?.scale ?? 1
      };
      e64.currentTarget.setPointerCapture(e64.pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
      window.addEventListener("pointercancel", onPointerCancel);
    }
    function onResizeDown(e64, photo) {
      drag = {
        kind: "resize",
        id: photo.id,
        startX: e64.clientX,
        startY: e64.clientY,
        moved: false,
        orig: snapshotOrig([photo.id]),
        origScale: positions.value.get(photo.id)?.scale ?? 1
      };
      e64.currentTarget.setPointerCapture(e64.pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
      window.addEventListener("pointercancel", onPointerCancel);
    }
    function onPointerMove(e64) {
      if (!drag) return;
      if (e64.buttons === 0) return;
      const dx2 = e64.clientX - drag.startX;
      const dy2 = e64.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx2) < 3 && Math.abs(dy2) < 3) return;
      drag.moved = true;
      if (drag.kind === "move") {
        const snapOn = !e64.altKey;
        for (const [id3, orig] of drag.orig) {
          positions.value.set(id3, {
            x: snapOn ? snap(orig.x + dx2) : Math.round(orig.x + dx2),
            y: snapOn ? snap(orig.y + dy2) : Math.round(orig.y + dy2),
            scale: orig.scale
          });
        }
      } else {
        const width = BASE_W * drag.origScale + dx2;
        const scale = clampScale(Math.round(width / BASE_W * 20) / 20);
        const orig = drag.orig.get(drag.id);
        if (orig) positions.value.set(drag.id, { ...orig, scale });
      }
    }
    function onPointerUp(e64) {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointercancel", onPointerCancel);
      const d2 = drag;
      drag = null;
      if (!d2) return;
      if (!d2.moved) {
        emit("click-select", d2.id, { metaKey: e64.metaKey, ctrlKey: e64.ctrlKey, shiftKey: e64.shiftKey });
        return;
      }
      scheduleSave();
    }
    function onPointerCancel() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointercancel", onPointerCancel);
      if (drag) {
        for (const [id3, pos] of drag.orig) positions.value.set(id3, { ...pos });
      }
      drag = null;
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "containerRef",
        ref: containerRef,
        class: "relative w-full"
      }, [
        createBaseVNode("div", {
          class: "relative",
          style: normalizeStyle({ width: "100%", height: canvasHeight.value + "px" }),
          onContextmenu: _cache[0] || (_cache[0] = withModifiers(() => {
          }, ["prevent"]))
        }, [
          __props.photos.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_1$1, " 文件夹为空——把素材拖入或右键新建 ")) : createCommentVNode("", true),
          (openBlock(true), createElementBlock(Fragment, null, renderList(__props.photos, (photo) => {
            return openBlock(), createElementBlock("div", {
              key: photo.id,
              class: "absolute select-none",
              style: normalizeStyle(itemStyle(photo)),
              "data-photo-id": photo.id,
              onPointerdown: ($event) => onPointerDown($event, photo),
              onDblclick: ($event) => emit("preview-photo", photo),
              onContextmenu: withModifiers(($event) => emit("context-menu", { photo, x: $event.clientX, y: $event.clientY }), ["prevent", "stop"])
            }, [
              createBaseVNode("div", {
                class: normalizeClass(["h-full w-full overflow-hidden rounded-[3px] border-2 bg-surface-2 transition-shadow duration-fast", __props.selectedSet.has(photo.id) ? "border-brand-500 shadow-lg" : "border-transparent"])
              }, [
                createVNode(_sfc_main$q, {
                  photo,
                  cover: true
                }, null, 8, ["photo"])
              ], 2),
              createBaseVNode("span", {
                class: normalizeClass(["absolute -bottom-1 -right-1 size-3 cursor-nwse-resize rounded-full border border-white bg-brand-500 opacity-0 transition-opacity duration-fast group-hover:opacity-100", __props.selectedSet.has(photo.id) ? "opacity-100" : ""]),
                onPointerdown: withModifiers(($event) => onResizeDown($event, photo), ["stop"])
              }, null, 42, _hoisted_3$1)
            ], 44, _hoisted_2$1);
          }), 128))
        ], 36),
        _cache[1] || (_cache[1] = createBaseVNode("p", { class: "pb-4 pt-1 text-center text-[11px] text-fg-muted" }, " 自由网格：拖拽摆放 · 角部圆点缩放 · Alt 拖拽关闭吸附 · 双击预览（仅文件夹视图） ", -1))
      ], 512);
    };
  }
}
