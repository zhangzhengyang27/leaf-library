<script setup lang="ts">
/**
 * UPromptModal · 单输入小模态（D-008）
 * 替代散落的 window.prompt；状态源 useDialogs().pendingPrompt。
 */
import { nextTick, ref, watch } from 'vue'
import UModal from './UModal.vue'
import UButton from './UButton.vue'
import { useDialogs } from '../../views/photos/composables/useDialogs'
import { useToast } from '@composables/useToast'

const { pendingPrompt, requestPrompt } = useDialogs()

const inputRef = ref<HTMLInputElement | null>(null)
const value = ref('')
const submitting = ref(false)

watch(pendingPrompt, async (req) => {
  if (req) {
    value.value = req.initialValue
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  }
})

async function submit(): Promise<void> {
  const req = pendingPrompt.value
  if (!req || submitting.value) return
  submitting.value = true
  try {
    await req.onSubmit(value.value)
    pendingPrompt.value = null
  } catch (error) {
    // 统一兜底（审查 P2-15）：调用方未自带 try/catch 时，IPC 失败曾导致
    // unhandled rejection 且弹窗永久卡在打开态。保留弹窗让用户可重试/取消
    useToast().error('操作失败', { description: (error as Error).message })
  } finally {
    submitting.value = false
  }
}

function cancel(): void {
  pendingPrompt.value = null
}

void requestPrompt
</script>

<template>
  <UModal :model-value="pendingPrompt !== null" size="sm" :overlay-z="1050" @update:model-value="cancel">
    <template #title>
      <h3 class="text-sm font-semibold text-fg-primary">{{ pendingPrompt?.title }}</h3>
    </template>
    <div class="flex flex-col gap-2">
      <label class="text-xs text-fg-secondary">{{ pendingPrompt?.label }}</label>
      <input
        ref="inputRef"
        v-model="value"
        type="text"
        class="rounded-md border border-line-default bg-surface-1 h-8 px-3 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
        @keydown.enter.prevent="submit"
      />
    </div>
    <template #footer>
      <UButton variant="ghost" @click="cancel">取消</UButton>
      <UButton variant="primary" :loading="submitting" @click="submit">
        {{ pendingPrompt?.confirmLabel }}
      </UButton>
    </template>
  </UModal>
</template>
