<script setup lang="ts">
import { computed } from 'vue'

/**
 * UBadge · 徽标 / 状态点
 * - variant: brand / success / warning / danger / neutral
 * - dot: 只渲染状态点不带文字
 */
interface Props {
  variant?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral'
  dot?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral',
  dot: false
})

const cls = computed(() => {
  switch (props.variant) {
    case 'brand':
      return 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20'
    case 'success':
      return 'bg-success/10 text-success border-success/20'
    case 'warning':
      return 'bg-warning/10 text-warning border-warning/25'
    case 'danger':
      return 'bg-danger/10 text-danger border-danger/20'
    default:
      return 'bg-surface-hover text-fg-secondary border-line-default'
  }
})

const dotCls = computed(() => {
  switch (props.variant) {
    case 'brand':
      return 'bg-brand-500'
    case 'success':
      return 'bg-success'
    case 'warning':
      return 'bg-warning'
    case 'danger':
      return 'bg-danger'
    default:
      return 'bg-gray-400'
  }
})
</script>

<template>
  <span
    v-if="dot"
    class="inline-block size-2 shrink-0 rounded-full"
    :class="dotCls"
    aria-hidden="true"
  />
  <span
    v-else
    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none"
    :class="cls"
  >
    <slot />
  </span>
</template>
