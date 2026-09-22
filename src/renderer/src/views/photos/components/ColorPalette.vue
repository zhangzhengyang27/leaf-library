<script setup lang="ts">
/**
 * ColorPalette · 色相桶色票面板（§3 L3）
 *
 * 复用 utils/photoColor 的 HUE_BUCKETS，支持单点选中（再次点击取消）；
 * 既用于工具栏筛选弹出，也用于属性面板标记主色。
 */
import { HUE_BUCKETS, type HueBucket } from '@utils/photoColor'

const props = defineProps<{
  modelValue: HueBucket | null
  /** 是否显示「全部」清除项 */
  showClear?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: HueBucket | null]
}>()

function pick(key: HueBucket): void {
  emit('update:modelValue', props.modelValue === key ? null : key)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <button
      v-if="showClear"
      type="button"
      class="flex size-5 items-center justify-center rounded-full border text-[10px] transition-transform duration-fast hover:scale-110"
      :class="
        !modelValue
          ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
          : 'border-line-default text-fg-muted'
      "
      title="清除主色筛选"
      @click="emit('update:modelValue', null)"
    >
      ✕
    </button>
    <button
      v-for="bucket in HUE_BUCKETS"
      :key="bucket.key"
      type="button"
      class="size-5 rounded-full border transition-transform duration-fast hover:scale-125"
      :class="
        modelValue === bucket.key
          ? 'border-brand-500 ring-2 ring-brand-500/40'
          : 'border-line-default'
      "
      :style="{ backgroundColor: bucket.css }"
      :title="bucket.label"
      @click="pick(bucket.key)"
    />
  </div>
</template>
