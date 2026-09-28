<template>
  <UModal :model-value="true" size="sm" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <AppIcon icon="ic_folder-close" />
        文件夹
      </span>
    </template>

    <div class="space-y-3">
      <!-- 加入已有文件夹 -->
      <div v-if="folders.length > 0">
        <p class="mb-1.5 text-xs text-fg-muted">
          {{ selectedCount > 0 ? `把选中的 ${selectedCount} 项归入：` : '现有文件夹：' }}
        </p>
        <div class="max-h-48 space-y-1 overflow-y-auto app-scroll pr-1">
          <button
            v-for="folder in folders"
            :key="folder.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-left text-sm text-fg-primary transition-colors hover:border-brand-400 hover:bg-surface-hover"
            @click="handleAssign(folder.id)"
          >
            <AppIcon icon="ic_folder-close" :size="14" class="shrink-0 text-fg-tertiary" />
            <span class="min-w-0 flex-1 truncate">{{ folder.name }}</span>
            <span class="shrink-0 text-xs text-fg-muted">{{ folder.photoCount }}</span>
          </button>
        </div>
      </div>
      <p v-else class="text-xs text-fg-muted">
        还没有文件夹{{ selectedCount > 0 ? `，新建一个并归入选中的 ${selectedCount} 项：` : '。' }}
      </p>

      <!-- 新建 -->
      <div class="space-y-2">
        <label class="block text-xs text-fg-muted">父级文件夹</label>
        <select
          v-model="parentId"
          class="w-full rounded-md border border-line-default bg-surface-1 h-8 px-3 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
        >
          <option v-for="opt in folderOptions" :key="opt.id ?? 'none'" :value="opt.id">
            {{ ' '.repeat(opt.depth * 2) }}{{ opt.name }}
          </option>
        </select>
        <div class="flex gap-2">
          <input
            v-model="newName"
            type="text"
            placeholder="新建文件夹..."
            class="min-w-0 flex-1 h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
            @keyup.enter="handleCreate"
          />
          <UButton variant="primary" :disabled="!newName.trim()" @click="handleCreate">{{
            editFolderId ? '保存' : '新建'
          }}</UButton>
        </div>
      </div>

      <!-- 十二轮：独立视图设置（Eagle 新建/编辑文件夹对话框形态） -->
      <div class="border-t border-line-subtle pt-3">
        <p class="mb-2 text-xs font-medium text-fg-secondary">独立视图设置</p>
        <FolderViewSettings v-model="viewOverrides" />
      </div>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">关闭</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import FolderViewSettings, { type FolderViewOverrides } from './FolderViewSettings.vue'
import type { PhotoFolder } from '../../../types/photo'
import { useToast } from '@composables/useToast'

const props = defineProps<{
  /** 选择模式下传入：归组时带上选中项 */
  photoIdsToAdd?: string[]
  /** 三轮 G10：侧栏文件夹右键「新建文件夹…」预选的父级 */
  initialParent?: string | null
  /** 十二轮：编辑模式（打开文件夹设置…）——载入该文件夹的名称与视图覆盖 */
  editFolderId?: string
}>()

const emit = defineEmits<{
  close: []
  changed: []
}>()

const toast = useToast()
const folders = ref<PhotoFolder[]>([])
const newName = ref('')
/** §2.B 新建文件夹时可指定父级（多层级） */
const parentId = ref<string | null>(props.initialParent ?? null)
/** 十二轮：独立视图覆盖（新建默认全跟随全局；编辑模式载入已存值） */
const viewOverrides = ref<FolderViewOverrides>({ layout: 'global', sort: 'global', display: {} })
const editingFolder = ref<PhotoFolder | null>(null)

/** 覆盖 → 存储载荷（'global'/空 → null） */
function overridesToPayload(): {
  layout: string | null
  sort: string | null
  display: string | null
} {
  const d = viewOverrides.value.display
  const display: Record<string, boolean> = {}
  for (const [k, st] of Object.entries(d)) {
    if (st === 1) display[k] = true
    else if (st === 2) display[k] = false
  }
  const hasDisplay = Object.keys(display).length > 0
  return {
    layout: viewOverrides.value.layout === 'global' ? null : viewOverrides.value.layout,
    sort: viewOverrides.value.sort === 'global' ? null : viewOverrides.value.sort,
    display: hasDisplay ? JSON.stringify(display) : null
  }
}

/** 存储载荷 → 覆盖（编辑模式回填） */
function payloadToOverrides(f: PhotoFolder): FolderViewOverrides {
  const display: FolderViewOverrides['display'] = {}
  if (f.viewDisplay) {
    try {
      const parsed = JSON.parse(f.viewDisplay) as Record<string, boolean>
      for (const [k, on] of Object.entries(parsed)) display[k as keyof typeof display] = on ? 1 : 2
    } catch {
      /* 容错：坏 JSON 视为全全局 */
    }
  }
  return {
    layout: f.viewLayout ?? 'global',
    sort: f.viewSort ?? 'global',
    display
  }
}

const selectedCount = props.photoIdsToAdd?.length ?? 0

/** prop 是父层 selectedIds 直传的 reactive Proxy，IPC 结构化克隆不收 Proxy
 *  （原样 invoke 会抛「An object could not be cloned」）——落 IPC 前摊平 */
const idsToAdd = (): string[] => [...(props.photoIdsToAdd ?? [])]

/** 父级下拉（带缩进） */
const folderOptions = computed<Array<{ id: string | null; name: string; depth: number }>>(() => {
  const byParent = new Map<string | null, PhotoFolder[]>()
  for (const f of folders.value) {
    const k = f.parentId ?? null
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(f)
  }
  const out: Array<{ id: string | null; name: string; depth: number }> = [
    { id: null, name: '无（顶级）', depth: 0 }
  ]
  const walk = (pid: string | null, depth: number): void => {
    for (const f of byParent.get(pid) ?? []) {
      out.push({ id: f.id, name: f.name, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

async function reload(): Promise<void> {
  try {
    folders.value = await window.api.photos.listPhotoFolders()
  } catch {
    folders.value = []
  }
  if (props.editFolderId) {
    editingFolder.value = folders.value.find((f) => f.id === props.editFolderId) ?? null
    if (editingFolder.value) {
      newName.value = editingFolder.value.name
      parentId.value = editingFolder.value.parentId
      viewOverrides.value = payloadToOverrides(editingFolder.value)
    }
  }
}

async function handleAssign(folderId: string): Promise<void> {
  if (selectedCount === 0) {
    emit('close')
    return
  }
  try {
    const n = await window.api.photos.assignPhotosToFolder(folderId, idsToAdd())
    // 十五轮 D17/Eagle：「添加至上次使用的文件夹…」记住本次选择
    try {
      localStorage.setItem('leaf.last-used-folder', folderId)
    } catch {
      /* 忽略 */
    }
    toast.success(`已归入 ${n} 项`)
    emit('changed')
    emit('close')
  } catch (error) {
    toast.error('归组失败', { description: (error as Error).message })
  }
}

async function handleCreate(): Promise<void> {
  const trimmed = newName.value.trim()
  if (!trimmed) return
  // 十二轮：编辑模式——保存名称（若有变化）+ 视图覆盖
  if (props.editFolderId) {
    try {
      if (editingFolder.value && trimmed !== editingFolder.value.name) {
        await window.api.photos.renamePhotoFolder(props.editFolderId, trimmed)
      }
      await window.api.photos.setFolderViewSettings(props.editFolderId, overridesToPayload())
      toast.success('文件夹设置已保存')
      emit('changed')
      emit('close')
    } catch (error) {
      toast.error('保存失败', { description: (error as Error).message })
    }
    return
  }
  try {
    const folder = await window.api.photos.createPhotoFolder(trimmed, parentId.value)
    await window.api.photos.setFolderViewSettings(folder.id, overridesToPayload())
    if (selectedCount > 0) {
      await window.api.photos.assignPhotosToFolder(folder.id, idsToAdd())
      // 十五轮：记住上次使用的文件夹
      try {
        localStorage.setItem('leaf.last-used-folder', folder.id)
      } catch {
        /* 忽略 */
      }
      toast.success(`已创建「${trimmed}」并归入 ${selectedCount} 项`)
    } else {
      toast.success('文件夹已创建')
    }
    emit('changed')
    emit('close')
  } catch (error) {
    toast.error('创建失败', { description: (error as Error).message })
  }
}

onMounted(reload)
</script>
