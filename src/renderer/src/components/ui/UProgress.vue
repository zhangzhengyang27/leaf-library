<script setup lang="ts">
import { computed } from 'vue'

/**
 * UProgress · 进度条
 * - value 0-100；不传 value 时为不定态（indeterminate）流光
 * - variant: brand / success / danger
 */
interface Props {
  value?: number
  variant?: 'brand' | 'success' | 'danger'
  /** 显示在条下方的说明文字 */
  hint?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'brand',
  hint: ''
})

const indeterminate = computed(() => props.value === undefined || props.value === null)
const pct = computed(() => Math.min(100, Math.max(0, props.value ?? 0)))

const barCls = computed(() => {
  switch (props.variant) {
    case 'success':
      return 'bg-success'
    case 'danger':
      return 'bg-danger'
    default:
      return 'bg-brand-500'
  }
})
</script>

<template>
  <div class="flex w-full flex-col gap-1.5">
    <div
      class="h-1.5 w-full overflow-hidden rounded-full bg-surface-active"
      role="progressbar"
      :aria-valuenow="indeterminate ? undefined : Math.round(pct)"
    >
      <div
        v-if="!indeterminate"
        class="h-full rounded-full transition-[width] duration-slow ease-out"
        :class="barCls"
        :style="{ width: `${pct}%` }"
      />
      <div v-else class="u-progress-indeterminate h-full w-1/3 rounded-full" :class="barCls" />
    </div>
    <p v-if="hint" class="text-xs text-fg-muted">{{ hint }}</p>
  </div>
</template>

<style scoped>
.u-progress-indeterminate {
  animation: u-progress-slide 1.2s ease-in-out infinite;
}
@keyframes u-progress-slide {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(420%);
  }
}
</style>
