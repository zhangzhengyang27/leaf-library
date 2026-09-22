<script setup lang="ts">
/**
 * 遮罩会话容器：loading（抓屏）→ select（选区）→ edit（标注）。
 * 背景是抓屏快照（伪遮罩）；选区确认即从快照裁剪；导出 dataUrl 由编辑器给出。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import SelectionLayer from './SelectionLayer.vue'
import EditorLayer from './EditorLayer.vue'
import type { CaptureSessionSpec } from '../core/session'
import type { Rect } from '../core/geometry'
import { cropImageToCanvas, loadImage } from '../core/snapshot'
import { showToast } from '../core/toast'
import type {
  ScreenshotSaveRequest,
  ScreenshotSaveResult,
  ScreenshotSettings
} from '@shared/ipc-contract'

const props = defineProps<{ session: CaptureSessionSpec }>()

type Phase = 'loading' | 'select' | 'edit'
const phase = ref<Phase>('loading')
const snapshot = ref<HTMLImageElement | null>(null)
const crop = ref<HTMLCanvasElement | null>(null)
const region = ref<Rect>({ x: 0, y: 0, width: 0, height: 0 })
const settings = ref<ScreenshotSettings | null>(null)

function startEdit(rect: Rect): void {
  if (!snapshot.value || !rect.width || !rect.height) return
  crop.value = cropImageToCanvas(snapshot.value, rect, props.session.scale)
  region.value = rect
  phase.value = 'edit'
}

onMounted(async () => {
  console.log('[capture-page] mounted, popSnapshot...')
  window.addEventListener('keydown', onGlobalKey, true)
  try {
    // startCapture 已在开窗前用系统 screencapture 预抓好整屏，这里只管取走
    const snap = await window.api.screenshot.popSnapshot()
    console.log('[capture-page] popSnapshot ok:', snap.ok)
    if (!snap.ok || !snap.dataUrl) throw new Error(snap.error ?? '快照不可用')
    snapshot.value = await loadImage(snap.dataUrl)
    console.log('[capture-page] snapshot loaded')
    settings.value = await window.api.screenshot.getSettings()
    // fullscreen / last 模式带初始区域直接进编辑
    if (props.session.mode === 'region') phase.value = 'select'
    else startEdit(props.session.initial)
    console.log('[capture-page] phase:', phase.value, '→ ready')
    await window.api.screenshot.ready()
  } catch (err) {
    console.log('[capture-page] error:', err)
    await window.api.screenshot.cancel('error', err instanceof Error ? err.message : String(err))
    window.close()
  }
})

onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey, true))

async function onCancel(): Promise<void> {
  await window.api.screenshot.cancel('user')
  window.close()
}

async function onSave(payload: {
  dataUrl: string
  actions: ScreenshotSaveRequest['actions']
}): Promise<void> {
  const result: ScreenshotSaveResult = await window.api.screenshot.save({
    dataUrl: payload.dataUrl,
    displayId: props.session.displayId,
    region: region.value,
    actions: payload.actions
  })
  if (!result.ok) {
    showToast(result.error ?? '保存失败')
    return
  }
  window.close()
}

/** 顶层 Esc：loading 阶段也可取消 */
function onGlobalKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && phase.value === 'loading') void onCancel()
}
</script>

<template>
  <!-- 根节点保持透明：遮罩窗本身透明，加载期间用户看到实时桌面，快照就绪即"冻结" -->
  <div class="fixed inset-0 select-none overflow-hidden">
    <img
      v-if="snapshot"
      class="pointer-events-none absolute inset-0"
      :style="{ width: `${session.bounds.width}px`, height: `${session.bounds.height}px` }"
      :src="snapshot.src"
      alt=""
    />
    <SelectionLayer
      v-if="phase === 'select'"
      :bounds="{ width: session.bounds.width, height: session.bounds.height }"
      :scale="session.scale"
      :source="snapshot"
      :initial="session.initial"
      :last="session.last"
      @confirm="startEdit"
      @cancel="onCancel"
    />
    <EditorLayer
      v-else-if="phase === 'edit' && crop"
      :crop="crop"
      :region="region"
      :scale="session.scale"
      :settings="settings!"
      @back="phase = 'select'"
      @save="onSave"
    />
  </div>
</template>
