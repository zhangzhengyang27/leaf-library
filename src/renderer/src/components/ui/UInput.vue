<script setup lang="ts">
import { computed } from 'vue'

/**
 * UInput · 统一输入框
 * - 支持 v-model、label、error、前后置插槽（prefix/suffix）
 */
interface Props {
  modelValue?: string
  type?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  label?: string
  error?: string
  /** 输入框内前缀区域（图标等） */
  clearable?: boolean
  autofocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  type: 'text',
  placeholder: '',
  disabled: false,
  readonly: false,
  label: '',
  error: '',
  clearable: false,
  autofocus: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  enter: []
  blur: [e: FocusEvent]
  focus: [e: FocusEvent]
}>()

const onInput = (e: Event): void => {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

const clear = (): void => {
  emit('update:modelValue', '')
}

const showClear = computed(() => props.clearable && !props.disabled && props.modelValue.length > 0)
</script>

<template>
  <div class="flex w-full flex-col gap-1.5">
    <label v-if="label" class="text-xs font-medium text-fg-secondary">{{ label }}</label>
    <div
      class="group relative flex h-8 items-center gap-2 rounded-md border bg-surface-1 px-3 transition-all duration-fast"
      :class="error ? 'border-danger/50' : 'border-line-default focus-within:border-brand-500'"
    >
      <div v-if="$slots.prefix" class="shrink-0 text-fg-muted">
        <slot name="prefix" />
      </div>
      <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :autofocus="autofocus"
        class="h-full w-full min-w-0 border-0 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        @input="onInput"
        @keydown.enter="emit('enter')"
        @blur="emit('blur', $event)"
        @focus="emit('focus', $event)"
      />
      <button
        v-if="showClear"
        type="button"
        class="shrink-0 text-fg-muted transition-colors hover:text-fg-primary"
        aria-label="清空"
        @click="clear"
      >
        <svg
          class="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" />
        </svg>
      </button>
      <div v-if="$slots.suffix" class="shrink-0 text-fg-muted">
        <slot name="suffix" />
      </div>
    </div>
    <p v-if="error" class="text-xs text-danger">{{ error }}</p>
  </div>
</template>
