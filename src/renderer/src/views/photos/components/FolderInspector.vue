<script setup lang="ts">
/**
 * FolderInspector · 文件夹检查器（D-012 二轮 R4，对齐 Eagle 实测）
 *
 * 选中文件夹视图且无选中素材时右停靠：名称/描述（就地编辑）、
 * 基本信息（文件数/文件大小/添加日期）、密码保护（设置/移除）、导出文件夹。
 */
import { computed, ref, watch } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import type { PhotoFolder } from '../../../types/photo'
import { useToast } from '@composables/useToast'

const props = defineProps<{ folder: PhotoFolder }>()

const emit = defineEmits<{
  close: []
  changed: []
  /** 十二轮：打开文件夹设置（独立视图设置编辑） */
  'open-settings': []
}>()

const toast = useToast()

const name = ref(props.folder.name)
const description = ref(props.folder.description ?? '')
const hasPassword = ref(!!props.folder.hasPassword)
const photoCount = ref(props.folder.photoCount)
const totalSize = ref(0)

let sizeTimer: number | undefined
watch(
  () => props.folder.id,
  () => {
    name.value = props.folder.name
    description.value = props.folder.description ?? ''
    hasPassword.value = !!props.folder.hasPassword
    void loadStats()
  },
  { immediate: true }
)

async function loadStats(): Promise<void> {
  const fid = props.folder.id
  try {
    const photos = await window.api.photos.getFolderPhotos(fid)
    // 序号守卫（审查 P3-46）：快速切换文件夹时旧响应不得覆盖新夹统计
    if (props.folder.id !== fid) return
    photoCount.value = photos.length
    totalSize.value = photos.reduce((n, p) => n + (p.fileSize || 0), 0)
  } catch {
    /* ignore */
  }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate()
  ).padStart(
    2,
    '0'
  )} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const addedAt = computed(() => fmtDate(props.folder.createdAt))

const nameDirty = computed(() => name.value.trim() !== props.folder.name && name.value.trim())
const descDirty = computed(
  () =>
    (description.value.trim() || props.folder.description) &&
    description.value !== (props.folder.description ?? '')
)

async function saveName(): Promise<void> {
  const next = name.value.trim()
  if (!next || next === props.folder.name) return
  const ok = await window.api.photos.renamePhotoFolder(props.folder.id, next)
  if (ok) {
    toast.success('已重命名文件夹', { description: next })
    emit('changed')
  } else {
    toast.error('重命名失败', { description: '可能已存在同名文件夹' })
    name.value = props.folder.name
  }
}

async function saveDescription(): Promise<void> {
  if (!descDirty.value) return
  try {
    await window.api.photos.setFolderDescription(props.folder.id, description.value)
    toast.success('描述已保存')
    emit('changed')
  } catch (error) {
    toast.error('保存失败', { description: (error as Error).message })
  }
}

const passwordPromptOpen = ref(false)
const passwordInput = ref('')
async function setPassword(): Promise<void> {
  const pw = passwordInput.value
  if (!pw) return
  try {
    await window.api.photos.setFolderPassword(props.folder.id, pw)
    hasPassword.value = true
    passwordPromptOpen.value = false
    passwordInput.value = ''
    toast.success('文件夹密码已设置', { description: '打开该文件夹需输入密码' })
    emit('changed')
  } catch (error) {
    toast.error('设置失败', { description: (error as Error).message })
  }
}

const removePromptOpen = ref(false)
const removeInput = ref('')
async function removePassword(): Promise<void> {
  try {
    const ok = await window.api.photos.removeFolderPassword(props.folder.id, removeInput.value)
    if (ok) {
      hasPassword.value = false
      removePromptOpen.value = false
      removeInput.value = ''
      toast.success('已移除文件夹密码')
      emit('changed')
    } else {
      toast.error('密码错误，移除失败')
    }
  } catch (error) {
    toast.error('移除失败', { description: (error as Error).message })
  }
}

async function handleExport(): Promise<void> {
  try {
    const n = await window.api.photos.exportFolder(props.folder.id)
    toast.success(`已导出 ${n} 个文件`, { description: '见所选目录' })
  } catch (error) {
    toast.error('导出失败', { description: (error as Error).message })
  }
}
</script>

<template>
  <aside
    class="flex h-full w-[var(--shell-inspector-w)] shrink-0 flex-col border-l border-line-default bg-surface-1 animate-in slide-in-right duration-150"
  >
    <header class="flex items-center justify-between border-b border-line-default px-3 py-2">
      <h3 class="text-xs font-semibold text-fg-secondary">文件夹</h3>
      <div class="flex items-center gap-0.5">
        <!-- 十二轮：打开文件夹设置（Eagle 空白区右键同款） -->
        <button
          type="button"
          class="flex size-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary"
          aria-label="文件夹设置"
          title="文件夹设置"
          @click="emit('open-settings')"
        >
          <AppIcon icon="ic_cog" />
        </button>
        <button
          type="button"
          class="flex size-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary"
          aria-label="关闭"
          @click="$emit('close')"
        >
          <AppIcon icon="ic-modal-close" />
        </button>
      </div>
    </header>

    <div class="app-scroll min-h-0 flex-1 overflow-y-auto p-3">
      <!-- 名称 -->
      <label class="mb-1 block text-xs text-fg-muted">名称</label>
      <input
        v-model="name"
        type="text"
        class="mb-2 h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
        @keyup.enter="saveName"
        @blur="saveName"
      />

      <!-- 描述 -->
      <label class="mb-1 block text-xs text-fg-muted">描述</label>
      <textarea
        v-model="description"
        rows="2"
        placeholder="描述"
        class="mb-2 w-full rounded-md border border-line-default bg-surface-1 px-2 py-1.5 text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-brand-500"
        @blur="saveDescription"
      />

      <!-- 基本信息（二十四轮对齐 Eagle：占用空间 + 密码保护并入本组，右侧「设置」链接） -->
      <p class="mb-1 mt-3 text-[11px] font-medium text-fg-secondary">基本信息</p>
      <dl class="space-y-1.5 text-xs">
        <div class="flex justify-between gap-2">
          <dt class="text-fg-tertiary">文件数</dt>
          <dd class="text-fg-primary">{{ photoCount }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-fg-tertiary">占用空间</dt>
          <dd class="text-fg-primary">{{ fmtSize(totalSize) }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-fg-tertiary">添加日期</dt>
          <dd class="text-fg-primary">{{ addedAt }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-fg-tertiary">密码保护</dt>
          <dd>
            <button
              type="button"
              class="text-xs text-fg-primary underline underline-offset-2 transition-colors hover:text-brand-400"
              @click="
                hasPassword
                  ? (removePromptOpen = !removePromptOpen)
                  : (passwordPromptOpen = !passwordPromptOpen)
              "
            >
              {{ hasPassword ? '移除' : '设置' }}
            </button>
          </dd>
        </div>
      </dl>
      <div v-if="passwordPromptOpen" class="mt-2 flex gap-1.5">
        <input
          v-model="passwordInput"
          type="password"
          placeholder="输入文件夹密码"
          class="h-7 min-w-0 flex-1 rounded-md border border-line-default bg-surface-1 px-2 text-xs text-fg-primary focus:outline-none focus:border-brand-500"
          @keyup.enter="setPassword"
        />
        <UButton size="sm" variant="primary" @click="setPassword">保存</UButton>
      </div>
      <div v-if="removePromptOpen" class="mt-2 flex gap-1.5">
        <input
          v-model="removeInput"
          type="password"
          placeholder="输入原密码以移除"
          class="h-7 min-w-0 flex-1 rounded-md border border-line-default bg-surface-1 px-2 text-xs text-fg-primary focus:outline-none focus:border-brand-500"
          @keyup.enter="removePassword"
        />
        <UButton size="sm" variant="danger" @click="removePassword">移除</UButton>
      </div>
    </div>

    <!-- 底部：导出文件夹（R4，对齐 Eagle 实测） -->
    <div class="shrink-0 border-t border-line-default p-3">
      <UButton variant="secondary" class="w-full" @click="handleExport">
        <span class="flex items-center justify-center gap-1.5">
          <AppIcon icon="ic-inspector-export" />
          导出文件夹
        </span>
      </UButton>
    </div>
  </aside>
</template>
