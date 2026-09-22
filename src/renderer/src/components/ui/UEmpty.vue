<script setup lang="ts">
/**
 * UEmpty · 统一空状态
 * 通过 #icon 插槽放图标，#action 放操作按钮
 */
interface Props {
  title?: string
  description?: string
}

withDefaults(defineProps<Props>(), {
  title: '空空如也',
  description: ''
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
    <div
      v-if="$slots.icon"
      class="mb-1 flex size-12 items-center justify-center rounded-full bg-surface-hover text-fg-muted"
    >
      <slot name="icon" />
    </div>
    <p class="text-sm font-medium text-fg-secondary">{{ title }}</p>
    <p v-if="description" class="max-w-72 text-xs text-fg-muted">{{ description }}</p>
    <div v-if="$slots.action" class="mt-3">
      <slot name="action" />
    </div>
  </div>
</template>
