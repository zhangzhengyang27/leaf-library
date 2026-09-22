<template>
  <UModal :model-value="true" size="md" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <AppIcon icon="context-menu/ic-tag-normal" />
        标签管理
      </span>
    </template>

    <div class="space-y-3">
      <!-- 新建 -->
      <div class="flex gap-2">
        <input
          v-model="newTagName"
          type="text"
          placeholder="新标签名称..."
          class="flex-1 h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
          @keyup.enter="handleCreate"
        />
        <select
          v-model="newTagParent"
          title="父标签（六期分组）"
          class="px-2 py-2 text-sm rounded-md border border-line-default bg-surface-1 text-fg-secondary"
        >
          <option value="">作为顶层</option>
          <option v-for="t in tags" :key="t.id" :value="t.id">属于「{{ t.name }}」</option>
        </select>
        <UButton size="sm" :loading="creating" @click="handleCreate">新建</UButton>
      </div>

      <!-- 列表 -->
      <div v-if="loading" class="py-8 text-center text-sm text-fg-muted">加载中...</div>
      <div v-else-if="tags.length === 0" class="py-8 text-center text-sm text-fg-muted">
        还没有标签
      </div>
      <div v-else class="max-h-80 space-y-1.5 overflow-y-auto app-scroll pr-1">
        <div
          v-for="node in orderedTags"
          :key="node.id"
          class="rounded-md border border-line-subtle bg-surface-1 px-2.5 py-2"
          :style="{ marginLeft: `${node.depth * 20}px` }"
        >
          <div class="flex items-center gap-2">
            <!-- 颜色 -->
            <div class="relative">
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
                  class="size-4 rounded-full hover:scale-125 transition-transform"
                  :style="{ backgroundColor: c }"
                  @click="handleSetColor(node, c)"
                />
              </div>
            </div>

            <!-- 名称（行内编辑） -->
            <template v-if="editingId === node.id">
              <input
                v-model="editingName"
                class="flex-1 px-2 py-1 text-sm rounded border border-brand-500 bg-surface-0 text-fg-primary focus:outline-none"
                @keyup.enter="handleRename(node)"
                @keyup.escape="editingId = null"
              />
              <UButton size="sm" variant="primary" @click="handleRename(node)">保存</UButton>
              <UButton size="sm" variant="ghost" @click="editingId = null">取消</UButton>
            </template>
            <template v-else>
              <span class="flex-1 truncate text-sm text-fg-primary">
                <span v-if="node.depth > 0" class="text-fg-muted">└ </span>{{ node.name }}
              </span>
              <span class="shrink-0 text-xs text-fg-muted">{{ node.usageCount ?? 0 }} 张</span>
              <!-- 六期：改父级 -->
              <select
                class="shrink-0 rounded border border-line-default bg-surface-1 px-1 py-0.5 text-[11px] text-fg-secondary"
                :value="node.parentId ?? ''"
                title="所属分组"
                @change="handleSetParent(node, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">顶层</option>
                <option v-for="t in tags" :key="t.id" :value="t.id" :disabled="t.id === node.id">
                  {{ t.name }}
                </option>
              </select>
              <UButton size="sm" variant="ghost" @click="startRename(node)">重命名</UButton>
              <UButton size="sm" variant="danger" @click="handleDelete(node)">删除</UButton>
            </template>
          </div>
        </div>
      </div>

      <p class="text-xs text-fg-muted">
        标签是全局字典：重命名/换色会同步到所有图片；删除标签会将其从所有图片上移除引用。
      </p>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">关闭</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import type { TagSummary } from '../../../types/photo'
import { useToast } from '@composables/useToast'
import { useDialogs } from '../../photos/composables/useDialogs'

const emit = defineEmits<{
  close: []
  changed: []
}>()

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

const tags = ref<TagSummary[]>([])
const loading = ref(true)
const newTagName = ref('')
const newTagParent = ref('')
const creating = ref(false)
const editingId = ref<string | null>(null)
const editingName = ref('')
const colorPickerFor = ref<string | null>(null)

/** 六期：树形序（父在前、子缩进；孤儿兜底平铺） */
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
    if (!listed.has(t.id)) out.push({ ...t, depth: 0 }) // 父丢失的孤儿
  }
  return out
})

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
    emit('changed')
  } catch (error) {
    toast.error('新建标签失败', { description: (error as Error).message })
  } finally {
    creating.value = false
  }
}

/** 六期：改父级（传 '' 清除；repo 侧有环检测，成环返回 undefined） */
async function handleSetParent(tag: TagSummary, parentId: string): Promise<void> {
  const updated = await window.api.tag.updateTag(tag.id, { parentId })
  if (!updated) {
    toast.error('设置分组失败', { description: '不能选择自己或自己的子标签作为父级' })
    await reload()
    return
  }
  await reload()
  emit('changed')
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
  emit('changed')
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
  emit('changed')
}

function toggleColorPicker(id: string): void {
  colorPickerFor.value = colorPickerFor.value === id ? null : id
}

async function handleDelete(tag: TagSummary): Promise<void> {
  // 删除会从全部素材移除该标签引用，属不可逆操作（审查 P3-47）：
  // 接确认弹窗 + 错误处理，旧实现直接 await 无任何把关
  const { requestConfirm } = useDialogs()
  requestConfirm(
    '删除标签',
    `确定删除标签「${tag.name}」吗？\n\n该标签将从所有图片中移除，且不可恢复。`,
    '删除',
    async () => {
      try {
        await window.api.tag.deleteTag(tag.id)
        await reload()
        emit('changed')
      } catch (error) {
        toast.error('删除失败', { description: (error as Error).message })
      }
    }
  )
}

onMounted(reload)
</script>
