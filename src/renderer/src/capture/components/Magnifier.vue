<script setup lang="ts">
/** 8× 放大镜：跟随鼠标，中心像素写入 core/picker（R/H 键读取复制） */
import { onBeforeUnmount, ref, watch } from 'vue'
import { pickedColor } from '../core/picker'

const props = defineProps<{
  source: HTMLImageElement | null
  /** 鼠标逻辑坐标 */
  x: number
  y: number
  scale: number
  bounds: { width: number; height: number }
}>()

const SIZE = 132
const ZOOM = 8
const canvas = ref<HTMLCanvasElement | null>(null)
const pos = ref({ left: 0, top: 0 })

function render(): void {
  const cv = canvas.value
  const img = props.source
  if (!cv || !img) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const px = Math.round(props.x * props.scale)
  const py = Math.round(props.y * props.scale)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.drawImage(img, px - ZOOM / 2, py - ZOOM / 2, ZOOM, ZOOM, 0, 0, SIZE, SIZE)
  // 中心像素色 → picker
  const one = document.createElement('canvas')
  one.width = 1
  one.height = 1
  const octx = one.getContext('2d')
  if (octx) {
    octx.drawImage(img, px, py, 1, 1, 0, 0, 1, 1)
    const d = octx.getImageData(0, 0, 1, 1).data
    pickedColor.value = { r: d[0]!, g: d[1]!, b: d[2]! }
  }
  // 十字准星
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(SIZE / 2 - 8, SIZE / 2)
  ctx.lineTo(SIZE / 2 + 8, SIZE / 2)
  ctx.moveTo(SIZE / 2, SIZE / 2 - 8)
  ctx.lineTo(SIZE / 2, SIZE / 2 + 8)
  ctx.stroke()
}

function layout(): void {
  const flipX = props.x + 24 + SIZE > props.bounds.width
  const flipY = props.y + 24 + SIZE > props.bounds.height
  pos.value = {
    left: flipX ? props.x - 24 - SIZE : props.x + 24,
    top: flipY ? props.y - 24 - SIZE : props.y + 24
  }
}

watch(
  () => [props.x, props.y, props.source],
  () => {
    render()
    layout()
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  pickedColor.value = null
})
</script>

<template>
  <div
    class="pointer-events-none absolute overflow-hidden rounded-lg border border-white/70 bg-black shadow-lg"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px`, width: `${SIZE}px`, height: `${SIZE}px` }"
  >
    <canvas ref="canvas" :width="SIZE" :height="SIZE" />
  </div>
</template>
