<script setup lang="ts">
import { computed } from 'vue'

/**
 * USwitch · 开关
 */
interface Props {
  modelValue: boolean
  disabled?: boolean
  label?: string
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  label: '',
  size: 'md'
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const toggle = (): void => {
  if (!props.disabled) emit('update:modelValue', !props.modelValue)
}

const trackCls = computed(() => {
  const w = props.size === 'sm' ? 'w-8 h-[18px]' : 'w-10 h-6'
  const on = 'bg-brand-500'
  const off = 'bg-gray-300 dark:bg-gray-400'
  return [w, props.modelValue ? on : off]
})

const knobCls = computed(() => {
  const s = props.size === 'sm' ? 'size-3.5' : 'size-[20px]'
  const pos =
    props.size === 'sm'
      ? props.modelValue
        ? 'translate-x-[14px]'
        : 'translate-x-0.5'
      : props.modelValue
        ? 'translate-x-[18px]'
        : 'translate-x-0.5'
  return [s, pos]
})
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    class="inline-flex select-none items-center gap-2.5 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    @click="toggle"
  >
    <span
      class="relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-normal"
      :class="trackCls"
    >
      <span
        class="block rounded-full bg-white shadow-xs transition-transform duration-normal ease-out"
        :class="knobCls"
      />
    </span>
    <span v-if="label" class="text-sm text-fg-primary">{{ label }}</span>
  </button>
</template>
