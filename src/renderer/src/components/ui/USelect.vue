<script setup lang="ts">
/**
 * USelect · 下拉选择（原生 select 样式化，保证可访问性）
 */
interface Option {
  label: string
  value: string | number
  disabled?: boolean
}

interface Props {
  modelValue: string | number
  options: Option[]
  disabled?: boolean
  placeholder?: string
  label?: string
}

withDefaults(defineProps<Props>(), {
  disabled: false,
  placeholder: '',
  label: ''
})

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

const onChange = (e: Event): void => {
  const raw = (e.target as HTMLSelectElement).value
  // 还原为原始类型（number option 会被 DOM 转成 string）
  const hit = (e.target as HTMLSelectElement).selectedOptions[0]
  const v = hit?.dataset.value ?? raw
  const num = Number(v)
  emit('update:modelValue', v !== '' && !Number.isNaN(num) && /^\d+$/.test(v) ? num : v)
}
</script>

<template>
  <div class="flex w-full flex-col gap-1.5">
    <label v-if="label" class="text-xs font-medium text-fg-secondary">{{ label }}</label>
    <div class="relative flex h-8 items-center">
      <select
        :value="String(modelValue)"
        :disabled="disabled"
        class="h-full w-full appearance-none rounded-md border border-line-default bg-surface-1 px-3 pr-8 text-sm text-fg-primary transition-all duration-fast focus:outline-none focus-visible:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
        @change="onChange"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option
          v-for="opt in options"
          :key="opt.value"
          :value="String(opt.value)"
          :data-value="String(opt.value)"
          :disabled="opt.disabled"
        >
          {{ opt.label }}
        </option>
      </select>
      <svg
        class="pointer-events-none absolute right-3 size-4 text-fg-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
  </div>
</template>
