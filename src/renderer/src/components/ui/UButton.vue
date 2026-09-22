<script setup lang="ts">
import { computed } from 'vue'

/**
 * UButton · 统一按钮
 * - variant: primary（品牌实心）/ secondary（面板+描边）/ ghost（无底）/ danger（危险）
 * - size: sm / md / lg
 * - loading: 内联 spinner 并禁用点击
 */
interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  block?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  block: false
})

// click 一旦声明为 emit，Vue 就把父级的 @click 当组件事件、不再透传到根 button，
// 必须在这里手动 emit 回去——否则全仓 60+ 处 <UButton @click> 全部静默失效
const emit = defineEmits<{ click: [e: MouseEvent] }>()

const sizeCls = computed(() => {
  if (props.size === 'sm') return 'h-7 px-2.5 text-xs gap-1.5 rounded-sm'
  if (props.size === 'lg') return 'h-11 px-5 text-sm gap-2 rounded-md'
  return 'h-9 px-4 text-sm gap-2 rounded-md'
})

const variantCls = computed(() => {
  if (props.disabled || props.loading) {
    return 'opacity-50 cursor-not-allowed'
  }
  switch (props.variant) {
    case 'primary':
      return 'bg-brand-500 text-white shadow-xs hover:bg-brand-400 active:bg-brand-600 focus-visible:shadow-ring-focus'
    case 'ghost':
      return 'text-fg-secondary hover:bg-surface-hover hover:text-fg-primary active:bg-surface-active focus-visible:shadow-ring-focus'
    case 'danger':
      return 'bg-transparent text-danger border border-line-default hover:border-danger/40 hover:bg-danger/5 focus-visible:shadow-ring-danger'
    default:
      return 'bg-surface-1 text-fg-primary border border-line-default hover:border-line-strong hover:bg-surface-2 active:bg-surface-hover focus-visible:shadow-ring-focus'
  }
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-fast ease-out focus-visible:outline-none"
    :class="[sizeCls, variantCls, block ? 'w-full' : '']"
    @click="emit('click', $event)"
  >
    <svg
      v-if="loading"
      class="size-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    <slot />
  </button>
</template>
