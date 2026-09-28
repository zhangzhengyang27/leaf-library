<script setup lang="ts">
/**
 * TagGroupSection · 群组分节（028，Eagle .group-header 形态）
 *
 * 「群组名 (计数) ＋」标题行（仅群组分节带加号=向组内添加标签）+ 描述行
 * （Eagle contenteditable 添加描述...，Vue 版用 input，失焦/Enter 落库）
 * + 该组 tag chip 网格。组间分隔线由父级间距承担（Eagle .separator 25px）。
 */
import { nextTick, ref, watch } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import TagChip from './TagChip.vue'
import type { TagSection } from '../composables/useTagManager'
import type { TagSummary } from '../../../types/photo'

const props = defineProps<{
  section: TagSection
  selectedIds: Set<string>
  keyword?: string
  dragIds: string[]
  /** Eagle 列表模式：chip 通栏 */
  listMode?: boolean
}>()

const emit = defineEmits<{
  select: [tag: TagSummary, mods: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }]
  open: [tag: TagSummary]
  menu: [tag: TagSummary, x: number, y: number]
  addTags: [groupId: string]
  saveDescription: [groupId: string, text: string]
  dragstart: [tag: TagSummary]
  dragend: []
}>()

const editingDesc = ref(false)
const descDraft = ref('')
const descInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.section.description,
  () => {
    editingDesc.value = false
  }
)

async function startEditDesc(): Promise<void> {
  if (props.section.kind !== 'group') return
  descDraft.value = props.section.description ?? ''
  editingDesc.value = true
  await nextTick()
  descInput.value?.focus()
}

async function commitDesc(): Promise<void> {
  if (!editingDesc.value) return
  editingDesc.value = false
  const groupId = props.section.groupId
  if (!groupId) return
  if ((descDraft.value.trim() || null) !== (props.section.description ?? null)) {
    emit('saveDescription', groupId, descDraft.value.trim())
  }
}
</script>

<template>
  <section class="tag-group-section">
    <!-- 群组名行（Eagle .group-name 16px + count + 加号） -->
    <div class="group-header">
      <span class="group-title">{{ section.title }}</span>
      <span class="group-count">({{ section.count }})</span>
      <button
        v-if="section.kind === 'group'"
        type="button"
        class="add-btn"
        title="向此群组添加标签"
        @click="emit('addTags', section.groupId!)"
      >
        <AppIcon icon="ic-sidebar-add" :size="14" />
      </button>
    </div>

    <!-- 描述行（Eagle .group-description：点击即编辑，placeholder 添加描述...） -->
    <input
      v-if="section.kind === 'group' && editingDesc"
      ref="descInput"
      v-model="descDraft"
      type="text"
      class="group-desc-input"
      placeholder="添加描述..."
      @blur="commitDesc"
      @keyup.enter="($event.target as HTMLInputElement).blur()"
      @keyup.escape="editingDesc = false"
    />
    <div
      v-else-if="section.kind === 'group'"
      class="group-desc"
      :class="{ 'is-empty': !section.description }"
      title="点击添加描述"
      @click="startEditDesc"
    >
      {{ section.description || '添加描述...' }}
    </div>

    <!-- chip 行（Eagle .tag-group-tags：minmax(199px,1fr) 网格；列表模式通栏） -->
    <div class="chip-grid" :class="{ 'is-list': listMode }">
      <TagChip
        v-for="t in section.tags"
        :key="t.id"
        :tag="t"
        :selected="selectedIds.has(t.id)"
        :keyword="keyword"
        :drag-ids="dragIds"
        @select="(tag, mods) => emit('select', tag, mods)"
        @open="(tag) => emit('open', tag)"
        @menu="(tag, x, y) => emit('menu', tag, x, y)"
        @dragstart="(tag) => emit('dragstart', tag)"
        @dragend="emit('dragend')"
      />
      <p v-if="section.tags.length === 0" class="section-empty">此分组暂无标签</p>
    </div>
  </section>
</template>

<style scoped>
.tag-group-section {
  padding: 4px 0 10px 6px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--line-subtle);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  white-space: nowrap;
}

.group-title {
  font-size: 16px;
  color: var(--fg-primary);
}

.group-count {
  font-family: var(--font-family-mono, ui-monospace);
  font-size: 12px;
  opacity: 0.5;
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 23px;
  height: 24px;
  border-radius: 6px;
  color: var(--fg-secondary);
}

.add-btn:hover {
  background-color: var(--surface-hover);
  color: var(--fg-primary);
}

.group-desc {
  min-height: 20px;
  margin: 2px 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line-subtle);
  font-size: 13px;
  line-height: 1.4;
  color: var(--fg-secondary);
  cursor: text;
}

.group-desc.is-empty {
  color: var(--fg-tertiary);
}

.group-desc:hover {
  background-color: var(--surface-hover);
}

.group-desc-input {
  width: 100%;
  min-width: 0;
  margin: 2px 0 12px;
  padding: 2px 0 8px;
  border: 0;
  border-bottom: 1px solid var(--brand-500);
  border-radius: 0;
  background: transparent;
  font-size: 13px;
  color: var(--fg-primary);
  outline: none;
}

.chip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(199px, 1fr));
  gap: 2px;
}

/* Eagle .list-mode：chip 通栏 */
.chip-grid.is-list {
  display: flex;
  flex-direction: column;
}

.chip-grid.is-list .tag-chip {
  width: 100%;
}

.section-empty {
  font-size: 12px;
  color: var(--fg-tertiary);
}
</style>
