<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { isEscTop, popEscScope, pushEscScope } from '@renderer/utils/escStack'

/**
 * UDrawer · 侧滑抽屉（右侧，详情面板 / 表单）
 */
interface Props {
  modelValue: boolean
  title?: string
  width?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  width: '420px'
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const close = (): void => emit('update:modelValue', false)

let escScope: symbol | null = null
const onKeydown = (e: KeyboardEvent): void => {
  // 层级裁决（审查 P2-34）：只有栈顶浮层响应 Esc
  if (e.key === 'Escape' && props.modelValue && escScope && isEscTop(escScope)) {
    e.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  if (escScope) popEscScope(escScope)
  escScope = null
})

watch(
  () => props.modelValue,
  (open) => {
    // 旧实现此处是空 watch 且注释宣称修复了「首帧闪现全宽」（实际未做，
    // 审查 P3-66）；改为按打开/关闭维护 Esc 栈
    if (open && !escScope) escScope = pushEscScope()
    else if (!open && escScope) {
      popEscScope(escScope)
      escScope = null
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="udrawer">
      <div v-if="modelValue" class="fixed inset-0 z-[1000]">
        <div class="absolute inset-0 bg-overlay backdrop-blur-[2px]" @click="close" />
        <aside
          role="dialog"
          aria-modal="true"
          class="absolute inset-y-0 right-0 flex flex-col border-l border-line-default bg-surface-1 shadow-lg"
          :style="{ width }"
