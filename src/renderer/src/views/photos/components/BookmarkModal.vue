<template>
  <UModal :model-value="true" size="sm" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <span>🔗</span>
        收藏网址
      </span>
    </template>

    <div class="space-y-3">
      <div>
        <label class="mb-1 block text-xs text-fg-muted">URL</label>
        <input
          ref="urlInput"
          v-model="url"
          type="text"
          placeholder="https://example.com/article..."
          class="w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
          @keyup.enter="handleSave"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs text-fg-muted">标题（可选，默认抓取网页标题）</label>
        <input
          v-model="title"
          type="text"
          placeholder="留空自动抓取"
          class="w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
          @keyup.enter="handleSave"
        />
      </div>
      <!-- §2.A3 / §2.D7 书签内嵌预览 -->
      <div v-if="previewType !== 'none'">
        <label class="mb-1 block text-xs text-fg-muted">内嵌预览</label>
        <div
          class="aspect-video w-full overflow-hidden rounded-md border border-line-default bg-surface-hover"
        >
          <img v-if="previewType === 'image'" :src="url" class="size-full object-contain" alt="" />
          <video
            v-else-if="previewType === 'video'"
            :src="url"
            controls
            class="size-full object-contain"
          />
          <iframe
            v-else
            :src="url"
            class="size-full border-0"
            sandbox="allow-scripts"
            referrerpolicy="no-referrer"
          />
        </div>
      </div>
      <p class="text-xs text-fg-muted">
        收藏时会抓取网页标题并对页面截图存档；之后可在书签类型中筛选查看，预览页可一键打开原链接。
      </p>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">取消</UButton>
      <UButton variant="primary" :disabled="!url.trim()" :loading="saving" @click="handleSave">
        收藏
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import { useToast } from '@composables/useToast'

const emit = defineEmits<{
  close: []
  saved: []
}>()

const toast = useToast()
const url = ref('')
const title = ref('')
const saving = ref(false)
const urlInput = ref<HTMLInputElement | null>(null)

onMounted(() => urlInput.value?.focus())

/** §2.A3 / §2.D7 书签内嵌预览：按扩展名判断媒体类型，否则尝试网页嵌入 */
const previewType = computed<'image' | 'video' | 'page' | 'none'>(() => {
  const u = url.value.trim().toLowerCase()
  if (!/^https?:\/\//.test(u)) return 'none'
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/.test(u)) return 'image'
  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/.test(u)) return 'video'
  return 'page'
})

async function handleSave(): Promise<void> {
  const target = url.value.trim()
  if (!target) return
  saving.value = true
  try {
    await window.api.photos.addBookmark(target, title.value.trim() || undefined)
    toast.success('书签已收藏', { description: '页面截图与缩略图正在后台生成' })
    emit('saved')
    emit('close')
  } catch (error) {
    toast.error('收藏失败', { description: (error as Error).message })
  } finally {
    saving.value = false
  }
}
</script>
