<template>
  <div class="flex min-h-0 flex-1">
    <!-- 左栏：Eagle 式二级导航 -->
    <aside class="flex w-60 shrink-0 flex-col border-r border-line-subtle bg-surface-0">
      <div class="flex-1 overflow-y-auto p-3 app-scroll">
        <button
          v-for="sec in sections"
          :key="sec.id"
          type="button"
          class="mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
          :class="
            activeSection === sec.id
              ? 'bg-surface-hover font-medium text-fg-primary'
              : 'text-fg-secondary hover:bg-surface-hover'
          "
          @click="activeSection = sec.id"
        >
          <AppIcon :icon="sec.icon" />
          {{ sec.label }}
          <span class="ml-auto text-xs text-fg-muted">{{ sectionCount(sec.id) }}</span>
        </button>

        <!-- 标签群组（父标签列表） -->
        <div v-if="activeSection === 'groups'" class="mt-3 space-y-1">
          <button
            v-for="g in groupNodes"
            :key="g.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-fg-secondary transition-colors hover:bg-surface-hover"
            @click="groupFilterId = groupFilterId === g.id ? '' : g.id"
          >
            <span
              class="size-2.5 rounded-full"
              :style="{ backgroundColor: g.color ?? '#9ca3af' }"
            />
            <span class="min-w-0 flex-1 truncate text-left">{{ g.name }}</span>
            <span class="text-fg-muted">{{ childCountOf(g.id) }}</span>
          </button>
          <p v-if="groupNodes.length === 0" class="px-2 py-1 text-xs text-fg-muted">
            还没有标签群组（新建标签时选择父级即可成组）
          </p>
        </div>
      </div>

      <!-- 新建（Eagle 实测：群组 + 新增群组/标签） -->
      <div class="border-t border-line-subtle p-3">
        <div class="flex gap-1.5">
          <input
            v-model="newTagName"
            type="text"
            placeholder="新标签名称…"
            class="h-8 min-w-0 flex-1 rounded-md border border-line-default bg-surface-1 px-2 text-xs text-fg-primary focus:outline-none focus:border-brand-500"
            @keyup.enter="handleCreate"
          />
          <select
            v-model="newTagParent"
            title="所属群组"
            class="h-8 rounded-md border border-line-default bg-surface-1 px-1 text-xs text-fg-secondary"
          >
            <option value="">顶层</option>
            <option v-for="g in groupNodes" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
          <UButton size="sm" :loading="creating" @click="handleCreate">新建</UButton>
        </div>
      </div>
    </aside>

    <!-- 右区：工具行 + 标签卡片 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle px-4">
        <button
          type="button"
          :class="layoutBtnCls('grid')"
          :aria-pressed="tagLayout === 'grid'"
          title="网格视图"
          @click="tagLayout = 'grid'"
        >
          <AppIcon icon="ic-tag-manager-layout-grid" />
        </button>
        <button
          type="button"
          :class="layoutBtnCls('list')"
          :aria-pressed="tagLayout === 'list'"
          title="列表视图"
          @click="tagLayout = 'list'"
        >
          <AppIcon icon="ic-tag-manager-layout-list" />
        </button>
        <select
          v-model="sortBy"
          class="h-6 rounded-sm border border-line-default bg-surface-1 px-1 text-[11px] text-fg-secondary"
          title="排序"
        >
          <option value="name">按名称</option>
          <option value="usage">按使用数</option>
        </select>
        <div class="min-w-2 flex-1" />
        <input
          v-model="search"
          type="text"
          placeholder="搜索标签…"
          class="h-7 w-40 rounded-md border border-line-default bg-surface-1 px-2 text-xs text-fg-primary focus:outline-none focus:border-brand-500"
        />
      </div>

      <!-- F19：批量操作条（Eagle 4.0 标签管理多选） -->
      <div
        v-if="selectedTagIds.size > 0"
        class="relative flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle bg-brand-500/5 px-4"
      >
        <span class="text-xs font-medium text-fg-primary">已选 {{ selectedTagIds.size }} 个标签</span>
        <div class="min-w-2 flex-1" />
        <UButton size="sm" variant="ghost" @click="clearTagSelection">取消选择</UButton>
        <UButton size="sm" variant="secondary" @click="handleMergeSelected">合并为一个标签…</UButton>
        <UButton size="sm" variant="secondary" @click="batchColorOpen = !batchColorOpen">设置颜色</UButton>
        <UButton size="sm" variant="danger" @click="handleBatchDelete">删除</UButton>
        <div
          v-if="batchColorOpen"
          class="absolute right-4 top-full z-10 mt-1 flex gap-1.5 rounded-md border border-line-default bg-surface-0 p-2 shadow-lg"
        >
          <button
            v-for="c in PRESET_COLORS"
            :key="c"
            class="size-4 rounded-full transition-transform hover:scale-125"
            :style="{ backgroundColor: c }"
            @click="handleBatchColor(c)"
          />
        </div>
      </div>

      <div class="app-scroll min-h-0 flex-1 overflow-y-auto p-5">
        <div v-if="loading" class="py-16 text-center text-sm text-fg-muted">加载中…</div>
        <div v-else-if="visibleTags.length === 0" class="py-16 text-center text-fg-muted">
          <div class="mb-3 text-5xl">🏷️</div>
          <p class="text-base">没有标签</p>
          <p class="mt-1 text-sm">为项目添加标签，方便管理与查找。</p>
        </div>
        <div
          v-else
          :class="
            tagLayout === 'grid'
              ? 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3'
              : 'space-y-1.5'
          "
        >
          <div
            v-for="node in visibleTags"
            :key="node.id"
            class="rounded-md border border-line-subtle bg-surface-1 px-3 py-2.5"
          >
            <div class="flex items-center gap-2">
              <!-- F19：选择圆钮（Shift 连选） -->
              <button
                class="flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors"
                :class="
                  selectedTagIds.has(node.id)
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-line-strong text-transparent hover:border-brand-400'
                "
                :aria-label="selectedTagIds.has(node.id) ? '取消选择' : '选择'"
                @click.stop="toggleTagSelect(node, $event)"
              >
                <AppIcon v-if="selectedTagIds.has(node.id)" icon="ic-check" :size="10" />
              </button>
              <div class="relative shrink-0">
                <button
                  class="size-4 rounded-full border border-line-default"
                  :style="{ backgroundColor: node.color ?? 'var(--color-surface-3, #ccc)' }"
                  title="修改颜色"
                  @click="toggleColorPicker(node.id)"
                />
                <div
                  v-if="colorPickerFor === node.id"
                  class="absolute left-0 top-6 z-10 flex gap-1.5 rounded-md border border-line-default bg-surface-0 p-2 shadow-lg"
                >
                  <button
                    v-for="c in PRESET_COLORS"
                    :key="c"
                    class="size-4 rounded-full transition-transform hover:scale-125"
                    :style="{ backgroundColor: c }"
                    @click="handleSetColor(node, c)"
                  />
                </div>
              </div>

              <template v-if="editingId === node.id">
                <input
                  v-model="editingName"
                  class="min-w-0 flex-1 rounded border border-brand-500 bg-surface-0 px-2 py-1 text-sm text-fg-primary focus:outline-none"
                  @keyup.enter="handleRename(node)"
                  @keyup.escape="editingId = null"
                />
                <UButton size="sm" variant="primary" @click="handleRename(node)">保存</UButton>
              </template>
              <template v-else>
                <span class="min-w-0 flex-1 truncate text-sm text-fg-primary">
                  <span v-if="node.depth > 0" class="text-fg-muted">└ </span>{{ node.name }}
                  <span v-if="childCountOf(node.id) > 0" class="ml-1 text-xs text-fg-muted">
                    ({{ childCountOf(node.id) }} 子标签)
                  </span>
                </span>
                <span class="shrink-0 text-xs text-fg-muted">{{ node.usageCount ?? 0 }} 张</span>
                <button
                  class="flex h-6 w-6 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg-primary"
                  title="重命名"
                  @click="startRename(node)"
                >
                  <AppIcon icon="context-menu/ic-rename" :size="13" />
                </button>
                <button
                  class="flex h-6 w-6 items-center justify-center rounded-md text-danger transition-colors hover:bg-surface-hover"
                  title="删除"
                  @click="handleDelete(node)"
                >
                  <AppIcon icon="context-menu/ic-tag-delete" :size="13" />
                </button>
              </template>
            </div>
            <select
              v-if="tagLayout === 'list'"
              class="mt-1.5 rounded border border-line-default bg-surface-1 px-1 py-0.5 text-[11px] text-fg-secondary"
              :value="node.parentId ?? ''"
              title="所属群组"
              @change="handleSetParent(node, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">顶层</option>
              <option
                v-for="g in groupNodes"
                :key="g.id"
                :value="g.id"
                :disabled="g.id === node.id"
              >
                {{ g.name }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 标签管理页（D-013 阶段 3，对齐 Eagle 实测双栏标签管理）
 *
 * 左栏：标签管理(全部) / 未分类(顶层) / 常用标签(高频) / 标签群组；
 * 右区：标签卡片 grid/list + 排序 + 搜索。逻辑自 TagManagerModal 迁移扩展。
 */
import { ref, computed, onMounted } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import type { TagSummary } from '../../types/photo'
import { useToast } from '@composables/useToast'
import { useDialogs } from '../photos/composables/useDialogs'

const toast = useToast()

const PRESET_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#a855f7',
  '#14b8a6',
  '#6b7280'
]

type SectionId = 'all' | 'unfiled' | 'frequent' | 'groups'
const sections: Array<{ id: SectionId; label: string; icon: string }> = [
  { id: 'all', label: '标签管理', icon: 'context-menu/ic-tag-normal' },
  { id: 'unfiled', label: '未分类', icon: 'ic_tagUncategorized' },
  { id: 'frequent', label: '常用标签', icon: 'ic_star' },
  { id: 'groups', label: '标签群组', icon: 'context-menu/ic-tag-merge' }
]

const tags = ref<TagSummary[]>([])
const loading = ref(true)
const activeSection = ref<SectionId>('all')
const groupFilterId = ref('')
const tagLayout = ref<'grid' | 'list'>('grid')
const sortBy = ref<'name' | 'usage'>('name')
const search = ref('')
const newTagName = ref('')
const newTagParent = ref('')
const creating = ref(false)
const editingId = ref<string | null>(null)
const editingName = ref('')
const colorPickerFor = ref<string | null>(null)

/** 树形序（父在前、子缩进；孤儿兜底平铺） */
interface TagNode extends TagSummary {
  depth: number
}
const orderedTags = computed<TagNode[]>(() => {
  const byParent = new Map<string | null, TagSummary[]>()
  for (const t of tags.value) {
    const key = t.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(t)
  }
  const out: TagNode[] = []
  const walk = (parentKey: string | null, depth: number): void => {
    const children = (byParent.get(parentKey) ?? []).sort((a, b) => a.name.localeCompare(b.name))
    for (const c of children) {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  const listed = new Set(out.map((n) => n.id))
  for (const t of tags.value) {
    if (!listed.has(t.id)) out.push({ ...t, depth: 0 })
  }
  return out
})

/** 群组 = 被当作父级的标签 */
const groupNodes = computed<TagSummary[]>(() => {
  const parentIds = new Set(tags.value.map((t) => t.parentId).filter((v): v is string => !!v))
  return tags.value.filter((t) => parentIds.has(t.id))
})

function childCountOf(id: string): number {
  return tags.value.filter((t) => t.parentId === id).length
}

function sectionCount(id: SectionId): number {
  if (id === 'all') return tags.value.length
  if (id === 'unfiled') return tags.value.filter((t) => !t.parentId).length
  if (id === 'frequent') return tags.value.filter((t) => (t.usageCount ?? 0) >= 3).length
  return groupNodes.value.length
}

const visibleTags = computed<TagNode[]>(() => {
  let pool = orderedTags.value
  if (activeSection.value === 'unfiled') pool = pool.filter((t) => !t.parentId)
  else if (activeSection.value === 'frequent') pool = pool.filter((t) => (t.usageCount ?? 0) >= 3)
  else if (activeSection.value === 'groups') {
    pool = groupFilterId.value
      ? pool.filter((t) => t.parentId === groupFilterId.value)
      : pool.filter((t) => groupNodes.value.some((g) => g.id === t.id))
  }
  const q = search.value.trim().toLowerCase()
  if (q) pool = pool.filter((t) => t.name.toLowerCase().includes(q))
  const sorted = [...pool]
  if (sortBy.value === 'usage') sorted.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
  return sorted
})

function layoutBtnCls(mode: 'grid' | 'list'): string[] {
  return [
    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
    tagLayout.value === mode
      ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400'
      : 'text-fg-secondary hover:bg-surface-hover'
  ]
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    tags.value = (await window.api.tag.getTags()) as TagSummary[]
  } catch (error) {
    toast.error('加载标签失败', { description: (error as Error).message })
  } finally {
    loading.value = false
  }
}

async function handleCreate(): Promise<void> {
  const name = newTagName.value.trim()
  if (!name) return
  creating.value = true
  try {
    await window.api.tag.addTag(
      name,
      newTagParent.value ? { parentId: newTagParent.value } : undefined
    )
    newTagName.value = ''
    newTagParent.value = ''
    await reload()
  } catch (error) {
    toast.error('新建标签失败', { description: (error as Error).message })
  } finally {
    creating.value = false
  }
}

async function handleSetParent(tag: TagSummary, parentId: string): Promise<void> {
  const updated = await window.api.tag.updateTag(tag.id, { parentId })
  if (!updated) {
    toast.error('设置分组失败', { description: '不能选择自己或自己的子标签作为父级' })
    await reload()
    return
  }
  await reload()
}

async function handleRename(tag: TagSummary): Promise<void> {
  const name = editingName.value.trim()
  if (!name || name === tag.name) {
    editingId.value = null
    return
  }
  const updated = await window.api.tag.updateTag(tag.id, { name })
  if (!updated) {
    toast.error('重命名失败', { description: '可能已存在同名标签' })
    return
  }
  editingId.value = null
  await reload()
}

function startRename(tag: TagSummary): void {
  editingId.value = tag.id
  editingName.value = tag.name
  colorPickerFor.value = null
}

async function handleSetColor(tag: TagSummary, color: string): Promise<void> {
  colorPickerFor.value = null
  if (tag.color === color) return
  await window.api.tag.updateTag(tag.id, { color })
  await reload()
}

function toggleColorPicker(id: string): void {
  colorPickerFor.value = colorPickerFor.value === id ? null : id
}

/**
 * 删除标签（代码审查 S5）：会从全库素材上摘除该标签，属不可逆操作。
 * 补二次确认 + try/catch（旧实现直接 await，IPC 失败无任何反馈）。
 */
function handleDelete(tag: TagSummary): void {
  const { requestConfirm } = useDialogs()
  requestConfirm(
    '删除标签',
    `确定删除标签「${tag.name}」吗？\n\n会从所有素材上移除该标签，素材本身不受影响。此操作不可撤销。`,
    '删除',
    async () => {
      try {
        await window.api.tag.deleteTag(tag.id)
        await reload()
      } catch (error) {
        useToast().error('删除标签失败', { description: (error as Error).message })
      }
    }
  )
}

// —— F19：多选与批量操作（Eagle 4.0 标签管理） ——

const selectedTagIds = ref<Set<string>>(new Set())
const shiftAnchorIdx = ref(-1)
const batchColorOpen = ref(false)

function toggleTagSelect(
  node: TagNode,
  e: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
): void {
  const idx = visibleTags.value.findIndex((t) => t.id === node.id)
  if (e.shiftKey && shiftAnchorIdx.value >= 0 && idx >= 0) {
    const [a, b] = [Math.min(shiftAnchorIdx.value, idx), Math.max(shiftAnchorIdx.value, idx)]
    for (let i = a; i <= b; i++) selectedTagIds.value.add(visibleTags.value[i].id)
    return
  }
  shiftAnchorIdx.value = idx
  if (selectedTagIds.value.has(node.id)) selectedTagIds.value.delete(node.id)
  else selectedTagIds.value.add(node.id)
}

function clearTagSelection(): void {
  selectedTagIds.value = new Set()
  shiftAnchorIdx.value = -1
}

/** 合并：来源标签的素材关联并入目标，来源软删（Eagle 批量重命名语义） */
function handleMergeSelected(): void {
  const ids = [...selectedTagIds.value]
  if (ids.length < 2) {
    toast.info('请至少选择 2 个标签')
    return
  }
  const { requestPrompt } = useDialogs()
  requestPrompt({
    title: '合并标签',
    label: `把 ${ids.length} 个标签的素材关联合并到`,
    initialValue: '',
    confirmLabel: '合并',
    onSubmit: async (name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      try {
        const merged = await window.api.tag.mergeTags(ids, trimmed)
        if (!merged) {
          toast.error('合并失败', { description: '目标名称无效' })
          return
        }
        toast.success(`已合并 ${ids.length} 个标签为「${merged.name}」`)
        clearTagSelection()
        await reload()
      } catch (error) {
        toast.error('合并失败', { description: (error as Error).message })
      }
    }
  })
}

function handleBatchDelete(): void {
  const ids = [...selectedTagIds.value]
  if (ids.length === 0) return
  const { requestConfirm } = useDialogs()
  requestConfirm(
    '删除标签',
    `确定删除选中的 ${ids.length} 个标签吗？\n\n会从所有素材上移除这些标签，素材本身不受影响。此操作不可撤销。`,
    '全部删除',
    async () => {
      try {
        for (const id of ids) await window.api.tag.deleteTag(id)
        toast.success(`已删除 ${ids.length} 个标签`)
        clearTagSelection()
        await reload()
      } catch (error) {
        toast.error('删除标签失败', { description: (error as Error).message })
      }
    }
  )
}

async function handleBatchColor(color: string): Promise<void> {
  const ids = [...selectedTagIds.value]
  if (ids.length === 0) return
  batchColorOpen.value = false
  try {
    for (const id of ids) await window.api.tag.updateTag(id, { color })
    await reload()
  } catch (error) {
    toast.error('设置颜色失败', { description: (error as Error).message })
  }
}

onMounted(reload)
</script>
