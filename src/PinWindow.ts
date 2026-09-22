/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(capture-D9ynX89i.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$1 = /* @__PURE__ */ defineComponent(
*/
{
  __name: "PinWindow",
  props: {
    payloadId: {}
  },
  setup(__props) {
    const props = __props;
    const dataUrl = ref("");
    const showMenu = ref(false);
    const menuPos = ref({ x: 0, y: 0 });
    let dragging = false;
    let last = { x: 0, y: 0 };
    let pendingDx = 0;
    let pendingDy = 0;
    let rafId = 0;
    async function save(actions) {
      await window.api.screenshot.save({
        dataUrl: dataUrl.value,
        displayId: 0,
        region: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
        actions
      });
    }
    function onDragStart(e) {
      if (e.button !== 0) return;
      dragging = true;
      last = { x: e.screenX, y: e.screenY };
    }
    function flushDrag() {
      if (pendingDx !== 0 || pendingDy !== 0) {
        const dx = pendingDx;
        const dy = pendingDy;
        pendingDx = 0;
        pendingDy = 0;
        void window.api.screenshot.dragPin(dx, dy);
      }
      rafId = 0;
    }
    function onDragMove(e) {
      if (!dragging) return;
      pendingDx += e.screenX - last.x;
      pendingDy += e.screenY - last.y;
      last = { x: e.screenX, y: e.screenY };
      if (!rafId) rafId = window.requestAnimationFrame(flushDrag);
    }
    function onDragEnd() {
      dragging = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      flushDrag();
    }
    function onWheel(e) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const w = Math.round(window.innerWidth * factor);
      const h = Math.round(window.innerHeight * factor);
      if (w >= 60 && h >= 60) window.resizeTo(w, h);
    }
    async function onDblClick() {
      await window.api.screenshot.closePin(props.payloadId);
      window.close();
    }
    function onContextMenu(e) {
      e.preventDefault();
      menuPos.value = { x: e.clientX, y: e.clientY };
      showMenu.value = true;
    }
    async function copyImage() {
      await save({ library: false, clipboard: true, file: false, pin: false });
      showToast("已复制");
      showMenu.value = false;
    }
    async function toLibrary() {
      await save({ library: true, clipboard: false, file: false, pin: false });
      showToast("已入库");
      showMenu.value = false;
    }
    async function close() {
      await window.api.screenshot.closePin(props.payloadId);
      window.close();
    }
    function onKeydown(e) {
      if (e.key === "Escape") {
        if (showMenu.value) showMenu.value = false;
        else void close();
      }
    }
    onMounted(async () => {
      const payload = await window.api.screenshot.getPinPayload(props.payloadId);
      if (!payload.ok || !payload.dataUrl) {
        await window.api.screenshot.closePin(props.payloadId);
        window.close();
        return;
      }
      dataUrl.value = payload.dataUrl;
      window.addEventListener("keydown", onKeydown, true);
    });
    onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "h-full w-full overflow-hidden",
        onMousedown: onDragStart,
        onMousemove: onDragMove,
        onMouseup: onDragEnd,
        onWheel,
        onDblclick: onDblClick,
        onContextmenu: onContextMenu
      }, [
        createBaseVNode("img", {
          class: "h-full w-full",
          src: dataUrl.value,
          alt: "贴图",
          draggable: "false"
        }, null, 8, _hoisted_1),
        unref(toastMessage) ? (openBlock(), createElementBlock("div", _hoisted_2, toDisplayString(unref(toastMessage)), 1)) : createCommentVNode("", true),
        showMenu.value ? (openBlock(), createElementBlock("div", {
          key: 1,
          class: "fixed z-10 rounded-md border border-line-subtle bg-surface-1 py-1 text-xs shadow-xl",
          style: normalizeStyle({ left: `${menuPos.value.x}px`, top: `${menuPos.value.y}px` })
        }, [
          createBaseVNode("button", {
            class: "block w-full px-3 py-1.5 text-left text-fg-primary hover:bg-surface-2",
            onClick: copyImage
          }, " 复制图片 "),
          createBaseVNode("button", {
            class: "block w-full px-3 py-1.5 text-left text-fg-primary hover:bg-surface-2",
            onClick: toLibrary
          }, " 入库 "),
          createBaseVNode("button", {
            class: "block w-full px-3 py-1.5 text-left text-fg-primary hover:bg-surface-2",
            onClick: close
          }, " 关闭 ")
        ], 4)) : createCommentVNode("", true)
      ], 32);
    };
  }
}
