<template>
  <UModal :model-value="true" size="sm" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <AppIcon icon="context-menu/ic-folder-auto-tag" />
        设置自动标签
      </span>
    </template>

    <div class="space-y-3">
      <!-- 文件夹名称（Eagle 同款：对话框内可直接改名） -->
      <div>
        <label class="mb-1 block text-xs text-fg-muted">文件夹名称</label>
        <input
          v-model="name"
          type="text"
          class="h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
          @keyup.enter="save"
        />
      </div>

      <!-- 自动添加标签（Eagle 同款：胶囊 + 搜索建议 + 新建） -->
      <div>
        <label class="mb-1 block text-xs text-fg-muted">自动添加标签</label>
        <div
          class="relative min-h-[42px] w-full cursor-text rounded-md border border-line-default bg-surface-1 px-2 py-1.5"
          @click="inputRef?.focus()"
        >
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              v-for="tag in tags"
              :key="tag"
              class="flex items-center gap-1 rounded-full bg-brand-500/15 py-0.5 pl-2.5 pr-1 text-xs text-fg-primary"
            >
              {{ tag }}
              <button
                type="button"
                class="flex size-3.5 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary"
                :aria-label="`移除标签 ${tag}`"
                @click.stop="removeTag(tag)"
              >
                <AppIcon icon="ic-modal-close" :size="8" />
              </button>
            </span>
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              placeholder="添加标签"
              class="h-6 min-w-[120px] flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
              @keydown.enter.prevent="commitQuery"
              @keydown.backspace="onBackspace"
            />
          </div>

          <!-- 标签建议下拉（搜索匹配 + 新建） -->
          <div
            v-if="query.trim() && suggestions.length + (canCreate ? 1 : 0) > 0"
            class="absolute inset-x-0 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-md border border-line-default bg-surface-3 py-1 shadow-md app-scroll"
          >
            <button
              v-for="s in suggestions"
              :key="s"
              type="button"
              class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-fg-primary transition-colors hover:bg-surface-hover"
              @click.stop="addTag(s)"
            >
              <AppIcon icon="ic_search" :size="11" class="text-fg-muted" />
              {{ s }}
            </button>
            <button
              v-if="canCreate"
              type="button"
              class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-brand-500 transition-colors hover:bg-surface-hover"
              @click.stop="addTag(query.trim())"
            >
              + 新建 "{{ query.trim() }}"
            </button>
          </div>
        </div>
        <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
          归入此文件夹的素材将自动打上这些标签；保存时也会应用到文件夹内现有素材。
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton variant="ghost" @click="$emit('close')">取消</UButton>
        <UButton variant="primary" @click="save">保存设置</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
/**
 * AutoTagModal · 文件夹自动标签可视化编辑器（二十四轮，对齐 Eagle 右键
 * 「设置自动标签」对话框：文件夹名称 + 标签胶囊选择器（搜索建议 + 新建）
 * + 保存设置/取消）。
 *
 * 保存语义：改名（若有变化）+ 保存规则；规则保存时后端会把标签应用到
 * 文件夹内现有素材（见 PhotoDataStore.setFolderAutoTags），此后素材归入
 * 该文件夹时也会自动打标（assignPhotosToFolder 钩子）。
 */
import { computed, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import type { PhotoFolder } from '../../../types/photo'
import { useToast } from '@composables/useToast'

const props = defineProps<{ folder: PhotoFolder; dictionaryTags: string[] }>()

const emit = defineEmits<{
  close: []
  /** 保存成功；载荷为新名称（若改名）——父层用于同步视图标题 */
  changed: [newName: string]
}>()

const toast = useToast()
const name = ref(props.folder.name)
const tags = ref<string[]>([])
const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// 二十四轮：载入已保存规则（getFolderAutoTags）
void (async () => {
  try {
    tags.value = await window.api.photos.getFolderAutoTags(props.folder.id)
  } catch {
    tags.value = []
  }
})()

/** 字典标签中匹配输入的建议（排除已选） */
const suggestions = computed<string[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return props.dictionaryTags
    .filter((t) => t.toLowerCase().includes(q) && !tags.value.includes(t))
    .slice(0, 8)
})

/** 输入与已有/字典标签完全不同名时显示「新建」 */
const canCreate = computed(() => {
  const q = query.value.trim()
  if (!q) return false
  if (tags.value.includes(q)) return false
  return !props.dictionaryTags.some((t) => t.toLowerCase() === q.toLowerCase())
})

function addTag(tag: string): void {
  const trimmed = tag.trim()
  if (!trimmed) return
  if (!tags.value.includes(trimmed)) tags.value.push(trimmed)
  query.value = ''
  inputRef.value?.focus()
}

function removeTag(tag: string): void {
  tags.value = tags.value.filter((t) => t !== tag)
}

/** 空输入按退格：移除最后一个胶囊（主流标签输入习惯） */
function onBackspace(): void {
  if (query.value) return
  tags.value.pop()
}

function commitQuery(): void {
  const q = query.value.trim()
  if (!q) return
  addTag(q)
}

async function save(): Promise<void> {
  const nextName = name.value.trim()
  if (!nextName) {
    toast.error('文件夹名称不能为空')
    return
  }
  try {
    if (nextName !== props.folder.name) {
      await window.api.photos.renamePhotoFolder(props.folder.id, nextName)
    }
    await window.api.photos.setFolderAutoTags(props.folder.id, tags.value)
    toast.success('自动标签已保存', {
      description: tags.value.length > 0 ? '归入该文件夹的素材将自动打上这些标签' : '已清空自动标签'
    })
    emit('changed', nextName)
    emit('close')
  } catch (error) {
    toast.error('保存失败', { description: (error as Error).message })
  }
}
</script>
