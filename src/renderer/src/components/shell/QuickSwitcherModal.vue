<script setup lang="ts">
/**
 * QuickSwitcherModal · 快速跳转器（十五轮批6，Eagle 左段 ⇄ 按钮同位实现）
 *
 * 实拍形态（Eagle 4.0）：顶部搜索框「搜索（支持拼音、模糊关键字）」+ 分类页签
 * 文件夹/标签/智能文件夹/文档 + 列表（名称 + 右侧归属提示）+ 底部快捷键提示条
 * （切换 Tab / 移动 / 选中 / 关闭 ESC）。
 * 十八轮：补齐拼音搜索（pinyin-pro，首字母+全拼匹配），placeholder 承诺落地。
 */
import { computed, ref, watch, nextTick } from 'vue'
import { pinyin } from 'pinyin-pro'
import AppIcon from '@components/AppIcon.vue'
import UModal from '@components/ui/UModal.vue'
import { usePhotoData } from '@views/photos/composables/usePhotoData'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoSelection } from '@views/photos/composables/usePhotoSelection'
import { usePhotoSearch } from '@views/photos/composables/usePhotoSearch'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const data = usePhotoData()
const tabs = useLibraryTabs()
const selection = usePhotoSelection()
const search = usePhotoSearch()

type TabKey = 'folder' | 'tag' | 'smart' | 'doc'
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'folder', label: '文件夹' },
  { key: 'tag', label: '标签' },
  { key: 'smart', label: '智能文件夹' },
  { key: 'doc', label: '文档' }
]

const active = ref(0)
const keyword = ref('')
const cursor = ref(0)
const listEl = ref<HTMLElement | null>(null)

const close = (): void => emit('update:modelValue', false)

interface Entry {
  key: string
  title: string
  hint: string
  /** 拼音首字母串（小写无音标，如 "wj"） */
  pyFirst: string
  /** 拼音全拼串（小写无音标连写，如 "wenjian"） */
  pyFull: string
  run: () => void
}

/** 为标题生成拼音索引（首字母 + 全拼，小写无音标连写） */
function pyIndex(title: string): { first: string; full: string } {
  try {
    const first = pinyin(title, { pattern: 'first', toneType: 'none', type: 'array' })
      .join('')
      .toLowerCase()
    const full = pinyin(title, { pattern: 'pinyin', toneType: 'none', type: 'array' })
      .join('')
      .toLowerCase()
    return { first, full }
  } catch {
    return { first: '', full: '' }
  }
}

const folders = computed<Entry[]>(() =>
  data.folders.value.map((f) => {
    const py = pyIndex(f.name)
    return {
      key: f.id,
      title: f.name,
      hint: `${f.photoCount} 项`,
      pyFirst: py.first,
      pyFull: py.full,
      run: () => tabs.setView(`folder:${f.id}`, f.name)
    }
  })
)

const tags = computed<Entry[]>(() =>
  data.dictionaryTags.value.map((t) => {
    const py = pyIndex(t.name)
    return {
      key: t.id,
      title: t.name,
      hint: `${t.usageCount ?? 0} 项`,
      pyFirst: py.first,
      pyFull: py.full,
      // Leaf 无独立标签视图：跳回「全部」并应用标签筛选。
      // setView 内部已 persist，tagFilter 赋值在其后，需再补一次（审查 P3-68）
      run: () => {
        tabs.setView('all', '全部')
        tabs.active.tagFilter = [t.name]
        tabs.persist()
      }
    }
  })
)

const smartAlbums = computed<Entry[]>(() =>
  data.smartAlbums.value.map((s) => {
    const py = pyIndex(s.name)
    return {
      key: s.id,
      title: s.name,
      hint: '智能文件夹',
      pyFirst: py.first,
      pyFull: py.full,
      run: () => tabs.setView(`smart:${s.id}`, s.name)
    }
  })
)

const docs = computed<Entry[]>(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return []
  // 文档页：把关键词交给库内搜索（Eagle 文档 Tab 的库内等价）
  return [
    {
      key: 'search',
      title: `搜索「${keyword.value.trim()}」`,
      hint: '在全部素材中搜索',
      pyFirst: '',
      pyFull: '',
      run: () => {
        tabs.setView('all', '全部')
        selection.clearSelection()
        // 走搜索管线（审查 P2-18 相关 / P3-68）：旧实现直接赋值 searchKeyword，
        // 绕过 handleSearch → 分页搜索池不加载，大库下只匹配已加载窗口；
        // 且未 persist，重启后关键词丢失
        search.handleSearch(keyword.value.trim())
      }
    }
  ]
})

const entries = computed<Entry[]>(() => {
  const source =
    active.value === 0
      ? folders.value
      : active.value === 1
        ? tags.value
        : active.value === 2
          ? smartAlbums.value
          : docs.value
  const q = keyword.value.trim().toLowerCase()
  if (!q || active.value === 3) return source
  return source.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.hint.toLowerCase().includes(q) ||
      e.pyFirst.includes(q) ||
      e.pyFull.includes(q)
  )
})

watch([keyword, active], () => {
  cursor.value = 0
})

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      keyword.value = ''
      cursor.value = 0
      await nextTick()
      ;(document.getElementById('quick-switcher-input') as HTMLInputElement | null)?.focus()
    }
  }
)

function move(delta: number): void {
  const n = entries.value.length
  if (n === 0) return
  cursor.value = (cursor.value + delta + n) % n
  nextTick(() => {
    listEl.value
      ?.querySelector(`[data-idx="${cursor.value}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function runCurrent(): void {
  const entry = entries.value[cursor.value]
  if (!entry) return
  entry.run()
  close()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runCurrent()
  } else if (e.key === 'Tab') {
    e.preventDefault()
    active.value = (active.value + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length
  }
}
</script>

<template>
  <UModal :model-value="modelValue" size="md" :close-on-overlay="true" @update:model-value="close">
    <div class="flex flex-col" @keydown="onKeydown">
      <!-- 搜索框（Eagle：支持拼音、模糊关键字；Leaf：原文+首字母+全拼匹配） -->
      <input
        id="quick-switcher-input"
        v-model="keyword"
        type="text"
        placeholder="搜索（支持拼音、模糊关键字）"
        class="h-10 w-full border-0 border-b border-line-default bg-transparent px-3 text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
      />
      <!-- 分类页签 -->
      <div class="flex items-center gap-1 border-b border-line-default px-2 py-1.5">
        <button
          v-for="(t, i) in TABS"
          :key="t.key"
          type="button"
          class="rounded-md px-2.5 py-1 text-xs transition-colors duration-fast"
          :class="
            i === active
              ? 'bg-surface-active font-medium text-fg-primary'
              : 'text-fg-secondary hover:bg-surface-hover hover:text-fg-primary'
          "
          @click="active = i"
        >
          {{ t.label }}
        </button>
      </div>
      <!-- 列表 -->
      <div ref="listEl" class="max-h-80 min-h-24 overflow-y-auto py-1">
        <p v-if="entries.length === 0" class="px-3 py-6 text-center text-xs text-fg-muted">
          没有匹配的项目
        </p>
        <button
          v-for="(e, i) in entries"
          :key="`${active}-${e.key}`"
          :data-idx="i"
          type="button"
          class="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-fast"
          :class="i === cursor ? 'bg-surface-active text-fg-primary' : 'text-fg-secondary'"
          @mouseenter="cursor = i"
          @click="runCurrent()"
        >
          <AppIcon
            :icon="
              active === 0
                ? 'ic_folder-close'
                : active === 1
                  ? 'context-menu/ic-tag-normal'
                  : active === 2
                    ? 'context-menu/ic-smart-folder-rule'
                    : 'context-menu/ic-filter-item-ext'
            "
           
            class="shrink-0 text-fg-muted"
          />
          <span class="flex-1 truncate">{{ e.title }}</span>
          <span class="shrink-0 text-[10px] text-fg-tertiary">{{ e.hint }}</span>
        </button>
      </div>
      <!-- 底部快捷键提示条（Eagle 同款） -->
      <div
        class="flex items-center gap-3 border-t border-line-default px-3 py-1.5 text-[10px] text-fg-tertiary"
      >
        <span>切换 <b class="text-fg-secondary">Tab</b></span>
        <span>移动 <b class="text-fg-secondary">↑ ↓</b></span>
        <span>选中 <b class="text-fg-secondary">⏎</b></span>
        <span class="ml-auto">关闭 <b class="text-fg-secondary">ESC</b></span>
      </div>
    </div>
  </UModal>
</template>
