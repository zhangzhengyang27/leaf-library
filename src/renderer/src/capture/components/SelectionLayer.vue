<script setup lang="ts">
/**
 * 选区交互全套（iShot 对齐）：拖拽框选 / 8 手柄 / 移动 / 尺寸条输入 /
 * 数字键比例锁（0-9）/ D 上次区域 / F 全屏 / 方向键像素微调（Shift=调整大小）/
 * R·H 取色复制 / Enter·双击确认 / Esc·右键取消。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Magnifier from './Magnifier.vue'
import {
  applyRatioLock,
  clampRect,
  hitHandle,
  MIN_RECT_SIZE,
  moveRect,
  normalizeRect,
  ratioAnchor,
  resizeByHandle,
  resizeRect,
  type Bounds,
  type Handle,
  type HitPart,
  type Rect
} from '../core/geometry'
import { pickedColor, toHex } from '../core/picker'
import { showToast } from '../core/toast'

const props = defineProps<{
  bounds: Bounds
  scale: number
  source: HTMLImageElement | null
  initial: Rect
  last: { displayId: number; region: Rect } | null
}>()

const emit = defineEmits<{ confirm: [rect: Rect]; cancel: [] }>()

// iShot 同款：0=自由，1=1:1，7=16:9，8=3:2，9=4:3……
const RATIO_BY_KEY: Record<string, number | null> = {
  '0': null,
  '1': 1,
  '2': 2 / 3,
  '3': 3 / 4,
  '4': 4 / 5,
  '5': 5 / 7,
  '6': 9 / 16,
  '7': 16 / 9,
  '8': 3 / 2,
  '9': 4 / 3
}

const rect = ref<Rect>({ x: 0, y: 0, width: 0, height: 0 })
const hasRegion = computed(() => rect.value.width >= 1 && rect.value.height >= 1)
const ratio = ref<number | null>(null)
const mouse = ref({ x: -1, y: -1 })
const editingSize = ref(false)
const sizeW = ref('0')
const sizeH = ref('0')

type DragState =
  | { kind: 'create'; startX: number; startY: number }
  | { kind: 'move'; grabX: number; grabY: number; origin: Rect }
  | { kind: 'resize'; handle: Handle; origin: Rect }
const drag = ref<DragState | null>(null)

const barStyle = computed(() => {
  const below = rect.value.y + rect.value.height + 40 <= props.bounds.height
  return {
    left: `${rect.value.x}px`,
    top: below ? `${rect.value.y + rect.value.height + 8}px` : `${rect.value.y - 40}px`
  }
})

function syncSizeInputs(): void {
  sizeW.value = String(Math.round(rect.value.width))
  sizeH.value = String(Math.round(rect.value.height))
}

function onPointerDown(e: MouseEvent): void {
  if (e.button !== 0 || editingSize.value) return
  const part: HitPart = hasRegion.value ? hitHandle(e.clientX, e.clientY, rect.value) : null
  if (part === 'move') {
    drag.value = { kind: 'move', grabX: e.clientX, grabY: e.clientY, origin: { ...rect.value } }
  } else if (part) {
    drag.value = { kind: 'resize', handle: part, origin: { ...rect.value } }
  } else {
    drag.value = { kind: 'create', startX: e.clientX, startY: e.clientY }
    rect.value = { x: e.clientX, y: e.clientY, width: 0, height: 0 }
  }
  ratio.value = null
}

function onPointerMove(e: MouseEvent): void {
  mouse.value = { x: e.clientX, y: e.clientY }
  const d = drag.value
  if (!d) return
  if (d.kind === 'create') {
    let r = clampRect(normalizeRect(d.startX, d.startY, e.clientX, e.clientY), props.bounds)
    if (ratio.value) {
      r = applyRatioLock(
        r,
        ratio.value,
        ratioAnchor({ x: d.startX, y: d.startY }, { x: e.clientX, y: e.clientY })
      )
    }
    rect.value = r
  } else if (d.kind === 'move') {
    rect.value = moveRect(d.origin, e.clientX - d.grabX, e.clientY - d.grabY, props.bounds)
  } else {
    rect.value = resizeByHandle(d.origin, d.handle, e.clientX, e.clientY, props.bounds)
  }
}

function onPointerUp(): void {
  drag.value = null
  if (hasRegion.value) syncSizeInputs()
}

function applySizeInput(): void {
  const w = Number(sizeW.value)
  const h = Number(sizeH.value)
  if (Number.isFinite(w) && Number.isFinite(h) && w >= MIN_RECT_SIZE && h >= MIN_RECT_SIZE) {
    rect.value = clampRect({ ...rect.value, width: w, height: h }, props.bounds)
  }
  editingSize.value = false
}

function copyColor(kind: 'rgb' | 'hex'): void {
  const c = pickedColor.value
  if (!c) return
  const text = kind === 'hex' ? toHex(c) : `rgb(${c.r}, ${c.g}, ${c.b})`
  void window.api.photos.copyText(text).then(() => showToast(`已复制 ${text}`))
}

function onKeydown(e: KeyboardEvent): void {
  if (editingSize.value) {
    if (e.key === 'Enter') applySizeInput()
    if (e.key === 'Escape') editingSize.value = false
    return
  }
  if (e.key === 'Escape') {
    emit('cancel')
    return
  }
  if (e.key === 'Enter') {
    if (hasRegion.value) emit('confirm', { ...rect.value })
    return
  }
  if (e.key === 'd' || e.key === 'D') {
    if (props.last) {
      rect.value = clampRect(props.last.region, props.bounds)
      syncSizeInputs()
    }
    return
  }
  if (e.key === 'f' || e.key === 'F') {
    emit('confirm', { x: 0, y: 0, width: props.bounds.width, height: props.bounds.height })
    return
  }
  if (e.key === 'r' || e.key === 'R') {
    copyColor('rgb')
    return
  }
  if (e.key === 'h' || e.key === 'H') {
    copyColor('hex')
    return
  }
  if (RATIO_BY_KEY[e.key] !== undefined) {
    ratio.value = RATIO_BY_KEY[e.key] ?? null
    if (hasRegion.value && ratio.value) rect.value = applyRatioLock(rect.value, ratio.value, 'br')
    showToast(ratio.value ? `比例 ${ratio.value.toFixed(2)} : 1` : '比例自由')
    return
  }
  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  }
  const delta = arrows[e.key]
  if (delta && hasRegion.value) {
    e.preventDefault()
    const [dx, dy] = delta
    rect.value = e.shiftKey
      ? resizeRect(rect.value, dx, dy, props.bounds)
      : moveRect(rect.value, dx, dy, props.bounds)
    syncSizeInputs()
  }
}

function handleStyle(h: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'): Record<string, string> {
  const x = h.includes('w') ? '0%' : h.includes('e') ? '100%' : '50%'
  const y = h.includes('n') ? '0%' : h.includes('s') ? '100%' : '50%'
  return { left: x, top: y }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div
    class="absolute inset-0 cursor-crosshair"
    @mousedown="onPointerDown"
    @mousemove="onPointerMove"
    @mouseup="onPointerUp"
    @dblclick="hasRegion && emit('confirm', { ...rect })"
    @contextmenu.prevent="emit('cancel')"
  >
    <!-- 未拖出选区时整屏轻压暗 + 提示条（iShot 同款：明确告知截图模式已开启） -->
    <div v-if="!hasRegion" class="pointer-events-none absolute inset-0 bg-black/25" />
    <div
      v-if="!hasRegion"
      class="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-4 py-2 text-xs text-white/90"
    >
      拖拽框选区域 · F 全屏 · D 上次区域 · 数字键锁比例 · Esc 取消
    </div>
    <div v-if="hasRegion" class="pointer-events-none absolute inset-0">
      <!-- 遮罩挖孔：四块暗幕 -->
      <div class="absolute left-0 top-0 w-full bg-black/45" :style="{ height: `${rect.y}px` }" />
      <div
        class="absolute left-0 bg-black/45"
        :style="{ top: `${rect.y}px`, height: `${rect.height}px`, width: `${rect.x}px` }"
      />
      <div
        class="absolute bg-black/45"
        :style="{
          left: `${rect.x + rect.width}px`,
          top: `${rect.y}px`,
          height: `${rect.height}px`,
          right: '0'
        }"
      />
      <div
        class="absolute bottom-0 left-0 w-full bg-black/45"
        :style="{ top: `${rect.y + rect.height}px` }"
      />
      <!-- 选区边框 + 8 手柄 -->
      <div
        class="absolute border border-brand-500"
        :style="{
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`
        }"
      >
        <span
          v-for="h in ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const"
          :key="h"
          class="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500 bg-white"
          :style="handleStyle(h)"
        />
      </div>
      <!-- 尺寸条（可输入宽高） -->
      <div
        class="absolute flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-xs text-white"
        :style="barStyle"
        @mousedown.stop
      >
        <template v-if="!editingSize">
          <span>{{ Math.round(rect.width) }} × {{ Math.round(rect.height) }}</span>
          <button
            type="button"
            class="ml-1 rounded bg-white/10 px-1"
            @click.stop="editingSize = true"
          >
            输入
          </button>
        </template>
        <template v-else>
          <input
            v-model="sizeW"
            class="w-14 rounded bg-white/15 px-1 text-center"
            @click.stop
            @keydown.enter.stop="applySizeInput"
          />
          <span>×</span>
          <input
            v-model="sizeH"
            class="w-14 rounded bg-white/15 px-1 text-center"
            @click.stop
            @keydown.enter.stop="applySizeInput"
          />
        </template>
        <span v-if="ratio" class="ml-1 text-amber-300">{{ ratio.toFixed(2) }}:1</span>
      </div>
    </div>
    <Magnifier :source="source" :x="mouse.x" :y="mouse.y" :scale="scale" :bounds="bounds" />
  </div>
</template>
