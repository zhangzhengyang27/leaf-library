<script setup lang="ts">
/**
 * 标注画布：canvas 尺寸 = 裁剪图物理分辨率，CSS 显示为逻辑尺寸；
 * repaint 三步 = 清屏 → 物理 1:1 铺裁剪图 → 切逻辑坐标重放标注。
 * Shift 约束：矩形/椭圆 → 正方，箭头/画笔线段 → 45° 倍数角。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AnnotationOp, AnnotationStyle, AnnotationTool } from '../core/annotations'
import { AnnotationHistory, drawAnnotation, drawAnnotations } from '../core/annotations'

const props = defineProps<{
  crop: HTMLCanvasElement
  scale: number
  tool: AnnotationTool
  annotationStyle: AnnotationStyle
}>()

const emit = defineEmits<{ historyChange: [{ canUndo: boolean; canRedo: boolean }] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const textBox = ref<{ x: number; y: number; value: string } | null>(null)
const history = new AnnotationHistory()
const draft = ref<AnnotationOp | null>(null)
let drag:
  | { kind: 'shape'; startX: number; startY: number }
  | { kind: 'pen'; points: Array<{ x: number; y: number }> }
  | null = null
let shiftDown = false

const cssWidth = computed(() => props.crop.width / props.scale)
const cssHeight = computed(() => props.crop.height / props.scale)

function repaint(): void {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, el.width, el.height)
  ctx.drawImage(props.crop, 0, 0)
  ctx.setTransform(props.scale, 0, 0, props.scale, 0, 0)
  const opts = { source: props.crop, dpr: props.scale }
  drawAnnotations(ctx, history.current, opts)
  if (draft.value) drawAnnotation(ctx, draft.value, opts)
}

function emitHistory(): void {
  emit('historyChange', { canUndo: history.canUndo, canRedo: history.canRedo })
}

function local(e: MouseEvent): { x: number; y: number } {
  const r = canvas.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function constrain(
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number } {
  if (!shiftDown) return end
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (props.tool === 'rect' || props.tool === 'ellipse') {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side }
  }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  const len = Math.hypot(dx, dy)
  return { x: start.x + len * Math.cos(angle), y: start.y + len * Math.sin(angle) }
}

function onDown(ev: MouseEvent): void {
  const p = local(ev)
  if (props.tool === 'text') {
    textBox.value = { x: p.x, y: p.y, value: '' }
    return
  }
  if (props.tool === 'pen') drag = { kind: 'pen', points: [p] }
  else drag = { kind: 'shape', startX: p.x, startY: p.y }
}

function onMove(ev: MouseEvent): void {
  if (!drag) return
  const style = props.annotationStyle
  const anchor =
    drag.kind === 'shape' ? { x: drag.startX, y: drag.startY } : drag.points[drag.points.length - 1]!
  const p = constrain(anchor, local(ev))
  if (drag.kind === 'pen') {
    drag.points.push(p)
    draft.value = { tool: 'pen', style, points: [...drag.points] }
  } else {
    const start = { x: drag.startX, y: drag.startY }
    const rect = {
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      width: Math.abs(p.x - start.x),
      height: Math.abs(p.y - start.y)
    }
    draft.value =
      props.tool === 'arrow'
        ? { tool: 'arrow', style, from: start, to: p }
        : props.tool === 'ellipse'
          ? { tool: 'ellipse', style, rect }
          : { tool: 'rect', style, rect }
  }
  repaint()
}

function onUp(): void {
  if (!draft.value) return
  history.push(draft.value)
  draft.value = null
  drag = null
  repaint()
  emitHistory()
}

function commitText(): void {
  const tb = textBox.value
  if (tb && tb.value.trim()) {
    history.push({ tool: 'text', style: props.annotationStyle, at: { x: tb.x, y: tb.y }, text: tb.value })
    emitHistory()
  }
  textBox.value = null
  repaint()
}

function undo(): void {
  history.undo()
  repaint()
  emitHistory()
}

function redo(): void {
  history.redo()
  repaint()
  emitHistory()
}

/** 导出即画布本身（物理分辨率成品，含背景与标注） */
function exportDataUrl(format: 'png' | 'jpg', quality: number): string {
  return canvas.value!.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', quality / 100)
}

defineExpose({ undo, redo, exportDataUrl })

function onShiftKey(e: KeyboardEvent): void {
  shiftDown = e.shiftKey
}

onMounted(() => {
  repaint()
  window.addEventListener('keydown', onShiftKey, true)
  window.addEventListener('keyup', onShiftKey, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onShiftKey, true)
  window.removeEventListener('keyup', onShiftKey, true)
})
watch(() => props.crop, repaint)
</script>

<template>
  <div class="relative shadow-2xl">
    <canvas
      ref="canvas"
      class="block cursor-crosshair"
      :width="crop.width"
      :height="crop.height"
      :style="{ width: `${cssWidth}px`, height: `${cssHeight}px` }"
      @mousedown="onDown"
      @mousemove="onMove"
      @mouseup="onUp"
      @mouseleave="onUp"
    />
    <textarea
      v-if="textBox"
      v-model="textBox.value"
      class="absolute resize-none border border-dashed border-white/70 bg-transparent p-0 outline-none"
      :style="{
        left: `${textBox.x}px`,
        top: `${textBox.y - 6}px`,
        color: annotationStyle.color,
        fontSize: `${14 + annotationStyle.strokeWidth * 3}px`
      }"
      @keydown.enter.exact.prevent="commitText"
      @keydown.esc="textBox = null"
    />
  </div>
</template>
