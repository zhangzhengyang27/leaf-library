<template>
  <div ref="containerRef" class="relative w-full">
    <div
      class="relative"
      :style="{ width: '100%', height: canvasHeight + 'px' }"
      @contextmenu.prevent
    >
      <p
        v-if="photos.length === 0"
        class="absolute left-1/2 top-24 -translate-x-1/2 text-xs text-fg-muted"
      >
        文件夹为空——把素材拖入或右键新建
      </p>
      <div
        v-for="photo in photos"
        :key="photo.id"
        class="absolute select-none"
        :style="itemStyle(photo)"
        :data-photo-id="photo.id"
        @pointerdown="onPointerDown($event, photo)"
        @dblclick="emit('preview-photo', photo)"
        @contextmenu.prevent.stop="
          emit('context-menu', { photo, x: $event.clientX, y: $event.clientY })
        "
      >
        <div
          class="h-full w-full overflow-hidden rounded-[3px] border-2 bg-surface-2 transition-shadow duration-fast"
          :class="selectedSet.has(photo.id) ? 'border-brand-500 shadow-lg' : 'border-transparent'"
        >
          <AssetThumb :photo="photo" :cover="true" />
        </div>
        <!-- 角部缩放手柄（选中或悬停时可见） -->
        <span
          class="absolute -bottom-1 -right-1 size-3 cursor-nwse-resize rounded-full border border-white bg-brand-500 opacity-0 transition-opacity duration-fast group-hover:opacity-100"
          :class="selectedSet.has(photo.id) ? 'opacity-100' : ''"
          @pointerdown.stop="onResizeDown($event, photo)"
        />
      </div>
    </div>
    <p class="pb-4 pt-1 text-center text-[11px] text-fg-muted">
      自由网格：拖拽摆放 · 角部圆点缩放 · Alt 拖拽关闭吸附 · 双击预览（仅文件夹视图）
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * FreeformCanvas · F10 自由网格（对齐 Eagle：逐文件夹的画布式摆放）
 *
 * - 位置持久化于 photo_freeform_pos（m009，覆盖式整夹保存）
 * - 无位置的新素材用 autoPlace 首适配找空位并立即落库
 * - 拖拽移动（多选整体平移）/ 角部缩放（0.2~4）/ 8px 网格吸附（Alt 临时关闭）
 * - 点击选中语义复用 click-select（⌘ 翻转 / Shift 连选由键盘层处理）
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AssetThumb from './AssetThumb.vue'
import type { Photo } from '../../../types/photo'
import type { DisplayOptions } from '@renderer/stores/libraryTabs'
import { usePhotoFilters } from '../composables/usePhotoFilters'
import { autoPlace, clampScale, snap } from '../utils/freeformLayout'

const BASE_W = 168
const SAVE_DEBOUNCE_MS = 500

const props = defineProps<{
  photos: Photo[]
  selectedSet: Set<string>
  display?: DisplayOptions
}>()

const emit = defineEmits<{
  'click-select': [
    photoId: string,
    modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
  ]
  'preview-photo': [photo: Photo]
  'context-menu': [payload: { photo: Photo; x: number; y: number }]
}>()

const filters = usePhotoFilters()
const folderId = computed(() => filters.activeFolder.value?.id ?? null)

interface Pos {
  x: number
  y: number
  scale: number
}
const positions = ref<Map<string, Pos>>(new Map())
const containerRef = ref<HTMLElement | null>(null)
const canvasW = ref(1200)

const aspectOf = (p: Photo): number =>
  p.width && p.height && p.height > 0 ? p.width / p.height : 1
const itemW = (p: Photo): number => BASE_W * (positions.value.get(p.id)?.scale ?? 1)
const itemH = (p: Photo): number => itemW(p) / aspectOf(p)

const itemStyle = (photo: Photo): Record<string, string> => {
  const pos = positions.value.get(photo.id)
  return {
    left: `${pos?.x ?? 0}px`,
    top: `${pos?.y ?? 0}px`,
    width: `${itemW(photo)}px`,
    zIndex: props.selectedSet.has(photo.id) ? '10' : '1'
  }
}

const canvasHeight = computed(() => {
  let max = 240
  for (const p of props.photos) {
    const pos = positions.value.get(p.id)
    if (!pos) continue
    max = Math.max(max, pos.y + itemH(p) + 24)
  }
  return max
})

// —— 加载与自动占位 ——

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void persist(), SAVE_DEBOUNCE_MS)
}

async function persist(): Promise<void> {
  const fid = folderId.value
  if (!fid) return
  const items = [...positions.value.entries()].map(([photoId, pos]) => ({
    photoId,
    x: pos.x,
    y: pos.y,
    scale: pos.scale
  }))
  try {
    await window.api.photos.setFreeformPositions(fid, items)
  } catch (err) {
    console.error('[FreeformCanvas] save failed:', err)
  }
}

/** 为缺少位置的素材批量找空位并立即保存 */
function ensurePositions(): void {
  const missing = props.photos.filter((p) => !positions.value.has(p.id))
  if (missing.length === 0) return
  const existing: Array<{ x: number; y: number; w: number; h: number }> = []
  for (const p of props.photos) {
    const pos = positions.value.get(p.id)
    if (pos)
      existing.push({
        x: pos.x,
        y: pos.y,
        w: BASE_W * pos.scale,
        h: (BASE_W * pos.scale) / aspectOf(p)
      })
  }
  const heights = missing.map((p) => BASE_W / aspectOf(p))
  const placed = autoPlace(heights, existing, BASE_W, Math.max(canvasW.value, 800))
  missing.forEach((p, i) => {
    positions.value.set(p.id, { x: placed[i].x, y: placed[i].y, scale: 1 })
  })
  scheduleSave()
}

watch(
  folderId,
  async (fid) => {
    positions.value = new Map()
    if (!fid) return
    try {
      const rows = await window.api.photos.getFreeformPositions(fid)
      // 序号守卫（审查 P3-43）：await 期间已切换文件夹时丢弃过期响应，
      // 否则 A 夹布局会被渲染并持久化到 B 夹
      if (folderId.value !== fid) return
      const map = new Map<string, Pos>()
      for (const r of rows) map.set(r.photoId, { x: r.x, y: r.y, scale: r.scale })
      positions.value = map
    } catch {
      if (folderId.value === fid) positions.value = new Map()
    }
    if (folderId.value === fid) ensurePositions()
  },
  { immediate: true }
)

// photos 变化：清理已移除项 + 补新项
watch(
  () => props.photos.map((p) => p.id).join(','),
  () => {
    const alive = new Set(props.photos.map((p) => p.id))
    for (const id of [...positions.value.keys()]) {
      if (!alive.has(id)) positions.value.delete(id)
    }
    ensurePositions()
  }
)

// 画布宽度（自动占位列数依赖）
let resizeObserver: ResizeObserver | null = null
watch(containerRef, (el) => {
  resizeObserver?.disconnect()
  if (!el) return
  resizeObserver = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0
    if (w > 0) canvasW.value = w
  })
  resizeObserver.observe(el)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (saveTimer) clearTimeout(saveTimer)
  // 拖拽中途卸载时 window 级监听必须摘除：pointerup 的 {once:true}
  // 只覆盖正常路径，卸载后不会再触发，pointermove 会常驻泄漏
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  drag = null
})

// —— 拖拽移动 / 缩放 ——

interface DragState {
  kind: 'move' | 'resize'
  id: string
  startX: number
  startY: number
  moved: boolean
  orig: Map<string, Pos>
  origScale: number
}
let drag: DragState | null = null

function snapshotOrig(ids: string[]): Map<string, Pos> {
  const m = new Map<string, Pos>()
  for (const id of ids) {
    const pos = positions.value.get(id)
    if (pos) m.set(id, { ...pos })
  }
  return m
}

function onPointerDown(e: PointerEvent, photo: Photo): void {
  if (e.button !== 0) return
  const ids = props.selectedSet.has(photo.id)
    ? props.photos
        .filter((p) => props.selectedSet.has(p.id) && positions.value.has(p.id))
        .map((p) => p.id)
    : [photo.id]
  drag = {
    kind: 'move',
    id: photo.id,
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
    orig: snapshotOrig(ids),
    origScale: positions.value.get(photo.id)?.scale ?? 1
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
  window.addEventListener('pointercancel', onPointerCancel)
}

function onResizeDown(e: PointerEvent, photo: Photo): void {
  drag = {
    kind: 'resize',
    id: photo.id,
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
    orig: snapshotOrig([photo.id]),
    origScale: positions.value.get(photo.id)?.scale ?? 1
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
  window.addEventListener('pointercancel', onPointerCancel)
}

function onPointerMove(e: PointerEvent): void {
  if (!drag) return
  // 拖拽中断后残留监听的自愈：无按键按下时忽略移动（审查 P3-57）
  if (e.buttons === 0) return
  const dx = e.clientX - drag.startX
  const dy = e.clientY - drag.startY
  if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
  drag.moved = true

  if (drag.kind === 'move') {
    const snapOn = !e.altKey
    for (const [id, orig] of drag.orig) {
      positions.value.set(id, {
        x: snapOn ? snap(orig.x + dx) : Math.round(orig.x + dx),
        y: snapOn ? snap(orig.y + dy) : Math.round(orig.y + dy),
        scale: orig.scale
      })
    }
  } else {
    const width = BASE_W * drag.origScale + dx
    const scale = clampScale(Math.round((width / BASE_W) * 20) / 20)
    const orig = drag.orig.get(drag.id)
    if (orig) positions.value.set(drag.id, { ...orig, scale })
  }
}

function onPointerUp(e: PointerEvent): void {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointercancel', onPointerCancel)
  const d = drag
  drag = null
  if (!d) return
  if (!d.moved) {
    // 未移动 = 点击选语义（⌘ 翻转 / Shift 连选）
    emit('click-select', d.id, { metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })
    return
  }
  scheduleSave()
}

/** pointercancel（触摸中断/系统手势接管，审查 P3-57）：不落盘、不触发点击选，
 *  只清理拖拽态——旧实现漏处理导致「幽灵拖拽」直到下一次 pointerup */
function onPointerCancel(): void {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointercancel', onPointerCancel)
  // 恢复原始位置（拖拽未确认）：逐项回写——整体替换会把未参与本次拖拽的
  // 素材位置条目一并丢掉，随后的 persist 是「DELETE 整夹 + 逐条 INSERT」，落库即清空布局
  if (drag) {
    for (const [id, pos] of drag.orig) positions.value.set(id, { ...pos })
  }
  drag = null
}
</script>
