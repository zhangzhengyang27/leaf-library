/* 2026-09-22 从 09-21 21:22 的 renderer 构建 bundle(index-Emqdqdyt.js) 按 __name 切出的组件块。
   非原始 .vue：模板已编译成 render 函数、无类型标注，仅供重写参考。
   声明行: const _sfc_main$j = /* @__PURE__ */ defineComponent(
*/
{
  __name: "AudioPlayer",
  props: {
    photoId: {},
    src: {},
    durationMs: {},
    bpm: {},
    filePath: {}
  },
  setup(__props, { expose: __expose }) {
    const props = __props;
    const audioRef = ref(null);
    const canvasRef = ref(null);
    const peaks = ref(null);
    const playing = ref(false);
    const failed = ref(false);
    const currentSec = ref(0);
    const elementDurationSec = ref(0);
    const totalSec = computed(() => {
      const d2 = elementDurationSec.value;
      if (Number.isFinite(d2) && d2 > 0) return d2;
      const db2 = (props.durationMs ?? 0) / 1e3;
      return db2 > 0 ? db2 : 0;
    });
    const progress2 = computed(
      () => totalSec.value > 0 ? Math.min(1, currentSec.value / totalSec.value) : 0
    );
    let raf = 0;
    let dragging = false;
    let observer = null;
    function fmt(sec) {
      if (!Number.isFinite(sec) || sec < 0) sec = 0;
      const s2 = Math.floor(sec % 60);
      const m2 = Math.floor(sec / 60) % 60;
      const h2 = Math.floor(sec / 3600);
      const mm2 = String(m2).padStart(2, "0");
      const ss2 = String(s2).padStart(2, "0");
      return h2 > 0 ? `${h2}:${mm2}:${ss2}` : `${m2}:${ss2}`;
    }
    async function loadFacts() {
      peaks.value = null;
      failed.value = false;
      currentSec.value = 0;
      elementDurationSec.value = 0;
      const facts = await window.api.audio.waveform(props.photoId);
      if (facts?.peaks?.length) peaks.value = facts.peaks;
    }
    function draw() {
      const canvas = canvasRef.value;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w2 = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h2 = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w2 || canvas.height !== h2) {
        canvas.width = w2;
        canvas.height = h2;
      }
      ctx.clearRect(0, 0, w2, h2);
      const cols = Math.max(1, Math.round(canvas.clientWidth));
      const bars = peaks.value ? columnPeaks(peaks.value, cols) : null;
      const colW = w2 / cols;
      const cut = progress2.value * w2;
      const mid = h2 / 2;
      for (let c2 = 0; c2 < cols; c2++) {
        const x2 = c2 * colW;
        const v2 = bars ? bars[c2] : 0.18;
        const barH = Math.max(dpr, v2 * (h2 - 2 * dpr));
        ctx.fillStyle = x2 + colW <= cut ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.26)";
        ctx.fillRect(x2, mid - barH / 2, Math.max(1, colW - dpr), barH);
      }
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillRect(Math.min(w2 - 2 * dpr, cut), 0, 2 * dpr, h2);
    }
    function tick() {
      const audio = audioRef.value;
      if (audio) currentSec.value = audio.currentTime;
      draw();
      if (audio && !audio.paused) raf = requestAnimationFrame(tick);
      else raf = 0;
    }
    function startTick() {
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function stopTick() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function onLoadedMetadata() {
      elementDurationSec.value = audioRef.value?.duration ?? 0;
      draw();
    }
    function onTimeUpdate() {
      const audio = audioRef.value;
      if (audio) currentSec.value = audio.currentTime;
      if (!dragging) draw();
    }
    function onPlay() {
      playing.value = true;
      failed.value = false;
      startTick();
    }
    function onPause() {
      playing.value = false;
      stopTick();
      draw();
    }
    function onError() {
      failed.value = true;
      playing.value = false;
    }
    async function toggle() {
      const audio = audioRef.value;
      if (!audio) return;
      if (!audio.paused) {
        audio.pause();
        return;
      }
      try {
        await audio.play();
      } catch {
        failed.value = true;
      }
    }
    function seekRatio(clientX) {
      const canvas = canvasRef.value;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      return seekRatioFromPointer(rect.left, rect.width, clientX);
    }
    function seekTo(ratio) {
      const audio = audioRef.value;
      if (!audio) return;
      const dur = totalSec.value;
      if (!(dur > 0)) return;
      currentSec.value = ratio * dur;
      audio.currentTime = currentSec.value;
      draw();
    }
    function onPointerDown(e64) {
      const canvas = canvasRef.value;
      if (!canvas) return;
      dragging = true;
      canvas.setPointerCapture?.(e64.pointerId);
      seekTo(seekRatio(e64.clientX));
    }
    function onPointerMove(e64) {
      if (!dragging) return;
      seekTo(seekRatio(e64.clientX));
    }
    function onPointerUp() {
      dragging = false;
    }
    function openExternally() {
      const path = props.filePath;
      if (!path) return;
      void window.api.system.openPath(path);
    }
    onMounted(() => {
      draw();
      if (typeof ResizeObserver !== "undefined" && canvasRef.value) {
        observer = new ResizeObserver(() => draw());
        observer.observe(canvasRef.value);
      }
    });
    onBeforeUnmount(() => {
      stopTick();
      observer?.disconnect();
      observer = null;
    });
    watch(() => props.photoId, () => void loadFacts().then(draw), { immediate: true });
    __expose({ toggle });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$j, [
        _cache[1] || (_cache[1] = createBaseVNode("div", { class: "text-6xl opacity-70" }, "🎵", -1)),
        createBaseVNode("canvas", {
          ref_key: "canvasRef",
          ref: canvasRef,
          "data-waveform": "",
          class: "h-16 w-full cursor-pointer touch-none rounded-lg bg-white/5",
          onPointerdown: onPointerDown,
          onPointermove: onPointerMove,
          onPointerup: onPointerUp,
          onPointercancel: onPointerUp
        }, null, 544),
        createBaseVNode("div", _hoisted_2$j, [
          createBaseVNode("button", {
            type: "button",
            class: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm hover:bg-white/20",
            "aria-label": playing.value ? "暂停" : "播放",
            title: playing.value ? "暂停（空格）" : "播放（空格）",
            onClick: toggle
          }, toDisplayString(playing.value ? "⏸" : "▶"), 9, _hoisted_3$h),
          createBaseVNode("span", _hoisted_4$f, toDisplayString(fmt(currentSec.value)) + " / " + toDisplayString(fmt(totalSec.value)), 1),
          __props.bpm ? (openBlock(), createElementBlock("span", {
            key: 0,
            class: "shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-gray-300",
            title: `节拍估计 ${__props.bpm} BPM（${peaks.value ? "按前 120 秒起拍算" : "未做波形分析，按全长算"}）`
          }, " ≈ " + toDisplayString(__props.bpm) + " BPM ", 9, _hoisted_5$f)) : createCommentVNode("", true),
          !peaks.value ? (openBlock(), createElementBlock("span", _hoisted_6$f, "无波形数据")) : createCommentVNode("", true),
          failed.value ? (openBlock(), createElementBlock("span", _hoisted_7$e, [
            _cache[0] || (_cache[0] = createTextVNode(" 应用内播放失败 ", -1)),
            __props.filePath ? (openBlock(), createElementBlock("button", {
              key: 0,
              type: "button",
              class: "rounded bg-white/10 px-2 py-0.5 text-[11px] hover:bg-white/20",
              onClick: openExternally
            }, " 用系统播放器打开 ")) : createCommentVNode("", true)
          ])) : createCommentVNode("", true)
        ]),
        createBaseVNode("audio", {
          ref_key: "audioRef",
          ref: audioRef,
          src: __props.src,
          controls: "",
          preload: "metadata",
          style: { "display": "block", "position": "absolute", "width": "1px", "height": "1px", "opacity": "0", "pointer-events": "none" },
          onLoadedmetadata: onLoadedMetadata,
          onTimeupdate: onTimeUpdate,
          onPlay,
          onPause,
          onError
        }, null, 40, _hoisted_8$c)
      ]);
    };
  }
}
