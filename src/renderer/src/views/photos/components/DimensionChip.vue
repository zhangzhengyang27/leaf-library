<script setup lang="ts">
/**
 * DimensionChip · 筛选维度 chip（四轮对齐 Eagle：图标+文字按钮，点击弹层选值）
 *
 * Eagle 实测：筛选行为「🌈颜色 / 🔖标签 / 📁文件夹 / ▫形状 / ⭐评分 / </>格式 / ＋」
 * 一排图标+文字按钮，点击各自弹出选项弹层（激活态描边）。
 * 本组件只负责触发器与开合，选项内容由使用方以 #panel 插槽注入。
 */
import { onBeforeUnmount, onMounted, ref, useSlots } from 'vue'
import AppIcon from '@components/AppIcon.vue'

defineProps<{
  label: string
  icon: string
  /** 维度激活中（描边高亮） */
  active?: boolean
  /** 二十六轮：生效摘要 token（Eagle：排除「格式」后 tab 显示「-png」） */
  token?: string
}>()

const slots = useSlots()
const hasPanel = (): boolean => !!slots.panel

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

/** 五轮审查：弹层互斥（Eagle 同一时刻只开一个） */
const CHIP_OPEN_EVENT = 'leaf:dimension-chip-open'

function toggle(): void {
  if (open.value) close()
  else show()
}
/** 九轮：外部触发打开（⌘⇧T 标签筛选） */
function show(): void {
  if (open.value) return
  open.value = true
  window.dispatchEvent(new CustomEvent(CHIP_OPEN_EVENT, { detail: rootEl.value }))
  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true)
    window.addEventListener('keydown', onEsc, true)
  }, 0)
}
function onSiblingOpen(e: Event): void {
  if ((e as CustomEvent).detail !== rootEl.value && open.value) close()
}
function onOutside(e: MouseEvent): void {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}
function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}
function close(): void {
  open.value = false
  document.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('keydown', onEsc, true)
}
onMounted(() => window.addEventListener(CHIP_OPEN_EVENT, onSiblingOpen))
onBeforeUnmount(() => {
  close()
  window.removeEventListener(CHIP_OPEN_EVENT, onSiblingOpen)
})

/** 选择后收起（多选面板可传 false 保持打开）；show 供快捷键外部打开 */
defineExpose({ close, show })
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      type="button"
      class="flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[11px] transition-colors duration-fast"
      :class="
        active || open
          ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
          : 'border-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg-primary'
      "
      :aria-pressed="active"
      @click="toggle"
    >
      <AppIcon :icon="icon" :size="14" />
      {{ token ?? label }}
    </button>
    <div
      v-if="open && hasPanel()"
      class="absolute left-0 top-8 z-40 overflow-hidden rounded-lg border border-line-default bg-surface-1 shadow-xl"
    >
      <slot name="panel" :close="close" />
    </div>
  </div>
</template>
