/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$k = /* @__PURE__ */ defineComponent(
*/
{
  __name: "PluginSandbox",
  props: {
    plugin: {},
    payload: {},
    height: {}
  },
  setup(__props) {
    const props = __props;
    const iframeRef = ref(null);
    const srcDoc = ref("");
    const loadError = ref("");
    function injectCsp(html) {
      try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const head = doc.head ?? doc.createElement("head");
        const meta = doc.createElement("meta");
        meta.setAttribute("http-equiv", "Content-Security-Policy");
        meta.setAttribute("content", PLUGIN_CSP);
        const webrtcBlock = doc.createElement("script");
        webrtcBlock.textContent = "try{RTCPeerConnection=undefined;webkitRTCPeerConnection=undefined}catch(_){}";
        head.prepend(meta, webrtcBlock);
        if (!doc.head) doc.documentElement.prepend(head);
        return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
      } catch {
        return `<head><meta http-equiv="Content-Security-Policy" content="${PLUGIN_CSP}"></head>${html}`;
      }
    }
    function plainPayload(v2) {
      if (v2 === null || v2 === void 0 || typeof v2 !== "object") return v2 ?? null;
      try {
        return JSON.parse(JSON.stringify(v2));
      } catch {
        return null;
      }
    }
    function onMessage(e64) {
      const win = iframeRef.value?.contentWindow;
      if (!win || e64.source !== win) return;
      const msg = e64.data;
      if (msg?.type === "leaf:ready") {
        win.postMessage({ type: "leaf:data", payload: plainPayload(props.payload) }, "*");
      }
    }
    function pushPayload() {
      const win = iframeRef.value?.contentWindow;
      if (win) win.postMessage({ type: "leaf:data", payload: plainPayload(props.payload) }, "*");
    }
    onMounted(async () => {
      window.addEventListener("message", onMessage);
      const res = await window.api.plugins.readAsset(props.plugin.id, props.plugin.entry);
      if (res.ok) srcDoc.value = injectCsp(res.content);
      else loadError.value = res.error;
    });
    onBeforeUnmount(() => {
      window.removeEventListener("message", onMessage);
    });
    watch(
      () => props.payload,
      () => pushPayload()
    );
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$k, [
        createBaseVNode("div", _hoisted_2$k, [
          createBaseVNode("span", _hoisted_3$i, toDisplayString(__props.plugin.name), 1),
          createBaseVNode("span", _hoisted_4$g, "v" + toDisplayString(__props.plugin.version), 1)
        ]),
        loadError.value ? (openBlock(), createElementBlock("p", _hoisted_5$g, toDisplayString(loadError.value), 1)) : createCommentVNode("", true),
        withDirectives(createBaseVNode("iframe", {
          ref_key: "iframeRef",
          ref: iframeRef,
          srcdoc: srcDoc.value,
          sandbox: "allow-scripts",
          class: "block w-full",
          style: normalizeStyle({ height: `${__props.height ?? 120}px` }),
          title: "plugin sandbox"
        }, null, 12, _hoisted_6$g), [
          [vShow, srcDoc.value && !loadError.value]
        ])
      ]);
    };
  }
}
