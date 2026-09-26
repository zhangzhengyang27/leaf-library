<script setup lang="ts">
/**
 * 音频预览：波形条 + 播放/暂停 + 进度
 *
 * 之前这里是一个裸的 `<audio controls>`：Chromium 原生控件在 500px 宽的深色弹层里
 * 又小又暗，空格键还被"关预览"抢走（usePhotoKeyboard 只给可内联播放的视频开了例外），
 * 于是"点了没反应"和"按空格窗口关了"两件事叠在一起，看起来就像音频放不了。
 *
 * 峰值与 BPM 都是入库时算好的（AssetProcessingService → 迁移 024），这里只按 id 取一次；
 * 取不到（老素材没回填、超 45 分钟没分析）就退化成不带包络的进度条，照样能拖能 seek。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { columnPeaks, seekRatioFromPointer } from '@renderer/utils/audioWaveform'

const props = defineProps<{
  /** 只传 id：路径与波形都由主进程自己查，渲染层不经手文件路径 */
  photoId: string
  src: string
  /** 库里的时长（探测得到才有）：元素还没 loadedmetadata 时用它撑住刻度 */
  durationMs?: number | null
  /** 节拍估计，整数拍/分；没算出来是 null */
  bpm?: number | null
  /** 解码失败时的出口：交系统默认应用（与视频封面那条同语义） */
  filePath?: string
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const peaks = ref<number[] | null>(null)
const playing = ref(false)
const failed = ref(false)
const currentSec = ref(0)
const elementDurationSec = ref(0)

/** 元素给的优先，回落库里的：NaN/Infinity（部分容器探不到时长）都不能用 */
const totalSec = computed(() => {
  const d = elementDurationSec.value
  if (Number.isFinite(d) && d > 0) return d
  const db = (props.durationMs ?? 0) / 1000
  return db > 0 ? db : 0
})

const progress = computed(() =>
  totalSec.value > 0 ? Math.min(1, currentSec.value / totalSec.value) : 0
)

let raf = 0
let dragging = false
let observer: ResizeObserver | null = null

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

async function loadFacts(): Promise<void> {
  peaks.value = null
  failed.value = false
  reloadTried = false
  currentSec.value = 0
  elementDurationSec.value = 0
  const facts = await window.api.audio.waveform(props.photoId)
  if (facts?.peaks?.length) peaks.value = facts.peaks
}

/**
 * 元素真正用的源。默认就是 video://，坏加载时换成同一批字节的 blob:（见 onError）。
 *
 * 为什么要这条退路：实测 `video://` 的自定义协议媒体加载**会偶发直接被媒体栈判
 * 「无可用源」(MediaError 4)** —— 同一个时刻 `fetch(同一个 URL)` 拿到 200 + 正确 MIME +
 * 完整字节，把这些字节包成 blob 立刻能播（e2e 里这条对照就是 PLAYFAIL 的 `blobPlay` 字段）。
 * 也证明不是我们的容器/解码问题，而是自定义协议 + 流式响应这条路的时序问题。
 * 退路只在失败后走，正常播放仍然走流式（不把 30 MB 的歌读进内存）。
 */
const mediaSrc = ref('')
let blobUrl = ''

function releaseBlob(): void {
  if (!blobUrl) return
  URL.revokeObjectURL(blobUrl)
  blobUrl = ''
}

async function fallBackToBlob(): Promise<boolean> {
  if (blobUrl) return false
  try {
    const resp = await fetch(props.src)
    if (!resp.ok) return false
    const blob = await resp.blob()
    if (!blob.size) return false
    blobUrl = URL.createObjectURL(blob)
    mediaSrc.value = blobUrl
    return true
  } catch {
    return false
  }
}

function draw(): void {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.clearRect(0, 0, w, h)
  // 一 CSS 像素一列：400 个峰值在宽面板上会摊开、窄面板上抽稀，降采样按最大值取
  const cols = Math.max(1, Math.round(canvas.clientWidth))
  const bars = peaks.value ? columnPeaks(peaks.value, cols) : null
  const colW = w / cols
  const cut = progress.value * w
  const mid = h / 2
  for (let c = 0; c < cols; c++) {
    const x = c * colW
    // 没包络时画一根等高的淡柱，进度仍然是可视的
    const v = bars ? bars[c] : 0.18
    const barH = Math.max(dpr, v * (h - 2 * dpr))
    ctx.fillStyle = x + colW <= cut ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.26)'
    ctx.fillRect(x, mid - barH / 2, Math.max(1, colW - dpr), barH)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fillRect(Math.min(w - 2 * dpr, cut), 0, 2 * dpr, h)
}

function tick(): void {
  const audio = audioRef.value
  if (audio) currentSec.value = audio.currentTime
  draw()
  if (audio && !audio.paused) raf = requestAnimationFrame(tick)
  else raf = 0
}

function startTick(): void {
  if (!raf) raf = requestAnimationFrame(tick)
}

function stopTick(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function onLoadedMetadata(): void {
  elementDurationSec.value = audioRef.value?.duration ?? 0
  draw()
}

function onTimeUpdate(): void {
  // 暂停时靠这个挪指针（播放中由 rAF 管，两者不冲突：都读同一个 currentTime）
  const audio = audioRef.value
  if (audio) currentSec.value = audio.currentTime
  if (!dragging) draw()
}

function onPlay(): void {
  playing.value = true
  failed.value = false
  startTick()
}

function onPause(): void {
  playing.value = false
  stopTick()
  draw()
}

/**
 * 首帧自愈。实测：这个元素挂载后的第一次加载常被媒体栈直接判「无可用源」
 * （MediaError 4 + readyState 0），而**同一个 URL** 当场新建一个元素却秒播、
 * 对这个元素再 `load()` 一次也秒播——即一次坏掉的加载尝试，不是编码问题。
 * 用户侧就是"按了播放没反应"。所以 error 与 play() 拒绝之前都先重开一次加载，
 * 只给一次机会；仍然失败才把「应用内播放失败」摊到界面上。
 */
let reloadTried = false

function onError(): void {
  playing.value = false
  const audio = audioRef.value
  if (!audio) return
  if (!reloadTried) {
    reloadTried = true
    audio.load()
    return
  }
  // 第二次还是坏的就是那种"自定义协议 + 流式响应"的瞬时坏加载：换 blob 再来
  if (!blobUrl) {
    void fallBackToBlob()
    return
  }
  failed.value = true
}

async function toggle(): Promise<void> {
  const audio = audioRef.value
  if (!audio) return
  if (!audio.paused) {
    audio.pause()
    return
  }
  /**
   * 三段递进：直接播 → `load()` 重开再播 → 换成同字节的 blob: 再播。
   *
   * 为什么要走到第三段：挂载后的首次加载有时会坏在媒体栈里（同一个 URL 现建元素秒播、
   * 对同一元素 `load()` 后也秒播），而用户是在坏掉之后立刻按键 —— 这时 `error`
   * 可能还没落下来，`play()` 直接被拒，按键就"没反应"。三段都失败才是真解不了，
   * 那时给「应用内播放失败」+ 系统播放器出口，不静默。
   */
  try {
    await audio.play()
    return
  } catch {
    /* 往下走 */
  }
  try {
    reloadTried = true
    audio.load()
    await audio.play()
    return
  } catch {
    /* 往下走 */
  }
  if (await fallBackToBlob()) {
    await nextTick() // 让新 src 落到元素上再播
    try {
      await audio.play()
      return
    } catch {
      /* 落到下面 */
    }
  }
  failed.value = true
}

function seekRatio(clientX: number): number {
  const canvas = canvasRef.value
  if (!canvas) return 0
  const rect = canvas.getBoundingClientRect()
  return seekRatioFromPointer(rect.left, rect.width, clientX)
}

function seekTo(ratio: number): void {
  const audio = audioRef.value
  if (!audio) return
  const dur = totalSec.value
  if (!(dur > 0)) return
  currentSec.value = ratio * dur
  audio.currentTime = currentSec.value
  draw()
}

function onPointerDown(e: PointerEvent): void {
  const canvas = canvasRef.value
  if (!canvas) return
  dragging = true
  canvas.setPointerCapture?.(e.pointerId)
  seekTo(seekRatio(e.clientX))
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging) return
  seekTo(seekRatio(e.clientX))
}

function onPointerUp(): void {
  dragging = false
}

function openExternally(): void {
  const path = props.filePath
  if (!path) return
  void window.api.system.openPath(path)
}

onMounted(() => {
  draw()
  if (typeof ResizeObserver !== 'undefined' && canvasRef.value) {
    observer = new ResizeObserver(() => draw())
    observer.observe(canvasRef.value)
  }
})

onBeforeUnmount(() => {
  releaseBlob()
  stopTick()
  observer?.disconnect()
  observer = null
})

watch(() => props.photoId, () => void loadFacts().then(draw), { immediate: true })
// 换素材就回到流式那条路：上一条留下的 blob 要放掉，重试状态也要清
watch(
  () => props.src,
  (v) => {
    releaseBlob()
    mediaSrc.value = v
    reloadTried = false
  },
  { immediate: true }
)

defineExpose({
  toggle,
  // M2 标注消费端：时间点笔记要读当前播放位置（秒）、刻度点击要能 seek。
  // 只加只读取数与既有 seekTo 的秒数包装，播放链本身不动
  getTimeSec: (): number => (Number.isFinite(currentSec.value) ? Math.max(0, currentSec.value) : 0),
  seekToSec: (sec: number): void => {
    const dur = totalSec.value
    if (!(dur > 0)) return
    seekTo(Math.min(Math.max(0, Number.isFinite(sec) ? sec : 0), dur) / dur)
  }
})
</script>

<template>
  <div class="flex w-full flex-col items-center gap-3 text-white">
    <div class="text-6xl opacity-70">🎵</div>
    <canvas
      ref="canvasRef"
      data-waveform
      class="h-16 w-full cursor-pointer touch-none rounded-lg bg-white/5"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <div class="flex w-full items-center gap-3">
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm hover:bg-white/20"
        :aria-label="playing ? '暂停' : '播放'"
        :title="playing ? '暂停（空格）' : '播放（空格）'"
        @click="toggle"
      >
        {{ playing ? '⏸' : '▶' }}
      </button>
      <span class="shrink-0 text-xs tabular-nums text-gray-300">
        {{ fmt(currentSec) }} / {{ fmt(totalSec) }}
      </span>
      <span
        v-if="bpm"
        class="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-gray-300"
        :title="`节拍估计 ${bpm} BPM（${peaks ? '按前 120 秒起拍算' : '未做波形分析，按全长算'}）`"
      >
        ≈ {{ bpm }} BPM
      </span>
      <span v-if="!peaks" class="shrink-0 text-[11px] text-gray-500">无波形数据</span>
      <span v-if="failed" class="flex min-w-0 items-center gap-2 text-[11px] text-amber-300">
        应用内播放失败
        <button
          v-if="filePath"
          type="button"
          class="rounded bg-white/10 px-2 py-0.5 text-[11px] hover:bg-white/20"
          @click="openExternally"
        >
          用系统播放器打开
        </button>
      </span>
    </div>
    <!-- 隐藏原生控件这件事比想象中刁钻：**必须留着 controls**，元素才会真的被加载。
         Chromium 对 `audio:not([controls])` 给的是 display:none，而且连行内 display:block
         都盖不掉（实测：同一段行内样式，不带 controls 计算值仍是 none、readyState 0、
         MediaError 4；带上 controls 立刻 block）。而 display:none 的媒体元素不发起加载，
         于是"界面全对、点着没声"。做法 = 保留 controls + 1px 透明 + pointer-events:none，
         控件交给上面的波形条。 -->
    <audio
      ref="audioRef"
      :src="mediaSrc"
      controls
      preload="metadata"
      style="
        display: block;
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      "
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @error="onError"
    />
  </div>
</template>
