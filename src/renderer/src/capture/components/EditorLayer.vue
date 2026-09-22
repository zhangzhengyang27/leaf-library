<script setup lang="ts">
/**
 * 编辑舞台：黑底居中裁剪图 + AnnotateCanvas + 舞台下方工具条。
 * 键盘：1-6 工具 / ⌘Z ⌘⇧Z / ⌘C 复制 / ⌘S 存文件 / Enter 入库 / Esc 返回选区。
 * 导出的 dataUrl 来自标注画布（含背景+标注），交由父级 invoke screenshot.save。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AnnotateCanvas from './AnnotateCanvas.vue'
import EditToolbar from './EditToolbar.vue'
import type { AnnotationTool } from '../core/annotations'
import type { Rect } from '../core/geometry'
import type { ScreenshotSettings } from '@shared/ipc-contract'

const props = defineProps<{
  crop: HTMLCanvasElement
  region: Rect
  scale: number
  settings: ScreenshotSettings
}>()

const emit = defineEmits<{
  back: []
  save: [
    payload: {
      dataUrl: string
      actions: { library: boolean; clipboard: boolean; file: boolean; pin: boolean }
    }
  ]
}>()

const tool = ref<AnnotationTool>('rect')
const color = ref('#F2472A')
const strokeWidth = ref(4)
const historyState = ref({ canUndo: false, canRedo: false })
const annotate = ref<InstanceType<typeof AnnotateCanvas> | null>(null)

const stageLeft = computed(() => Math.max(0, (window.innerWidth - props.region.width) / 2))
const stageTop = computed(() => Math.max(24, (window.innerHeight - props.region.height) / 2 - 24))

const TOOLS_BY_KEY: Record<string, AnnotationTool> = {
  '1': 'rect',
  '2': 'ellipse',
  '3': 'arrow',
  '4': 'pen',
  '5': 'text',
  '6': 'mosaic'
}

function doSave(action: 'library' | 'clipboard' | 'file' | 'pin'): void {
  if (!annotate.value) return
  emit('save', {
    dataUrl: annotate.value.exportDataUrl(props.settings.format, props.settings.quality),
    actions: {
      library: action === 'library',
      clipboard: action === 'clipboard',
      file: action === 'file',
      pin: action === 'pin'
    }
  })
}

function onKeydown(e: KeyboardEvent): void {
  const mod = e.metaKey || e.ctrlKey
  if (!mod && TOOLS_BY_KEY[e.key]) {
    tool.value = TOOLS_BY_KEY[e.key]!
    return
  }
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) annotate.value?.redo()
    else annotate.value?.undo()
    return
  }
  if (mod && e.key.toLowerCase() === 'c') {
    e.preventDefault()
    doSave('clipboard')
    return
  }
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault()
    doSave('file')
    return
  }
  if (e.key === 'Enter') {
    doSave('library')
    return
  }
  if (e.key === 'Escape') emit('back')
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div class="absolute inset-0 bg-black/85">
    <div
      class="absolute flex flex-col items-end"
      :style="{ left: `${stageLeft}px`, top: `${stageTop}px` }"
    >
      <AnnotateCanvas
        ref="annotate"
        :crop="crop"
        :scale="scale"
        :tool="tool"
        :annotation-style="{ color, strokeWidth }"
        @history-change="historyState = $event"
      />
      <EditToolbar
        class="mt-3"
        :can-undo="historyState.canUndo"
        :can-redo="historyState.canRedo"
        :tool="tool"
        :color="color"
        :stroke-width="strokeWidth"
        @update-tool="tool = $event"
        @update-color="color = $event"
        @update-width="strokeWidth = $event"
        @undo="annotate?.undo()"
        @redo="annotate?.redo()"
        @save="doSave"
        @back="emit('back')"
      />
    </div>
  </div>
</template>
