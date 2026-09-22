<script setup lang="ts">
import { computed } from 'vue'

/**
 * USkeleton · 骨架屏占位
 * - variant: line（文本行）/ circle（头像）/ rect（块）
 */
interface Props {
  variant?: 'line' | 'circle' | 'rect'
  /** line 时的宽度类（如 'w-40'） */
  w?: string
  /** rect 时的高度类 */
  h?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'line',
  w: 'w-full',
  h: 'h-16'
})

const cls = computed(() => {
  if (props.variant === 'circle') return 'size-9 rounded-full'
  if (props.variant === 'rect') return `${props.w} ${props.h} rounded-md`
  return `${props.w} h-3.5 rounded-full`
})
</script>

<template>
  <div
    class="animate-pulse bg-gradient-to-r from-[var(--app-route-loading-skeleton-a)] via-[var(--app-route-loading-skeleton-b)] to-[var(--app-route-loading-skeleton-a)]"
    :class="cls"
    aria-hidden="true"
  />
</template>
