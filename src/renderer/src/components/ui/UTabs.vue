<script setup lang="ts">
import { computed } from 'vue'

/**
 * UTabs · 分段式页签（Raycast 风：胶囊高亮）
 */
interface TabItem {
  key: string
  label: string
  icon?: string
  disabled?: boolean
}

interface Props {
  items: TabItem[]
  modelValue: string
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md'
})

const emit = defineEmits<{ 'update:modelValue': [key: string] }>()

const isActive = (key: string): boolean => props.modelValue === key

const btnCls = computed(() => (props.size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-3.5 text-sm'))
</script>

<template>
  <div
    class="inline-flex items-center gap-0.5 rounded-md border border-line-subtle bg-surface-1 p-0.5"
    role="tablist"
  >
    <button
      v-for="it in items"
      :key="it.key"
      type="button"
      role="tab"
      :aria-selected="isActive(it.key)"
      :disabled="it.disabled"
      class="inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-all duration-fast focus-visible:shadow-ring-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      :class="[
        btnCls,
        isActive(it.key)
          ? 'bg-surface-3 text-fg-primary shadow-xs'
          : 'text-fg-secondary hover:text-fg-primary'
      ]"
      @click="!it.disabled && emit('update:modelValue', it.key)"
    >
      <slot name="icon" :item="it" />
      {{ it.label }}
    </button>
  </div>
</template>
