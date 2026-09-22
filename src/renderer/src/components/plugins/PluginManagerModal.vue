<script setup lang="ts">
/**
 * PluginManagerModal · 插件管理（阶段 5.1 MVP）
 *
 * 已安装插件列表（分类徽标 / 版本 / 入口）；自定义插件目录（选择/清除）；
 * 提供格式类插件的扩展名展示。插件运行在 PluginSandbox 沙箱。
 */
import { onMounted, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UBadge from '@components/ui/UBadge.vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import { useToast } from '@composables/useToast'
import type { InstalledPlugin } from '@renderer/types/plugin'
import { PLUGIN_CATEGORY_LABELS } from '@renderer/types/plugin'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const plugins = ref<InstalledPlugin[]>([])
const extraDir = ref('')
const loading = ref(false)

// —— 插件市场（内置插件一键安装） ——
const marketTab = ref(false)
const builtin = ref<InstalledPlugin[]>([])
const marketLoading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    plugins.value = await window.api.plugins.list()
    extraDir.value = await window.api.plugins.getExtraDir()
  } catch (error) {
    useToast().error('插件列表加载失败', { description: (error as Error).message })
  } finally {
    loading.value = false
  }
}

async function loadMarket(): Promise<void> {
  marketLoading.value = true
  try {
    builtin.value = await window.api.plugins.listBuiltin()
  } catch (error) {
    useToast().error('插件市场加载失败', { description: (error as Error).message })
  } finally {
    marketLoading.value = false
  }
}

const installingId = ref<string | null>(null)

async function installBuiltin(id: string): Promise<void> {
  // pending 防重（审查 P3-61）：await 期间 plugins 未刷新，isInstalled 仍为
  // false，双击会重复安装
  if (installingId.value) return
  installingId.value = id
  try {
    const res = await window.api.plugins.installBuiltin(id)
    if (res.ok) {
      useToast().success('插件已安装')
      await load()
    } else {
      useToast().error('安装失败', { description: res.error || '未知错误' })
    }
  } catch (error) {
    useToast().error('安装失败', { description: (error as Error).message })
  } finally {
    installingId.value = null
  }
}

function showMarket(): void {
  marketTab.value = true
  void loadMarket()
}

function isInstalled(id: string): boolean {
  return plugins.value.some((p) => p.id === id)
}

async function pickExtraDir(): Promise<void> {
  try {
    const list = await window.api.plugins.pickExtraDir()
    if (list) {
      plugins.value = list as InstalledPlugin[]
      extraDir.value = await window.api.plugins.getExtraDir()
      useToast().success('已加载自定义插件目录')
    }
  } catch (error) {
    useToast().error('选择插件目录失败', { description: (error as Error).message })
  }
}

async function clearExtraDir(): Promise<void> {
  try {
    await window.api.plugins.setExtraDir('')
    await load()
    useToast().success('已恢复默认插件目录')
  } catch (error) {
    useToast().error('恢复默认目录失败', { description: (error as Error).message })
  }
}

onMounted(load)
</script>

<template>
  <UModal
    :model-value="props.modelValue"
    title="插件"
    size="md"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="flex flex-col gap-3 p-4">
      <div class="flex gap-1 rounded-md bg-surface-hover p-0.5">
        <button
          type="button"
          class="flex-1 rounded px-3 py-1 text-xs transition-colors"
          :class="
            !marketTab
              ? 'bg-surface-1 text-fg-primary shadow-sm'
              : 'text-fg-muted hover:text-fg-secondary'
          "
          @click="marketTab = false"
        >
          已安装
        </button>
        <button
          type="button"
          class="flex-1 rounded px-3 py-1 text-xs transition-colors"
          :class="
            marketTab
              ? 'bg-surface-1 text-fg-primary shadow-sm'
              : 'text-fg-muted hover:text-fg-secondary'
          "
          @click="showMarket"
        >
          插件市场
        </button>
      </div>

      <template v-if="!marketTab">
        <div class="flex items-center justify-between">
          <span class="text-xs text-fg-tertiary">
            已安装 {{ plugins.length }} 个插件（本地目录加载，沙箱运行）
          </span>
          <UButton size="sm" variant="ghost" :loading="loading" @click="load">刷新</UButton>
        </div>

        <div
          v-if="plugins.length === 0"
          class="rounded-md border border-dashed border-line-subtle px-4 py-8 text-center"
        >
          <div class="text-2xl mb-2">🧩</div>
          <p class="text-xs text-fg-secondary">还没有插件</p>
          <p class="mt-1 text-[11px] text-fg-muted">
            将插件目录放入
            <code class="rounded bg-surface-hover px-1">userData/plugins/</code> 或添加自定义目录
          </p>
        </div>

        <div v-else class="flex max-h-72 flex-col gap-2 overflow-y-auto">
          <div
            v-for="p in plugins"
            :key="p.id"
            class="flex items-center gap-2 rounded-md border border-line-subtle bg-surface-0 px-3 py-2"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium text-fg-primary">{{ p.name }}</span>
              <span class="mt-0.5 block truncate text-[10px] text-fg-muted"
                >{{ p.id }} · v{{ p.version }}</span
              >
              <span v-if="p.formats.length > 0" class="mt-0.5 block text-[10px] text-fg-tertiary">
                支持格式：{{ p.formats.map((f) => `.${f}`).join(' ') }}
              </span>
            </span>
            <UBadge variant="neutral">{{
              PLUGIN_CATEGORY_LABELS[p.category] ?? p.category
            }}</UBadge>
          </div>
        </div>

        <!-- 自定义目录 -->
        <div class="rounded-md border border-line-subtle bg-surface-0 p-3">
          <p class="mb-1 text-xs font-medium text-fg-primary">开发者选项 · 自定义插件目录</p>
          <p v-if="extraDir" class="mb-2 truncate text-[11px] text-fg-tertiary" :title="extraDir">
            {{ extraDir }}
          </p>
          <div class="flex gap-2">
            <UButton size="sm" variant="secondary" @click="pickExtraDir">选择目录</UButton>
            <UButton v-if="extraDir" size="sm" variant="ghost" @click="clearExtraDir"
              >恢复默认</UButton
            >
          </div>
          <p class="mt-2 flex items-center gap-1 text-[10px] text-fg-muted">
            <AppIcon icon="context-menu/ic-privacy" :size="12" />
            插件运行在隔离沙箱中，仅可读取注入的素材数据，无法访问系统
          </p>
        </div>
      </template>

      <!-- 插件市场 -->
      <template v-else>
        <div class="flex items-center justify-between">
          <span class="text-xs text-fg-tertiary">内置插件，点击安装即复制到 userData/plugins/</span>
          <UButton size="sm" variant="ghost" :loading="marketLoading" @click="loadMarket">
            刷新
          </UButton>
        </div>
        <div
          v-if="builtin.length === 0"
          class="rounded-md border border-dashed border-line-subtle px-4 py-8 text-center"
        >
          <div class="text-2xl mb-2">🧩</div>
          <p class="text-xs text-fg-secondary">暂无内置插件</p>
        </div>
        <div v-else class="flex max-h-72 flex-col gap-2 overflow-y-auto">
          <div
            v-for="p in builtin"
            :key="p.id"
            class="flex items-center gap-2 rounded-md border border-line-subtle bg-surface-0 px-3 py-2"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium text-fg-primary">{{ p.name }}</span>
              <span class="mt-0.5 block text-[10px] text-fg-muted">v{{ p.version }}</span>
              <span v-if="p.formats.length > 0" class="mt-0.5 block text-[10px] text-fg-tertiary">
                支持格式：{{ p.formats.map((f) => `.${f}`).join(' ') }}
              </span>
            </span>
            <UBadge variant="neutral">{{
              PLUGIN_CATEGORY_LABELS[p.category] ?? p.category
            }}</UBadge>
            <UButton
              size="sm"
              variant="primary"
              :disabled="isInstalled(p.id) || installingId === p.id"
              @click="installBuiltin(p.id)"
            >
              {{ isInstalled(p.id) ? '已安装' : '安装' }}
            </UButton>
          </div>
        </div>
      </template>
    </div>
  </UModal>
</template>
