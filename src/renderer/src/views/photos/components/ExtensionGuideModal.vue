<template>
  <UModal :model-value="true" size="md" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <AppIcon icon="ic_earth" />
        安装浏览器扩展（Chrome / Edge）
      </span>
    </template>

    <div class="space-y-4">
      <ol class="space-y-3 text-sm text-fg-secondary">
        <li class="flex gap-2.5">
          <span class="step-no">1</span>
          <span>
            Chrome 打开 <code class="rounded bg-surface-hover px-1">chrome://extensions</code>，
            右上角开启「开发者模式」
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="step-no">2</span>
          <span class="min-w-0 flex-1">
            点「加载已解压的扩展程序」，选择 Leaf 的扩展文件夹
            <code class="block truncate rounded bg-surface-hover px-1 py-0.5 text-xs" :title="extDir ?? ''">
              {{ extDir ?? '（未找到扩展目录，开发版运行 Leaf 后重试）' }}
            </code>
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="step-no">3</span>
          <span class="min-w-0 flex-1">
            点浏览器工具栏的 Leaf 图标 → 「设置」，粘贴连接信息：
            <code class="block truncate rounded bg-surface-hover px-1 py-0.5 text-xs">
              地址 http://127.0.0.1:{{ port ?? '—' }}
            </code>
          </span>
        </li>
      </ol>
      <p v-if="copyState" class="text-xs text-emerald-500">{{ copyState }}</p>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">关闭</UButton>
      <UButton variant="secondary" :disabled="!extDir" @click="reveal">在访达中显示</UButton>
      <UButton variant="primary" :disabled="!token" @click="copyToken">复制 Token</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import { useToast } from '@composables/useToast'

const emit = defineEmits<{ close: [] }>()
const toast = useToast()

const extDir = ref<string | null>(null)
const port = ref<number | null>(null)
const token = ref('')
const copyState = ref('')

onMounted(async () => {
  try {
    extDir.value = await window.api.system.getExtensionDir()
  } catch {
    extDir.value = null
  }
  try {
    const cfg = await window.api.photos.clipServer.getConfig()
    port.value = cfg.port
    token.value = cfg.token ?? ''
  } catch {
    /* 剪藏服务未就绪 */
  }
})

function reveal(): void {
  if (extDir.value) void window.api.photos.showInFolder(extDir.value)
}

async function copyToken(): Promise<void> {
  const ok = await window.api.photos.copyText(token.value)
  if (ok) {
    copyState.value = 'Token 已复制，粘贴到扩展设置即可'
    toast.success('Token 已复制')
  } else {
    toast.error('复制失败')
  }
}
</script>

<style scoped>
.step-no {
  display: flex;
  height: 20px;
  width: 20px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--color-brand-500, #3b82f6);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}
</style>
