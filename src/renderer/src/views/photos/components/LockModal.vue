<template>
  <UModal :model-value="true" size="sm" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <span>🔒</span>
        素材库密码
      </span>
    </template>

    <div class="space-y-3">
      <template v-if="!enabled">
        <div>
          <label class="mb-1 block text-xs text-fg-muted">设置密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="下次打开素材库需输入"
            class="w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-muted">确认密码</label>
          <input
            v-model="confirm"
            type="password"
            class="w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
            @keyup.enter="handleSet"
          />
        </div>
        <p class="text-xs text-fg-muted">
          密码经系统钥匙串（Keychain/DPAPI）加密存储；仅锁定素材库视图，不加密素材文件本身。
        </p>
      </template>
      <template v-else>
        <div>
          <label class="mb-1 block text-xs text-fg-muted">输入当前密码以移除密码锁</label>
          <input
            v-model="current"
            type="password"
            class="w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
            @keyup.enter="handleRemove"
          />
        </div>
        <div class="flex items-center gap-2">
          <UButton variant="primary" size="sm" @click="$emit('lock')">立即锁定</UButton>
          <UButton variant="danger" size="sm" :loading="busy" @click="handleRemove"
            >移除密码锁</UButton
          >
        </div>
      </template>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">关闭</UButton>
      <UButton
        v-if="!enabled"
        variant="primary"
        :disabled="!password || password !== confirm"
        :loading="busy"
        @click="handleSet"
      >
        启用
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import { useToast } from '@composables/useToast'

const emit = defineEmits<{
  close: []
  changed: []
  /** 已启用密码锁时请求立即锁定（宿主关弹窗并进入锁屏） */
  lock: []
}>()

const toast = useToast()
const enabled = ref(false)
const password = ref('')
const confirm = ref('')
const current = ref('')
const busy = ref(false)

onMounted(async () => {
  enabled.value = await window.api.photos.lockIsEnabled()
})

async function handleSet(): Promise<void> {
  if (!password.value || password.value !== confirm.value) return
  busy.value = true
  try {
    await window.api.photos.lockSetPassword(password.value)
    toast.success('密码锁已启用')
    emit('changed')
    emit('close')
  } catch (error) {
    toast.error('启用失败', { description: (error as Error).message })
  } finally {
    busy.value = false
  }
}

async function handleRemove(): Promise<void> {
  busy.value = true
  try {
    const ok = await window.api.photos.lockClear(current.value)
    if (!ok) {
      toast.error('密码不正确')
      return
    }
    toast.success('密码锁已移除')
    emit('changed')
    emit('close')
  } catch (error) {
    toast.error('移除失败', { description: (error as Error).message })
  } finally {
    busy.value = false
  }
}
</script>
