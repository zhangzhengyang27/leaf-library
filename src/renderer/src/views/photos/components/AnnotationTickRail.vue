<script setup lang="ts">
/**
 * M2 时间点笔记刻度条（视频进度条 / 音频波形两处共用，PhotoPreview 内原先各写了一份）。
 *
 * hover 提示用自定义浮层替代原生 title：rail 外层预览容器是 overflow-hidden，
 * 刻度贴近边缘时原生 title 会被裁掉看不见。浮层定位与翻转的换算抽在
 * utils/tickTooltip.ts（纯函数，单测直打），这里只做 DOM 测量与贴位。
 *
 * 样式对齐预览层既有浮层 token（缩放 HUD / toast 的 bg-black/55 backdrop-blur 风格）。
 * 无障碍：刻度按钮 aria-label（时间 + body 摘要），浮层 role="tooltip"。
 * 根元素固定 relative h-3 w-full，场景差异（max-w-2xl / mt-1）由调用方 class 透传。
 */
import { nextTick, ref } from 'vue'
import type { CSSProperties } from 'vue'
import type { PhotoAnnotation } from '@shared/annotations'
import { atMsToPercent } from '../composables/useAnnotationOverlay'
import { fmtMsPosition, placeTickTooltip } from '../utils/tickTooltip'

/** 有时间点的标注（调用方已按 atMs 过滤收窄，模板里不必 `!`；script setup 不能再导出类型） */
type TickAnnotation = PhotoAnnotation & { atMs: number }

const props = defineProps<{
  annotations: TickAnnotation[]
  /** 时长（秒），仅用于刻度百分比定位（>0 由调用方 v-if 保证） */
  durationSec: number
}>()

const emit = defineEmits<{ seek: [atMs: number] }>()

const railEl = ref<HTMLElement | null>(null)
const tooltipEl = ref<HTMLElement | null>(null)
const hovered = ref<TickAnnotation | null>(null)
const tooltipStyle = ref<CSSProperties | null>(null)

/** aria-label 用的 body 摘要：太长的截断，读屏不必念两千字 */
function ariaOf(a: TickAnnotation): string {
  const body = a.body.length > 60 ? `${a.body.slice(0, 60)}…` : a.body
  return `${fmtMsPosition(a.atMs)} ${body}`
}

/**
 * 从 rail 向上找第一个会裁剪内容的祖先（overflow 非 visible），
 * 它就是浮层的可用边界。找不到（如 happy-dom 不解析 Tailwind）返回 null，
 * 调用方按「无边界」处理——纯函数收 Infinity，水平仍按 rail 收进。
 */
function findClipBoundary(start: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = start.parentElement
  while (el) {
    const overflow = getComputedStyle(el).overflow
    if (overflow !== '' && overflow !== 'visible') return el
    el = el.parentElement
  }
  return null
}

/** 渲染后测量浮层与边界，算出落点（同一帧内完成，肉眼无跳动） */
function measure(btn: HTMLElement | null): void {
  const rail = railEl.value
  const tooltip = tooltipEl.value
  if (!rail || !btn || !tooltip) return
  const railRect = rail.getBoundingClientRect()
  // offsetParent 是 rail（relative），transform 不影响 offsetLeft → 刻度点即按钮几何中心
  const tickX = btn.offsetLeft + btn.offsetWidth / 2
  const tickY = rail.clientHeight / 2
  const clip = findClipBoundary(rail)
  const clipRect = clip?.getBoundingClientRect()
  const spaceAbove = clipRect ? railRect.top + tickY - clipRect.top : Number.POSITIVE_INFINITY
  const spaceBelow = clipRect ? clipRect.bottom - (railRect.top + tickY) : Number.POSITIVE_INFINITY
  const placement = placeTickTooltip({
    tickX,
    tickY,
    railWidth: rail.clientWidth,
    tooltipWidth: tooltip.offsetWidth,
    tooltipHeight: tooltip.offsetHeight,
    spaceAbove,
    spaceBelow
  })
  tooltipStyle.value = { left: `${placement.left}px`, top: `${placement.top}px` }
}

/** hover / 键盘聚焦都开浮层；currentTarget 必须同步取出（事件返回后即失效） */
function open(a: TickAnnotation, ev: MouseEvent | FocusEvent): void {
  const btn = ev.currentTarget as HTMLElement | null
  hovered.value = a
  void nextTick().then(() => measure(btn))
}

function close(): void {
  hovered.value = null
  tooltipStyle.value = null
}
</script>

<template>
  <div ref="railEl" class="relative h-3 w-full">
    <!-- 底线：只做视觉导轨，不接交互 -->
    <div class="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-white/15"></div>
    <button
      v-for="a in props.annotations"
      :key="a.id"
      type="button"
      class="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 shadow transition-transform hover:scale-150"
      :style="{ left: `${atMsToPercent(a.atMs, props.durationSec)}%` }"
      :aria-label="`${ariaOf(a)}（点击跳到该时间点）`"
      @click="emit('seek', a.atMs)"
      @mouseenter="open(a, $event)"
      @mouseleave="close"
      @focus="open(a, $event)"
      @blur="close"
    ></button>
    <!-- 浮层：pointer-events-none 防闪烁抖动；首次渲染未测尺寸前先隐身一拍 -->
    <span
      v-if="hovered"
      ref="tooltipEl"
      role="tooltip"
      class="pointer-events-none absolute z-30 max-w-72 truncate rounded-md bg-black/55 px-2 py-1 text-xs text-white/90 shadow-lg backdrop-blur-sm"
      :style="tooltipStyle ?? { visibility: 'hidden' }"
    >
      <span class="font-mono text-amber-300">{{ fmtMsPosition(hovered.atMs) }}</span>
      <span class="mx-1 text-white/40">·</span>{{ hovered.body }}
    </span>
  </div>
</template>
