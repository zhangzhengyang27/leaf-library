<script setup lang="ts">
/**
 * TagChip · 标签 chip（028，Eagle tag-manager .tag 形态）
 *
 * 5px 色点 + 名称（搜索词命中 <b> 高亮）+ (使用数) 等宽数字；26px 行高，
 * hover/selected 态；可拖拽（dataTransfer 带选中集，落群组行=移动、落
 * 「常用标签」=设常用）；点选多选 / 双击用标签过滤素材 / 右键菜单。
 */
import { computed } from 'vue'
import type { TagSummary } from '../../../types/photo'

const props = defineProps<{
  tag: TagSummary
  selected: boolean
  keyword?: string
  /** 拖拽载荷 = 当前选中集（点选拖拽时把整批一起带走） */
  dragIds: string[]
}>()

const emit = defineEmits<{
  select: [tag: TagSummary, mods: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }]
  open: [tag: TagSummary]
  menu: [tag: TagSummary, x: number, y: number]
  dragstart: [tag: TagSummary]
  dragend: []
}>()

const hasColor = computed(() => Boolean(props.tag.color))
const usage = computed(() => props.tag.usageCount ?? 0)

/** Eagle fuzzy-match：命中片段加粗高亮（<b> 落主色） */
const nameParts = computed<[string, string?, string?]>(() => {
  const q = (props.keyword ?? '').trim()
  const name = props.tag.name
  if (!q) return [name]
  const idx = name.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return [name]
  return [name.slice(0, idx), name.slice(idx, idx + q.length), name.slice(idx + q.length)]
})

function onClick(e: MouseEvent): void {
  emit('select', props.tag, { metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })
}

function onMenu(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  emit('menu', props.tag, e.clientX, e.clientY)
}

function onDragStart(e: DragEvent): void {
  const ids = props.dragIds.includes(props.tag.id) ? props.dragIds : [props.tag.id]
  e.dataTransfer?.setData('application/x-leaf-tag-ids', JSON.stringify(ids))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  emit('dragstart', props.tag)
}
</script>

<template>
  <span
    class="tag-chip"
    :class="{ 'is-selected': selected, 'has-color': hasColor }"
    :style="hasColor ? { '--chip-color': tag.color! } : undefined"
    :data-chip-id="tag.id"
    draggable="true"
    @click="onClick"
    @dblclick="emit('open', tag)"
    @contextmenu="onMenu"
    @dragstart="onDragStart"
    @dragend="emit('dragend')"
  >
    <span class="chip-dot" />
    <span class="chip-name">
      <template v-if="nameParts[1] !== undefined"
        >{{ nameParts[0] }}<b>{{ nameParts[1] }}</b
        >{{ nameParts[2] }}</template
      >
      <template v-else>{{ nameParts[0] }}</template>
    </span>
    <span class="chip-count">({{ usage }})</span>
  </span>
</template>

<style scoped>
/* Eagle .tag：26px 行高、6px 圆角、minmax(199px,1fr) 网格由父级铺 */
.tag-chip {
  display: flex;
  align-items: center;
  position: relative;
  min-width: 0;
  height: 26px;
  padding: 0 4px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--fg-primary);
  cursor: default;
  user-select: none;
}

.tag-chip:hover {
  background-color: var(--surface-hover);
}

.tag-chip.is-selected {
  background-color: var(--surface-active);
}

.chip-dot {
  flex: none;
  width: 5px;
  height: 5px;
  margin-right: 4px;
  border-radius: 50%;
  background-color: var(--fg-secondary);
  opacity: 0.5;
}

/* Eagle .color-*：有色标签点亮色点 */
.tag-chip.has-color .chip-dot {
  background-color: var(--chip-color);
  opacity: 1;
}

.chip-name {
  display: inline-block;
  max-width: calc(100% - 60px);
  overflow: hidden;
  line-height: 26px;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.95;
}

.tag-chip:hover .chip-name,
.tag-chip.is-selected .chip-name {
  opacity: 1;
}

.chip-name b {
  font-weight: var(--font-weight-bold, 700);
  color: var(--brand-500);
}

.chip-count {
  flex: none;
  margin-left: 6px;
  font-family: var(--font-family-mono, ui-monospace);
  font-size: 12px;
  opacity: 0.5;
}

.tag-chip.is-selected .chip-count {
  opacity: 1;
}
</style>
