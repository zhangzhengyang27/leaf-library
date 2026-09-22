<script setup lang="ts">
/**
 * 贴图：置顶小窗。手动拖动（app-region 会吞 dblclick/contextmenu，故走
 * screenX/Y 增量 + screenshot.pin.drag IPC）、滚轮等比缩放（窗口 ±10%）、
 * 双击关闭、右键菜单（复制图片/入库/关闭）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast, toastMessage } from '../core/toast'
import type { ScreenshotSaveRequest } from '@shared/ipc-contract'

const props = defineProps<{ payloadId: string }>()

const dataUrl = ref('')
const showMenu = ref(false)
const menuPos = ref({ x: 0, y: 0 })
let dragging = false
let last = { x: 0, y: 0 }
// 拖动位移 rAF 合并（审查 P3-63）：mousemove 每秒可达 120+ 次 IPC，
// 改为累积 delta、每帧最多发一次
let pendingDx = 0
let pendingDy = 0
let rafId = 0

async function save(actions: ScreenshotSaveRequest['actions']): Promise<void> {
  await window.api.screenshot.save({
    dataUrl: dataUrl.value,
    displayId: 0,
    region: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
    actions
  })
}

function onDragStart(e: MouseEvent): void {
  if (e.button !== 0) return
  dragging = true
  last = { x: e.screenX, y: e.screenY }
}
function flushDrag(): void {
  if (pendingDx !== 0 || pendingDy !== 0) {
    const dx = pendingDx
    const dy = pendingDy
    pendingDx = 0
    pendingDy = 0
    void window.api.screenshot.dragPin(dx, dy)
  }
  rafId = 0
}
function onDragMove(e: MouseEvent): void {
  if (!dragging) return
  pendingDx += e.screenX - last.x
  pendingDy += e.screenY - last.y
  last = { x: e.screenX, y: e.screenY }
  if (!rafId) rafId = window.requestAnimationFrame(flushDrag)
}
function onDragEnd(): void {
  dragging = false
  if (rafId) {
    window.cancelAnimationFrame(rafId)
    rafId = 0
  }
  flushDrag()
}
function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
  const w = Math.round(window.innerWidth * factor)
  const h = Math.round(window.innerHeight * factor)
  if (w >= 60 && h >= 60) window.resizeTo(w, h)
}
async function onDblClick(): Promise<void> {
  await window.api.screenshot.closePin(props.payloadId)
  window.close()
}
function onContextMenu(e: MouseEvent): void {
  e.preventDefault()
  menuPos.value = { x: e.clientX, y: e.clientY }
  showMenu.value = true
}

async function copyImage(): Promise<void> {
  await save({ library: false, clipboard: true, file: false, pin: false })
  showToast('已复制')
  showMenu.value = false
}
async function toLibrary(): Promise<void> {
  await save({ library: true, clipboard: false, file: false, pin: false })
  showToast('已入库')
  showMenu.value = false
}
async function close(): Promise<void> {
  await window.api.screenshot.closePin(props.payloadId)
  window.close()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (showMenu.value) showMenu.value = false
    else void close()
  }
}

onMounted(async () => {
  const payload = await window.api.screenshot.getPinPayload(props.payloadId)
  if (!payload.ok || !payload.dataUrl) {
    await window.api.screenshot.closePin(props.payloadId)
    window.close()
    return
  }
  dataUrl.value = payload.dataUrl
  window.addEventListener('keydown', onKeydown, true)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div
    class="h-full w-full overflow-hidden"
    @mousedown="onDragStart"
    @mousemove="onDragMove"
    @mouseup="onDragEnd"
    @wheel="onWheel"
    @dblclick="onDblClick"
    @contextmenu="onContextMenu"
  >
    <img class="h-full w-full" :src="dataUrl" alt="贴图" draggable="false" />
    <!-- 操作反馈（审查 P3-62）：toastMessage 此前无渲染方，「已复制/已入库」永远不可见 -->
    <div
      v-if="toastMessage"
      class="pointer-events-none fixed bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1 text-xs text-white"
    >
      {{ toastMessage }}
    </div>
    <div
      v-if="showMenu"
      class="fixed z-10 rounded-md border border-line-subtle bg-surface-1 py-1 text-xs shadow-xl"
      :style="{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }"
    >
      <button
        class="block w-full px-3 py-1.5 text-left text-fg-primary hover:bg-surface-2"
        @click="copyImage"
      >
        复制图片
      </button>
      <button
        class="block w-full px-3 py-1.5 text-left text-fg-primary hover:bg-surface-2"
        @click="toLibrary"
      >
        入库
      </button>
      <button
        class="block w-full px-3 py-1.5 text-left text-fg-primary hover:bg-surface-2"
        @click="close"
      >
        关闭
      </button>
    </div>
  </div>
</template>
