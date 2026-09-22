<script setup lang="ts">
/**
 * ColorPickerPanel · 颜色筛选弹层（五轮对齐 Eagle 实测）
 *
 * 结构：SV 渐变方块 + 垂直色相条 / 16 预设色板（2×8，首格=无色/清除）/
 * 底部 当前色块 + HEX 输入 + 彩虹圆钮（系统取色器）。
 * Leaf 颜色模型为 9 色相桶（color_dominant 预聚合），任意取色经 hueBucketOf 归桶生效。
 */
import { computed, reactive, ref } from 'vue'
import { hueBucketOf, type HueBucket } from '@utils/photoColor'
import { accuracyToMaxDelta } from '@shared/colorMatch'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'

const tabs = useLibraryTabs()

// —— HSV 状态（默认红；s/v 统一 0..1，指示器样式处再 ×100） ——

const hsv = reactive({ h: 0, s: 1, v: 1 })
const svEl = ref<HTMLElement | null>(null)
const hueEl = ref<HTMLElement | null>(null)
const hexInput = ref('')

const currentHex = computed(() => hsvToHex(hsv.h, hsv.s, hsv.v))

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number): string => {
    const k = (n + h / 60) % 6
    const val = v - v * s * Math.max(Math.min(k, 4 - k, 1), 0)
    return Math.round(val * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(5)}${f(3)}${f(1)}`.toUpperCase()
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

// —— 应用到筛选（归 9 色相桶） ——

function applyBucket(bucket: HueBucket | null): void {
  tabs.active.colorFilter = bucket
  // 「无色」那颗格子是清除档：两个颜色条件都要落下
  if (!bucket) tabs.active.colorClose = null
  tabs.persist()
}

/** 二十九轮 G3：色系=9 桶等值（color_hue 索引列）；近似色=ΔE2000 判定（color_close()） */
const MATCH_MODES = [
  { key: 'bucket', label: '色系' },
  { key: 'close', label: '近似色' }
] as const

const matchMode = computed({
  get: () => tabs.active.colorMatch,
  set: (m: 'bucket' | 'close') => {
    tabs.active.colorMatch = m
    // 两档互斥：同时挂着会出现「清掉一个、chip 还亮着」且条件是 AND，用户读不懂
    if (m === 'close') {
      tabs.active.colorFilter = null
      tabs.active.colorClose = tabs.active.colorClose ?? { hex: currentHex.value, accuracy: 20 }
    } else {
      tabs.active.colorClose = null
    }
    tabs.persist()
  }
})

const accuracy = computed({
  get: () => tabs.active.colorClose?.accuracy ?? 20,
  set: (v: number) => {
    tabs.active.colorClose = { hex: tabs.active.colorClose?.hex ?? currentHex.value, accuracy: v }
    tabs.persist()
  }
})

function applyHex(hex: string): void {
  if (matchMode.value === 'close') {
    tabs.active.colorClose = { hex: hex.toUpperCase(), accuracy: accuracy.value }
    tabs.active.colorFilter = null
  } else {
    applyBucket(hueBucketOf(hex))
  }
  tabs.persist()
}

function commitHexInput(): void {
  const raw = hexInput.value.trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
    hexInput.value = ''
    return
  }
  const { h, s, v } = hexToHsv(raw)
  hsv.h = h
  hsv.s = s
  hsv.v = v
  applyHex(raw)
  hexInput.value = ''
}

// —— SV 方块 / 色相条拖拽 ——

let dragging: 'sv' | 'hue' | null = null

function trackFromEvent(el: HTMLElement | null, e: PointerEvent): { x: number; y: number } | null {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
  const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)
  return { x, y }
}

function onSvDown(e: PointerEvent): void {
  dragging = 'sv'
  onSvMove(e)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function onHueDown(e: PointerEvent): void {
  dragging = 'hue'
  onHueMove(e)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function onSvMove(e: PointerEvent): void {
  const pos = trackFromEvent(svEl.value, e)
  if (!pos) return
  hsv.s = pos.x
  hsv.v = 1 - pos.y
  // 拖拽中只更新本地态（审查 P3-50）：旧实现每次 pointermove（~60+/s）都
  // applyBucket + tabs.persist() 全量序列化，拖完才统一提交
}
function onHueMove(e: PointerEvent): void {
  const pos = trackFromEvent(hueEl.value, e)
  if (!pos) return
  hsv.h = Math.round(pos.y * 360) % 360
}
function onPointerMove(e: PointerEvent): void {
  if (dragging === 'sv') onSvMove(e)
  else if (dragging === 'hue') onHueMove(e)
}
function onPointerUp(): void {
  if (dragging) applyHex(currentHex.value)
  dragging = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

// —— 预设色板（Eagle 2×8：首格无色=清除） ——

const SWATCHES: Array<{ key: string; css: string; label: string }> = [
  { key: 'none', css: '', label: '无色（清除筛选）' },
  { key: '#000000', css: '#000000', label: '黑' },
  { key: '#FFFFFF', css: '#FFFFFF', label: '白' },
  { key: '#C8C8C8', css: '#C8C8C8', label: '浅灰' },
  { key: '#7F7F7F', css: '#7F7F7F', label: '灰' },
  { key: '#8B5A2B', css: '#8B5A2B', label: '棕' },
  { key: '#F2A7C3', css: '#F2A7C3', label: '粉' },
  { key: '#E53935', css: '#E53935', label: '红' },
  { key: '#F57C00', css: '#F57C00', label: '橙' },
  { key: '#FDD835', css: '#FDD835', label: '黄' },
  { key: '#43A047', css: '#43A047', label: '绿' },
  { key: '#26A69A', css: '#26A69A', label: '青' },
  { key: '#1E88E5', css: '#1E88E5', label: '蓝' },
  { key: '#3949AB', css: '#3949AB', label: '靛' },
  { key: '#8E24AA', css: '#8E24AA', label: '紫' },
  { key: '#EC407A', css: '#EC407A', label: '洋红' }
]

function pickSwatch(sw: (typeof SWATCHES)[number]): void {
  if (sw.key === 'none') {
    applyBucket(null)
    return
  }
  const { h, s, v } = hexToHsv(sw.css)
  hsv.h = h
  hsv.s = s
  hsv.v = v
  applyHex(sw.css)
}

// —— 系统取色器（彩虹钮） ——

const nativeInput = ref<HTMLInputElement | null>(null)
function openNative(): void {
  nativeInput.value?.click()
}
function onNativePick(e: Event): void {
  const v = (e.target as HTMLInputElement).value
  if (!v) return
  const { h, s, v: vv } = hexToHsv(v)
  hsv.h = h
  hsv.s = s
  hsv.v = vv
  applyHex(v)
}
</script>

<template>
  <div class="w-64 p-2" @keydown.enter.prevent="commitHexInput">
    <!-- SV 渐变方块 + 色相条 -->
    <div class="mb-2 flex gap-1.5">
      <div
        ref="svEl"
        class="relative h-36 flex-1 cursor-crosshair rounded-sm"
        :style="{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h}, 100%, 50%)`
        }"
        @pointerdown.prevent="onSvDown"
      >
        <span
          class="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          :style="{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: currentHex
          }"
        />
      </div>
      <div
        ref="hueEl"
        class="relative w-3 cursor-pointer rounded-sm"
        style="
          background: linear-gradient(
            to bottom,
            hsl(0 100% 50%),
            hsl(60 100% 50%),
            hsl(120 100% 50%),
            hsl(180 100% 50%),
            hsl(240 100% 50%),
            hsl(300 100% 50%),
            hsl(360 100% 50%)
          );
        "
        @pointerdown.prevent="onHueDown"
      >
        <span
          class="pointer-events-none absolute -left-0.5 h-1.5 w-4 -translate-y-1/2 rounded-sm border border-white shadow"
          :style="{ top: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }"
        />
      </div>
    </div>

    <!-- 16 预设色板（2×8） -->
    <div class="mb-2 grid grid-cols-8 gap-1">
      <button
        v-for="sw in SWATCHES"
        :key="sw.key"
        type="button"
        class="aspect-square rounded-sm border border-black/10 transition-transform hover:scale-110"
        :class="sw.key === 'none' ? 'bg-transparent' : ''"
        :style="
          sw.key === 'none'
            ? 'background: repeating-linear-gradient(45deg, #555 0 4px, #2a2a2a 4px 8px)'
            : { backgroundColor: sw.css }
        "
        :title="sw.label"
        @click="pickSwatch(sw)"
      />
    </div>

    <!-- 当前色 + HEX 输入 + 系统取色 -->
    <div
      class="flex items-center gap-1.5 rounded-md border border-line-strong bg-surface-0 px-1.5 py-1"
    >
      <span
        class="size-4 shrink-0 rounded-full border border-black/20"
        :style="{ backgroundColor: currentHex }"
      />
      <input
        v-model="hexInput"
        type="text"
        placeholder="#FF0000"
        spellcheck="false"
        class="min-w-0 flex-1 bg-transparent text-xs text-fg-primary uppercase placeholder:text-fg-muted focus:outline-none"
        aria-label="HEX 颜色值"
      />
      <button
        type="button"
        class="flex size-6 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110"
        :style="{
          background: 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
        }"
        title="系统取色器"
        @click="openNative"
      >
        <span class="size-3.5 rounded-full bg-surface-0" />
      </button>
      <input ref="nativeInput" type="color" class="hidden" @input="onNativePick" />
    </div>

    <!-- 匹配方式（G3）：色系=9 桶等值；近似色=吸管取色 + 准确度滑杆（Eagle 形态） -->
    <div class="mt-2 flex items-center gap-1">
      <button
        v-for="m in MATCH_MODES"
        :key="m.key"
        type="button"
        class="rounded px-2 py-0.5 text-[11px] transition-colors"
        :class="
          matchMode === m.key
            ? 'bg-brand-500 text-white'
            : 'bg-surface-1 text-fg-muted hover:bg-surface-2'
        "
        @click="matchMode = m.key"
      >
        {{ m.label }}
      </button>
    </div>
    <label v-if="matchMode === 'close'" class="mt-1.5 block">
      <span class="flex items-center justify-between text-[10px] text-fg-muted">
        <span>准确度</span>
        <span>色差 ≤ {{ accuracyToMaxDelta(accuracy) }}</span>
      </span>
      <input
        v-model.number="accuracy"
        type="range"
        min="5"
        max="40"
        step="1"
        class="w-full"
        aria-label="颜色准确度"
      />
    </label>

    <!-- 当前生效条件 -->
    <p class="mt-1.5 px-0.5 text-[10px] text-fg-muted">
      {{
        tabs.active.colorClose
          ? `按近似色筛选：与 ${tabs.active.colorClose.hex} 的色差 ≤ ${accuracyToMaxDelta(tabs.active.colorClose.accuracy)}`
          : tabs.active.colorFilter
            ? '已按最近色系过滤（9 桶等值）'
            : '未启用颜色筛选——任选颜色即按最近色系过滤'
      }}
    </p>
  </div>
</template>
