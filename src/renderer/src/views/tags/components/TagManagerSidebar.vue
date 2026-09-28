<script setup lang="ts">
/**
 * TagManagerSidebar · 标签管理左栏菜单（028，Eagle .tag-manager-sidebar 形态）
 *
 * 全部 / 未分类 / 常用标签（starred，可作拖放目标）+ 「标签群组 (N) ＋」label 行
 * + 群组行列表（色点图标+名称+成员数；单击打开、双击行内重命名、右键菜单、
 * HTML5 拖拽排序、可作拖放目标=移标签入组）。240px 起步，东缘可拖宽。
 */
import { computed, nextTick, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import { useContextMenu, type MenuItem } from '@composables/useContextMenu'
import { useDialogs } from '../../photos/composables/useDialogs'
import { TAG_PRESET_COLORS, type TagManagerStore } from '../composables/useTagManager'
import type { TagSummary } from '../../../types/photo'

const props = defineProps<{
  m: TagManagerStore
}>()

const menu = useContextMenu()
const { requestPrompt } = useDialogs()

const SIDEBAR_W_KEY = 'leaf.tagManager.sidebarW'
const width = ref<number>(Number(localStorage.getItem(SIDEBAR_W_KEY)) || 240)
const resizing = ref(false)

function onResizeStart(e: PointerEvent): void {
  e.preventDefault()
  resizing.value = true
  const startX = e.clientX
  const startW = width.value
  const onMove = (ev: PointerEvent): void => {
    width.value = Math.min(420, Math.max(180, startW + ev.clientX - startX))
  }
  const onUp = (): void => {
    resizing.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    try {
      localStorage.setItem(SIDEBAR_W_KEY, String(width.value))
    } catch {
      /* 忽略 */
    }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

// ── 固定项 ──
const fixedItems = computed(() => [
  {
    key: 'all' as const,
    label: '全部',
    icon: 'ic-tag-manager-all',
    count: props.m.totalCount.value,
    active: props.m.viewMode.value === 'all' && !props.m.currentGroupId.value
  },
  {
    key: 'unfiled' as const,
    label: '未分类',
    icon: 'ic-tag-manager-unfiled',
    count: props.m.unfiledTags.value.length,
    active: props.m.viewMode.value === 'unfiled'
  },
  {
    key: 'starred' as const,
    label: '常用标签',
    icon: 'ic-tag-manager-starred',
    count: props.m.starredTags.value.length,
    active: props.m.viewMode.value === 'starred'
  }
])

function openFixed(key: 'all' | 'unfiled' | 'starred'): void {
  props.m.openMode(key)
}

// ── 群组行 ──
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
/** v-for 内的模板 ref 会被 Vue 收成数组——行内编辑同一时刻只有一处，取首个即可 */
const renameInput = ref<HTMLInputElement | null>(null)

function setRenameRef(el: unknown): void {
  renameInput.value = Array.isArray(el) ? (el[0] as HTMLInputElement | null) : (el as HTMLInputElement | null)
}

async function startRename(g: TagSummary): Promise<void> {
  renamingId.value = g.id
  renameDraft.value = g.name
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

async function commitRename(g: TagSummary): Promise<void> {
  renamingId.value = null
  const trimmed = renameDraft.value.trim()
  if (!trimmed || trimmed === g.name) return
  await props.m.renameTag(g.id, trimmed)
}

/** 群组右键菜单（Eagle openTagGroupContextMenu 裁剪版：筛选/重命名/移除/颜色） */
function openGroupMenu(e: MouseEvent, g: TagSummary): void {
  e.preventDefault()
  e.stopPropagation()
  const items: MenuItem[] = [
    { key: 'filter', label: '用此群组筛选', icon: 'context-menu/ic-tag-filter' },
    { key: 'd1', divider: true },
    { key: 'rename', label: '重命名', icon: 'context-menu/ic-rename' },
    { key: 'dissolve', label: '移除群组', icon: 'context-menu/ic-tag-remove-group' },
    { key: 'd2', divider: true },
    {
      key: 'color',
      label: '颜色',
      colors: TAG_PRESET_COLORS.map((hex, i) => ({ key: `c${i}`, hex }))
    }
  ]
  menu.open(e.clientX, e.clientY, items, (key) => {
    if (key === 'filter') {
      // Eagle：用群组筛选 = 打开群组视图（单父级下落到组视图）
      props.m.openGroup(g.id)
    } else if (key === 'rename') {
      void startRename(g)
    } else if (key === 'dissolve') {
      props.m.dissolveGroup(g.id, g.name)
    } else if (key.startsWith('color:')) {
      // 色点行回传 `color:<itemKey>:<dotKey>`（UContextMenu pickColor 约定）
      const dotKey = key.split(':')[2] ?? ''
      const idx = Number(dotKey.replace(/^c/, ''))
      void props.m.setColor(g.id, Number.isFinite(idx) ? (TAG_PRESET_COLORS[idx] ?? null) : null)
    }
  })
}

function promptAddGroup(): void {
  requestPrompt({
    title: '添加群组',
    label: '群组名称',
    initialValue: '',
    confirmLabel: '添加',
    onSubmit: async (name) => {
      await props.m.createGroup(name)
    }
  })
}

// ── 拖放：标签移入群组/常用、群组行排序 ──
const dragOverKey = ref<string | null>(null)
const draggingGroupId = ref<string | null>(null)

function readDragIds(e: DragEvent): string[] {
  try {
    const raw = e.dataTransfer?.getData('application/x-leaf-tag-ids')
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function onStarredDragOver(e: DragEvent): void {
  if (!e.dataTransfer?.types.includes('application/x-leaf-tag-ids')) return
  e.preventDefault()
  dragOverKey.value = 'starred'
}

/** 拖标签到「常用标签」= 设常用（Eagle onDropStarredTag） */
function onDropStarred(e: DragEvent): void {
  e.preventDefault()
  dragOverKey.value = null
  const ids = readDragIds(e)
  if (ids.length > 0) void props.m.setStarred(ids, true)
}

function onDragLeave(key: string): void {
  if (dragOverKey.value === key) dragOverKey.value = null
}

function onDropIntoGroup(e: DragEvent, groupId: string): void {
  e.preventDefault()
  dragOverKey.value = null
  const ids = readDragIds(e)
  if (ids.length > 0) void props.m.moveTagsToGroup(ids, groupId)
}

/** 群组行拖起（排序载荷） */
function onGroupDragStart(e: DragEvent, g: TagSummary): void {
  e.dataTransfer?.setData('application/x-leaf-group-id', g.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  draggingGroupId.value = g.id
}

function onGroupDragEnd(): void {
  draggingGroupId.value = null
  dragOverKey.value = null
}

/** 群组行 dragover：标签载荷=入组高亮；群组载荷=实时交换排序（Eagle ui-sortable 语义） */
function onGroupDragOver(e: DragEvent, g: TagSummary): void {
  const types = e.dataTransfer?.types
  if (types?.includes('application/x-leaf-tag-ids')) {
    e.preventDefault()
    dragOverKey.value = g.id
  } else if (types?.includes('application/x-leaf-group-id')) {
    e.preventDefault()
    const draggedId = draggingGroupId.value
    if (!draggedId || draggedId === g.id) return
    const ids = props.m.groups.value.map((x) => x.id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(g.id)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0]!)
    void props.m.reorderGroups(ids)
  }
}
</script>

<template>
  <aside
    class="tag-sidebar relative flex shrink-0 flex-col border-r border-line-subtle bg-surface-0"
    :style="{ width: `${width}px` }"
  >
    <div class="app-scroll min-h-0 flex-1 overflow-y-auto pb-3 pt-3">
      <!-- 固定项 -->
      <button
        v-for="item in fixedItems"
        :key="item.key"
        type="button"
        class="sidebar-item"
        :class="{ 'is-active': item.active, 'is-drop': dragOverKey === item.key }"
        @click="openFixed(item.key)"
        @dragover="item.key === 'starred' ? onStarredDragOver($event) : undefined"
        @dragleave="onDragLeave(item.key)"
        @drop="item.key === 'starred' ? onDropStarred($event) : undefined"
      >
        <AppIcon :icon="item.icon" :size="16" class="shrink-0 text-fg-secondary" />
        <span class="item-name">{{ item.label }}</span>
        <span v-if="item.count > 0" class="item-count">{{ item.count }}</span>
      </button>

      <!-- 群组 label 行（Eagle groupsLabel + 计数 + 添加群组按钮） -->
      <div class="group-label">
        <span>
          标签群组<template v-if="m.groups.value.length > 0"
            >({{ m.groups.value.length }})</template
          >
        </span>
        <button type="button" class="add-group-btn" title="添加群组" @click="promptAddGroup">
          <AppIcon icon="ic-sidebar-add" :size="15" />
        </button>
      </div>

      <!-- 群组行列表（可拖拽排序 / 拖放目标） -->
      <button
        v-for="g in m.groups.value"
        :key="g.id"
        type="button"
        class="sidebar-item"
        :class="{
          'is-active': m.currentGroupId.value === g.id,
          'is-drop': dragOverKey === g.id
        }"
        draggable="true"
        @click="m.openGroup(g.id)"
        @dblclick="startRename(g)"
        @contextmenu="openGroupMenu($event, g)"
        @dragstart="onGroupDragStart($event, g)"
        @dragend="onGroupDragEnd"
        @dragover="onGroupDragOver($event, g)"
        @dragleave="onDragLeave(g.id)"
        @drop="onDropIntoGroup($event, g.id)"
      >
        <span class="group-dot" :style="{ backgroundColor: g.color || 'var(--fg-secondary)' }" />
        <input
          v-if="renamingId === g.id"
          :ref="setRenameRef"
          v-model="renameDraft"
          type="text"
          class="rename-input"
          @click.stop
          @blur="commitRename(g)"
          @keyup.enter="($event.target as HTMLInputElement).blur()"
          @keyup.escape="renamingId = null"
        />
        <span v-else class="item-name">{{ g.name }}</span>
        <span class="item-count">{{ m.childrenOf(g.id).length }}</span>
      </button>
    </div>

    <!-- 东缘拖宽（Eagle resizable e） -->
    <div class="resize-edge" :class="{ 'is-resizing': resizing }" @pointerdown="onResizeStart" />
  </aside>
</template>

<style scoped>
.tag-sidebar {
  z-index: 1;
}

.sidebar-item {
  display: flex;
  align-items: center;
  width: calc(100% - 24px);
  height: 26px;
  margin: 0 12px 1px;
  padding: 0 6px 0 4px;
  border-radius: 6px;
  color: var(--fg-primary);
  text-align: left;
}

.sidebar-item:hover {
  background-color: var(--surface-hover);
}

.sidebar-item.is-active {
  background-color: var(--surface-active);
}

.sidebar-item.is-drop {
  background-color: color-mix(in srgb, var(--brand-500) 18%, transparent);
  outline: 1px solid var(--brand-500);
  outline-offset: -1px;
}

.item-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  padding-left: 6px;
  font-size: 13px;
  line-height: 24px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.item-count {
  flex: none;
  margin-left: auto;
  font-family: var(--font-family-mono, ui-monospace);
  font-size: 11px;
  opacity: 0.5;
}

.group-label {
  display: flex;
  align-items: center;
  height: 26px;
  margin: 12px 12px 2px;
  padding-left: 4px;
  font-size: 12px;
  color: var(--fg-tertiary);
}

.add-group-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 20px;
  margin-left: auto;
  border-radius: 4px;
  color: var(--fg-secondary);
  opacity: 0.5;
}

.add-group-btn:hover {
  opacity: 1;
  background-color: var(--surface-hover);
}

.group-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  opacity: 0.85;
}

.rename-input {
  min-width: 0;
  flex: 1;
  height: 22px;
  margin-left: 4px;
  padding: 0 4px;
  border: 1px solid var(--brand-500);
  border-radius: 4px;
  background: var(--surface-1);
  font-size: 13px;
  color: var(--fg-primary);
  outline: none;
}

.resize-edge {
  position: absolute;
  top: 0;
  right: -4px;
  bottom: 0;
  z-index: 2;
  width: 8px;
  cursor: col-resize;
}

.resize-edge.is-resizing {
  background: var(--brand-500);
  opacity: 0.3;
}
</style>
