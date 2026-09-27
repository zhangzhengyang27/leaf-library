<script setup lang="ts">
/**
 * DimensionPoolPopover · 筛选维度池弹层（D-012 / 三轮 G2；二十六轮对齐 Eagle 池实测）
 *
 * Eagle 实测池形态：搜索 + 全部维度行（拖拽手柄 ‖ 图标 + 名称 + AI 徽标 + 图钉）。
 * - 点击图钉固定/取消固定（固定集即筛选行 tab）
 * - 拖拽行排序（Eagle ic-drag-help），顺序持久化并决定筛选行渲染序
 * TitleBar 与 FilterBar 复用本组件；状态（图钉集/顺序）由 localStorage 单源提供，
 * 组件只读 + 转发 toggle/reorder。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import {
  FILTER_DIMENSIONS,
  loadDimensionOrder,
  type DimensionId,
  type FilterDimensionMeta
} from '@views/photos/constants/filterDimensions'

const props = defineProps<{
  /** 当前已固定的维度 */
  pinned: DimensionId[]
}>()

const emit = defineEmits<{
  /** 点击图钉：固定/取消固定（纯开关） */
  (e: 'toggle', id: DimensionId): void
  /** 点击维度行（Eagle「用这个筛选」）：固定如未固定 + 打开取值面板 */
  (e: 'open', id: DimensionId): void
  /** 拖拽排序：把 from 移到 to 位置 */
  (e: 'reorder', from: DimensionId, to: DimensionId): void
}>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const search = ref('')

/** 展示顺序 = 持久化顺序（响应 leaf:dimensions-changed 同步刷新） */
const order = ref<DimensionId[]>(loadDimensionOrder())
const metaById = computed(() => {
  const map = new Map<DimensionId, FilterDimensionMeta>()
  for (const d of FILTER_DIMENSIONS) map.set(d.id, d)
  return map
})

const results = computed<FilterDimensionMeta[]>(() => {
  const q = search.value.trim().toLowerCase()
  const list = order.value.map((id) => metaById.value.get(id)).filter((d): d is FilterDimensionMeta => !!d)
  if (!q) return list
  return list.filter((d) => d.label.toLowerCase().includes(q))
})

// ── 拖拽排序（HTML5 DnD；句柄行 draggable，drop 时转发 reorder） ──

const draggingId = ref<DimensionId | null>(null)
const dragOverId = ref<DimensionId | null>(null)

function onDragStart(id: DimensionId, e: DragEvent): void {
  draggingId.value = id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
}
function onDragOver(id: DimensionId, e: DragEvent): void {
  if (!draggingId.value || draggingId.value === id) return
  e.preventDefault()
  e.dataTransfer && (e.dataTransfer.dropEffect = 'move')
  dragOverId.value = id
}
function onDrop(id: DimensionId, e: DragEvent): void {
  e.preventDefault()
  if (draggingId.value && draggingId.value !== id) emit('reorder', draggingId.value, id)
  draggingId.value = null
  dragOverId.value = null
}
function onDragEnd(): void {
  draggingId.value = null
  dragOverId.value = null
}

function toggleOpen(): void {
  open.value = !open.value
  if (open.value) {
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0)
  }
}
function onOutside(e: MouseEvent): void {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}
function close(): void {
  open.value = false
  document.removeEventListener('mousedown', onOutside, true)
}

function onDimsChanged(): void {
  order.value = loadDimensionOrder()
}
onMounted(() => window.addEventListener('leaf:dimensions-changed', onDimsChanged))
onBeforeUnmount(() => {
  close()
  window.removeEventListener('leaf:dimensions-changed', onDimsChanged)
})

defineExpose({ close })
</script>

<template>
  <div ref="rootEl" class="relative">
    <div
      v-if="open"
      class="absolute right-0 top-9 z-40 w-56 rounded-lg border border-line-default bg-surface-1 p-2 shadow-xl"
    >
      <input
        v-model="search"
        type="text"
        placeholder="搜索..."
        class="mb-2 h-6 w-full rounded-sm border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500"
      />
      <div
        v-for="d in results"
        :key="d.id"
        class="flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 text-[11px] text-fg-primary transition-colors duration-fast hover:bg-surface-hover"
        :class="[
          draggingId === d.id ? 'opacity-40' : '',
          dragOverId === d.id ? 'ring-1 ring-brand-400' : ''
        ]"
        draggable="true"
        @dragstart="onDragStart(d.id, $event)"
        @dragover="onDragOver(d.id, $event)"
        @drop="onDrop(d.id, $event)"
        @dragend="onDragEnd"
        @click="emit('open', d.id)"
      >
        <!-- 拖拽手柄（Eagle ic-drag-help） -->
        <AppIcon icon="ic-drag-help" :size="11" class="shrink-0 cursor-grab text-fg-muted" />
        <AppIcon :icon="d.icon" :size="13" class="shrink-0 text-fg-secondary" />
        <span class="min-w-0 flex-1 truncate">{{ d.label }}</span>
        <span
          v-if="d.ai"
          class="shrink-0 rounded-sm bg-brand-500/15 px-0.5 text-[9px] leading-3 text-brand-600 dark:text-brand-400"
          >AI</span
        >
        <!-- 图钉独立成钮（D-012 修复轮）：行点击是「用这个筛选」，图钉才是纯固定开关 -->
        <button
          type="button"
          class="pin-btn shrink-0 rounded-sm p-0.5 transition-colors duration-fast hover:bg-surface-hover"
          :class="pinned.includes(d.id) ? 'text-brand-500' : 'text-fg-muted'"
          :title="pinned.includes(d.id) ? '取消固定' : '固定到筛选行'"
          @click.stop="emit('toggle', d.id)"
        >
          <AppIcon
            :icon="
              pinned.includes(d.id) ? 'context-menu/ic-filter-pinned' : 'context-menu/ic-filter-pin'
            "
            :size="13"
          />
        </button>
      </div>
      <p v-if="results.length === 0" class="px-1 py-2 text-[11px] text-fg-muted">无匹配维度</p>
    </div>
    <slot :toggle="toggleOpen" :open="open" />
  </div>
</template>
