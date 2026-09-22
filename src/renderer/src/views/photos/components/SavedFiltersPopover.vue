<script setup lang="ts">
/**
 * SavedFiltersPopover · 筛选预设（Eagle「保存的筛选器」形态）
 *
 * 存的是 buildFiltersSpec() 的规则快照；点行「应用」把规则交回父层摊成 chip 状态
 * （反向映射与"表达不了就播报"都在父层的 rulesToFilters 里，本组件只管增删查）。
 * 面板外点/ESC 关闭沿用 DimensionPoolPopover 的写法（capture 阶段监听 + 卸载清理）。
 */
import { onBeforeUnmount, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import type { SmartAlbumRules } from '@shared/smartAlbumRules'
import {
  addSavedFilter,
  loadSavedFilters,
  removeSavedFilter,
  summarizeFilter,
  type SavedFilter
} from '../constants/savedFilters'

const props = defineProps<{ currentRules: SmartAlbumRules }>()

const emit = defineEmits<{ (e: 'apply', rules: SmartAlbumRules): void }>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const list = ref<SavedFilter[]>([])
const nameInput = ref('')
const error = ref('')

function toggleOpen(): void {
  open.value = !open.value
  if (open.value) {
    list.value = loadSavedFilters()
    error.value = ''
    outsideTimer = window.setTimeout(() => {
      outsideTimer = undefined
      document.addEventListener('mousedown', onOutside, true)
      window.addEventListener('keydown', onEsc, true)
    }, 0)
  }
}

let outsideTimer: number | undefined
function onOutside(e: MouseEvent): void {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}
function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}
function close(): void {
  open.value = false
  if (outsideTimer !== undefined) {
    window.clearTimeout(outsideTimer)
    outsideTimer = undefined
  }
  document.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('keydown', onEsc, true)
}

function saveCurrent(): void {
  const res = addSavedFilter(nameInput.value, props.currentRules)
  error.value = res.error ?? ''
  if (!res.error) {
    list.value = res.list
    nameInput.value = ''
  }
}

function applyFilter(f: SavedFilter): void {
  emit('apply', f.rules)
  close()
}

function drop(id: string): void {
  list.value = removeSavedFilter(id)
}

onBeforeUnmount(close)
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      type="button"
      class="flex size-6 items-center justify-center rounded text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg-primary"
      :class="open ? 'bg-surface-hover text-fg-primary' : ''"
      title="筛选预设"
      aria-label="筛选预设"
      @click="toggleOpen"
    >
      <AppIcon icon="context-menu/ic-saved-filter-create" :size="14" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-7 z-50 w-72 rounded-lg border border-line-default bg-surface-3 p-2 shadow-lg"
    >
      <div class="flex items-center gap-1.5">
        <input
          v-model="nameInput"
          type="text"
          placeholder="把当前筛选存为预设…"
          class="min-w-0 flex-1 rounded border border-line-default bg-surface-1 px-2 py-1 text-xs text-fg-primary focus:border-brand-500 focus:outline-none"
          @keydown.enter.prevent="saveCurrent"
        />
        <button
          type="button"
          class="shrink-0 rounded bg-brand-500 px-2 py-1 text-xs text-white disabled:opacity-40"
          :disabled="!nameInput.trim()"
          @click="saveCurrent"
        >
          保存
        </button>
      </div>
      <p v-if="error" class="mt-1 text-[10px] text-danger-500">{{ error }}</p>

      <p v-if="list.length === 0" class="mt-2 px-0.5 text-[11px] text-fg-muted">
        还没有预设。设好筛选后在上面起个名字保存。
      </p>
      <ul v-else class="mt-1.5 max-h-64 overflow-y-auto">
        <li
          v-for="f in list"
          :key="f.id"
          class="group flex items-start gap-1 rounded px-1 py-1 hover:bg-surface-hover"
        >
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            :title="`应用：${f.name}`"
            @click="applyFilter(f)"
          >
            <span class="block truncate text-xs text-fg-primary">{{ f.name }}</span>
            <span class="block truncate text-[10px] text-fg-muted">
              {{ summarizeFilter(f.rules) }}
            </span>
          </button>
          <button
            type="button"
            class="mt-0.5 hidden size-5 shrink-0 items-center justify-center rounded text-fg-muted hover:text-danger-500 group-hover:flex"
            title="删除预设"
            @click="drop(f.id)"
          >
            ×
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
