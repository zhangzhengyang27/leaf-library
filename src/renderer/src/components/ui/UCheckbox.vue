<script setup lang="ts">
/**
 * UCheckbox · 复选框
 */
interface Props {
  modelValue: boolean
  disabled?: boolean
  label?: string
}

withDefaults(defineProps<Props>(), {
  disabled: false,
  label: ''
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label
    class="inline-flex select-none cursor-pointer items-center gap-2 text-sm text-fg-primary"
    :class="disabled ? 'cursor-not-allowed opacity-50' : ''"
  >
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      class="peer sr-only"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span
      class="flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-line-strong bg-surface-1 transition-all duration-fast peer-focus-visible:shadow-ring-focus peer-checked:border-brand-500 peer-checked:bg-brand-500"
    >
      <svg
        class="size-3 text-white opacity-0 transition-opacity"
        :class="modelValue ? 'opacity-100' : ''"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      >
        <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span v-if="label">{{ label }}</span>
  </label>
</template>
