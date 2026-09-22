<template>
  <UModal :model-value="true" size="sm" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <AppIcon icon="context-menu/ic-export" />
        转换为{{ FORMAT_LABEL[format] }}（{{ ids.length }} 项）
      </span>
    </template>

    <div class="space-y-4">
      <!-- 格式 -->
      <div>
        <p class="mb-1.5 text-xs text-fg-muted">目标格式</p>
        <div class="flex gap-1.5">
          <button
            v-for="f in FORMATS"
            :key="f"
            type="button"
            class="rounded-md border px-3 py-1 text-xs transition-colors"
            :class="
              format === f
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400'
            "
            @click="format = f"
          >
            {{ FORMAT_LABEL[f] }}
          </button>
        </div>
      </div>

      <!-- 质量 -->
      <div v-if="format !== 'png'">
        <div class="mb-1 flex items-center justify-between">
          <p class="text-xs text-fg-muted">质量</p>
          <span class="text-xs text-fg-secondary">{{ quality }}</span>
        </div>
        <input v-model.number="quality" type="range" min="1" max="100" class="w-full accent-brand-500" />
      </div>

      <!-- 最大宽度 -->
      <div>
        <label class="mb-1.5 block text-xs text-fg-muted">限制最大宽度（px，留空 = 保持原尺寸）</label>
        <input
          v-model.number="maxWidth"
          type="number"
          min="0"
          placeholder="不限制"
          class="h-8 w-40 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
        />
      </div>

      <p class="text-xs text-fg-muted">产物作为新素材入库（来源「转换」），原文件保持不动。</p>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">取消</UButton>
      <UButton variant="primary" :loading="converting" @click="handleConvert">
        转换 {{ ids.length }} 项
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import { usePhotoActions } from '../composables/usePhotoActions'

const props = defineProps<{
  /** 待转换素材 id（非图片/同格式在执行时自动跳过） */
  ids: string[]
}>()

const emit = defineEmits<{ close: [] }>()

type Fmt = 'webp' | 'png' | 'jpg' | 'avif'
const FORMATS: Fmt[] = ['webp', 'png', 'jpg', 'avif']
const FORMAT_LABEL: Record<Fmt, string> = { webp: 'WebP', png: 'PNG', jpg: 'JPG', avif: 'AVIF' }

const actions = usePhotoActions()
const format = ref<Fmt>('webp')
const quality = ref(82)
const maxWidth = ref<number | null>(null)
const converting = ref(false)

async function handleConvert(): Promise<void> {
  converting.value = true
  try {
    await actions.convertTo(props.ids, format.value, {
      quality: quality.value,
      maxWidth: maxWidth.value && maxWidth.value > 0 ? maxWidth.value : undefined
    })
    emit('close')
  } finally {
    converting.value = false
  }
}
</script>
