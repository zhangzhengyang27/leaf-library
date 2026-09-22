<template>
  <UModal :model-value="true" size="sm" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <AppIcon icon="ic_search" />
        相似查重设置
      </span>
    </template>

    <div class="space-y-4">
      <!-- 模式（Eagle 4：扫描相似图片 / 扫描相同文件） -->
      <div>
        <p class="mb-1.5 text-xs text-fg-muted">扫描模式</p>
        <div class="flex gap-1.5">
          <button
            v-for="m in MODES"
            :key="m.value"
            type="button"
            class="flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors"
            :class="
              mode === m.value
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400'
            "
            @click="mode = m.value"
          >
            {{ m.label }}
          </button>
        </div>
        <p class="mt-1 text-[11px] text-fg-muted">{{ modeHint }}</p>
      </div>

      <!-- 范围（Eagle 4：全部 / 当前列表 / 已选） -->
      <div>
        <p class="mb-1.5 text-xs text-fg-muted">扫描范围</p>
        <div class="flex gap-1.5">
          <button
            v-for="s in scopes"
            :key="s.value"
            type="button"
            :disabled="s.disabled"
            class="flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :class="
              scope === s.value
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400'
            "
            @click="scope = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">取消</UButton>
      <UButton variant="primary" @click="start">开始扫描</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import {
  useDuplicateScan,
  type DuplicateMode,
  type DuplicateScope
} from '../composables/useDuplicateScan'
import { usePhotoFilters } from '../composables/usePhotoFilters'
import { usePhotoSelection } from '../composables/usePhotoSelection'

const emit = defineEmits<{ close: [] }>()

const scan = useDuplicateScan()
const filters = usePhotoFilters()
const { selectedIds } = usePhotoSelection()

const MODES: Array<{ value: DuplicateMode; label: string }> = [
  { value: 'phash', label: '相似图片' },
  { value: 'hash', label: '相同文件' }
]

const mode = ref<DuplicateMode>('phash')
const scope = ref<DuplicateScope>('all')

const modeHint = computed(() =>
  mode.value === 'phash'
    ? '按感知哈希聚类，找出内容相近的图片（含缩放/压缩变体）'
    : '按文件 MD5 精确匹配，只找内容完全一致的文件'
)

const viewCount = computed(() => filters.flatDisplayPhotos.value.length)
const selectedCount = computed(() => selectedIds.value.length)

const scopes = computed(() => [
  { value: 'all' as DuplicateScope, label: '全部素材', disabled: false },
  {
    value: 'view' as DuplicateScope,
    label: `当前视图 (${viewCount.value})`,
    disabled: viewCount.value === 0
  },
  {
    value: 'selection' as DuplicateScope,
    label: `已选 (${selectedCount.value})`,
    disabled: selectedCount.value === 0
  }
])

function start(): void {
  // 范围 id 在当前视图下快照（弹窗由入口视图打开）
  const ids =
    scope.value === 'view'
      ? filters.flatDisplayPhotos.value.map((p) => p.id)
      : scope.value === 'selection'
        ? [...selectedIds.value]
        : undefined
  emit('close')
  void scan.runDuplicateScan(mode.value, scope.value, ids)
}
</script>
