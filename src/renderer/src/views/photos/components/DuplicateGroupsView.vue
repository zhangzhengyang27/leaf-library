<template>
  <div class="p-5 space-y-4">
    <!-- F5：本次扫描参数徽标 + 重新设置入口 -->
    <div
      v-if="scanLabel"
      class="flex items-center gap-3 rounded-md border border-line-subtle bg-surface-1 px-3 py-2 text-xs"
    >
      <span class="text-fg-secondary">扫描范围：{{ scanLabel }}</span>
      <button
        class="text-brand-600 underline-offset-2 hover:underline"
        @click="$emit('open-scan-settings')"
      >
        更改…
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex justify-center items-center py-20">
      <div class="text-gray-500">正在扫描相似图片...</div>
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="groups.length === 0"
      class="flex flex-col justify-center items-center py-20 text-gray-500"
    >
      <div class="text-6xl mb-4">✨</div>
      <div class="text-xl mb-2">没有发现相似/重复图片</div>
      <div class="text-sm">感知哈希距离 ≤ {{ threshold }} 的图片会被归为一组</div>
    </div>

    <!-- 分组列表 -->
    <div v-else class="space-y-4">
      <div
        v-for="(group, gi) in groups"
        :key="gi"
        class="rounded-xl border border-gray-200 bg-white overflow-hidden"
      >
        <div class="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <span class="text-sm font-semibold text-gray-700">
            第 {{ gi + 1 }} 组 · {{ group.photos.length }} 张相似
          </span>
          <span class="text-xs text-gray-400">推荐保留分辨率/大小最大的一张</span>
          <div class="flex-1" />
          <button
            class="px-3 py-1.5 rounded-md bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
            @click="$emit('remove-others', group)"
          >
            移除其余 {{ group.photos.length - 1 }} 张
          </button>
        </div>

        <div class="flex gap-3 p-4 overflow-x-auto">
          <div v-for="photo in group.photos" :key="photo.id" class="relative shrink-0 w-36">
            <div
              class="aspect-square rounded-lg overflow-hidden bg-gray-200 cursor-pointer"
              @click="$emit('preview-photo', photo)"
            >
              <img
                :src="`thumb://256/${photo.id}`"
                :alt="photo.fileName"
                class="w-full h-full object-cover"
                loading="lazy"
                @error="handleImageError"
              />
            </div>
            <div
              v-if="photo.id === group.keepId"
              class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-green-500 text-white text-[10px] font-medium"
            >
              保留
            </div>
            <p class="mt-1 text-xs text-gray-600 truncate" :title="photo.fileName">
              {{ photo.fileName }}
            </p>
            <p class="text-[10px] text-gray-400">{{ formatSize(photo.fileSize) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Photo } from '../../../types/photo'

export interface DuplicateGroup {
  photos: Photo[]
  /** 推荐保留的一张（分辨率 × 文件大小最优） */
  keepId: string
}

defineProps<{
  groups: DuplicateGroup[]
  loading: boolean
  threshold: number
  /** F5：本次扫描参数标签（如「相似图片 · 全部素材」） */
  scanLabel?: string
}>()

defineEmits<{
  'remove-others': [group: DuplicateGroup]
  'preview-photo': [photo: Photo]
  /** F5：重新打开扫描设置 */
  'open-scan-settings': []
}>()

const handleImageError = (event: Event): void => {
  const img = event.target as HTMLImageElement
  img.src =
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3C/svg%3E'
}

const formatSize = (bytes: number): string => {
  if (!bytes) return ''
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}
</script>
