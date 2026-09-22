<script setup lang="ts">
/**
 * 编辑工具条（iShot 视觉基准）：图标化工具按钮 + 色板 + 线宽 + 撤销重做 + 动作，
 * 深色半透明圆角条。布局（挂选区下方/上方）交给父级。
 */
import type { AnnotationTool } from '../core/annotations'

defineProps<{
  canUndo: boolean
  canRedo: boolean
  tool: AnnotationTool
  color: string
  strokeWidth: number
}>()

const emit = defineEmits<{
  updateTool: [tool: AnnotationTool]
  updateColor: [color: string]
  updateWidth: [width: number]
  undo: []
  redo: []
  save: [action: 'library' | 'clipboard' | 'file' | 'pin']
  back: []
}>()

const TOOLS: Array<{ id: AnnotationTool; label: string; key: string }> = [
  { id: 'rect', label: '矩形（1）', key: '1' },
  { id: 'ellipse', label: '椭圆（2）', key: '2' },
  { id: 'arrow', label: '箭头（3）', key: '3' },
  { id: 'pen', label: '画笔（4）', key: '4' },
  { id: 'text', label: '文字（5）', key: '5' },
  { id: 'mosaic', label: '马赛克（6）', key: '6' }
]
const COLORS = [
  '#F2472A',
  '#F5A623',
  '#F8E71C',
  '#7ED321',
  '#4A90D9',
  '#9B59B6',
  '#FFFFFF',
  '#1D1D1F'
]
const WIDTHS = [2, 4, 7]
</script>

<template>
  <div class="flex items-center gap-1 rounded-lg border border-white/10 bg-[#1c1c20f0] px-2 py-1.5 shadow-2xl backdrop-blur">
    <!-- 工具（iShot 同款图标化） -->
    <button
      v-for="t in TOOLS"
      :key="t.id"
      type="button"
      class="flex size-8 items-center justify-center rounded-md transition-colors"
      :class="tool === t.id ? 'bg-brand-500 text-white' : 'text-white/85 hover:bg-white/10'"
      :title="t.label"
      @click="emit('updateTool', t.id)"
    >
      <!-- 内联 SVG 图标（capture 轻量入口不引图标库） -->
      <svg v-if="t.id === 'rect'" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="3.5" width="11" height="9" rx="1" stroke="currentColor" stroke-width="1.5" />
      </svg>
      <svg v-else-if="t.id === 'ellipse'" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="8" rx="5.5" ry="4.5" stroke="currentColor" stroke-width="1.5" />
      </svg>
      <svg v-else-if="t.id === 'arrow'" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 13L12 4M12 4H7.5M12 4V8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <svg v-else-if="t.id === 'pen'" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 13.5c2-0.5 3-2 4-4s2.5-3.5 4.5-4c1.5-0.4 2.5-1 3-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <svg v-else-if="t.id === 'text'" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 3.5h10M8 3.5V13M5.5 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="5" height="5" fill="currentColor" opacity="0.85" />
        <rect x="9" y="2" width="5" height="5" fill="currentColor" opacity="0.5" />
        <rect x="2" y="9" width="5" height="5" fill="currentColor" opacity="0.5" />
        <rect x="9" y="9" width="5" height="5" fill="currentColor" opacity="0.85" />
      </svg>
    </button>
    <span class="mx-0.5 h-5 w-px bg-white/15" />
    <button
      v-for="c in COLORS"
      :key="c"
      type="button"
      class="size-[18px] rounded-full border-2 transition-transform"
      :class="color === c ? 'scale-110 border-white' : 'border-transparent'"
      :style="{ background: c }"
      :aria-label="`颜色 ${c}`"
      @click="emit('updateColor', c)"
    />
    <span class="mx-0.5 h-5 w-px bg-white/15" />
    <button
      v-for="w in WIDTHS"
      :key="w"
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/10"
      :class="{ 'bg-white/20': strokeWidth === w }"
      :aria-label="`线宽 ${w}`"
      @click="emit('updateWidth', w)"
    >
      <span class="rounded-full bg-white" :style="{ width: `${w + 4}px`, height: `${w}px` }" />
    </button>
    <span class="mx-0.5 h-5 w-px bg-white/15" />
    <button type="button" class="flex size-8 items-center justify-center rounded-md text-white/85 hover:bg-white/10 disabled:opacity-30" :disabled="!canUndo" title="撤销（⌘Z）" @click="emit('undo')">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M6 3L2.5 6.5L6 10M2.5 6.5H10a3.5 3.5 0 013.5 3.5v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <button type="button" class="flex size-8 items-center justify-center rounded-md text-white/85 hover:bg-white/10 disabled:opacity-30" :disabled="!canRedo" title="重做（⌘⇧Z）" @click="emit('redo')">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 3l3.5 3.5L10 10M13.5 6.5H6A3.5 3.5 0 002.5 10v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <span class="mx-0.5 h-5 w-px bg-white/15" />
    <button type="button" class="rounded-md px-2 py-1 text-xs text-white/85 hover:bg-white/10" title="返回选区（Esc）" @click="emit('back')">返回</button>
    <button type="button" class="rounded-md px-2 py-1 text-xs text-white/85 hover:bg-white/10" title="贴图到屏幕" @click="emit('save', 'pin')">贴图</button>
    <button type="button" class="rounded-md px-2 py-1 text-xs text-white/85 hover:bg-white/10" title="复制到剪贴板（⌘C）" @click="emit('save', 'clipboard')">复制</button>
    <button type="button" class="rounded-md px-2 py-1 text-xs text-white/85 hover:bg-white/10" title="保存为文件（⌘S）" @click="emit('save', 'file')">存文件</button>
    <button type="button" class="ml-0.5 rounded-md bg-brand-500 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90" title="入库（Enter）" @click="emit('save', 'library')">入库</button>
  </div>
</template>
