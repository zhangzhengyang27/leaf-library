<template>
  <UModal :model-value="true" size="sm" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <AppIcon icon="ic_box" />
        相册
      </span>
    </template>

    <div class="space-y-3">
      <!-- 加入已有相册 -->
      <div v-if="albums.length > 0">
        <p class="mb-1.5 text-xs text-fg-muted">
          {{ selectedCount > 0 ? `把选中的 ${selectedCount} 张图片加入：` : '现有相册：' }}
        </p>
        <div class="max-h-48 space-y-1 overflow-y-auto app-scroll pr-1">
          <button
            v-for="album in albums"
            :key="album.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-left text-sm text-fg-primary transition-colors hover:border-brand-400 hover:bg-surface-hover"
            @click="handleAddTo(album.id)"
          >
            <AppIcon icon="ic_box" :size="14" class="shrink-0 text-fg-tertiary" />
            <span class="min-w-0 flex-1 truncate">{{ album.name }}</span>
            <span class="shrink-0 text-xs text-fg-muted">{{ album.photoCount }} 张</span>
          </button>
        </div>
      </div>
      <p v-else-if="selectedCount > 0" class="text-xs text-fg-muted">
        还没有相册，新建一个并加入选中的 {{ selectedCount }} 张图片：
      </p>

      <!-- 新建 -->
      <div class="flex gap-2">
        <input
          v-model="newName"
          type="text"
          placeholder="新建相册..."
          class="min-w-0 flex-1 h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
          @keyup.enter="handleCreate"
        />
        <UButton variant="primary" :disabled="!newName.trim()" @click="handleCreate">新建</UButton>
      </div>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">关闭</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import type { Album } from '../../../types/photo'
import { useToast } from '@composables/useToast'

const props = defineProps<{
  /** 选择模式下传入：加入/创建时自动带上选中图片 */
  photoIdsToAdd?: string[]
}>()

const emit = defineEmits<{
  close: []
  changed: []
}>()

const toast = useToast()
const albums = ref<Album[]>([])
const newName = ref('')

const selectedCount = props.photoIdsToAdd?.length ?? 0

async function reload(): Promise<void> {
  try {
    albums.value = await window.api.photos.listAlbums()
  } catch {
    albums.value = []
  }
}

async function handleAddTo(albumId: string): Promise<void> {
  if (selectedCount === 0) {
    emit('close')
    return
  }
  try {
    const added = await window.api.photos.addPhotosToAlbum(albumId, props.photoIdsToAdd!)
    toast.success(added > 0 ? `已加入 ${added} 张图片` : '所选图片已在该相册中')
    emit('changed')
    emit('close')
  } catch (error) {
    toast.error('加入相册失败', { description: (error as Error).message })
  }
}

async function handleCreate(): Promise<void> {
  const trimmed = newName.value.trim()
  if (!trimmed) return
  try {
    const album = await window.api.photos.createAlbum(trimmed)
    if (selectedCount > 0) {
      await window.api.photos.addPhotosToAlbum(album.id, props.photoIdsToAdd!)
      toast.success(`已创建「${trimmed}」并加入 ${selectedCount} 张图片`)
    } else {
      toast.success('相册已创建')
    }
    emit('changed')
    emit('close')
  } catch (error) {
    toast.error('创建失败', { description: (error as Error).message })
  }
}

onMounted(reload)
</script>
