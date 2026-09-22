<script setup lang="ts">
/**
 * FolderViewSettings · 文件夹独立视图设置（十二轮，对齐 Eagle 新建/编辑文件夹对话框）
 *
 * 三组覆盖：布局方式 / 排列方式 / 显示开关（8 项三态：跟随全局 · 开 · 关）。
 * 状态为「部分 DisplayOptions + 布局/排列」，null/缺省 = 跟随全局。
 */
import { computed } from 'vue'
import type { DisplayOptions, LibraryLayout, LibrarySort } from '@renderer/stores/libraryTabs'

export interface FolderViewOverrides {
  layout: string // 'global' | LibraryLayout
  sort: string // 'global' | LibrarySort
  display: Partial<Record<keyof DisplayOptions, 0 | 1 | 2>> // 0=全局 1=显示 2=隐藏
}

const props = defineProps<{ modelValue: FolderViewOverrides }>()
const emit = defineEmits<{ 'update:modelValue': [v: FolderViewOverrides] }>()

const LAYOUTS: Array<{ key: LibraryLayout; label: string }> = [
  { key: 'waterfall', label: '瀑布流' },
  { key: 'auto', label: '自适应' },
  { key: 'grid', label: '网格' },
  { key: 'list', label: '列表' },
  { key: 'freeform', label: '自由网格' }
]
const SORTS: Array<{ key: LibrarySort; label: string }> = [
  { key: 'imported', label: '添加日期' },
  { key: 'modified', label: '修改日期' },
  { key: 'created', label: '创建日期' },
  { key: 'name', label: '标题' },
  { key: 'extension', label: '扩展名' },
  { key: 'size', label: '文件大小' },
  { key: 'dimensions', label: '尺寸' },
  { key: 'rating', label: '评分' },
  { key: 'duration', label: '时长' }
]
// 注：showSummary 为字符串枚举（简介内容下拉），不适用三态布尔覆盖，跟随全局
const DISPLAY_KEYS: Array<{ key: keyof DisplayOptions; label: string }> = [
  { key: 'showName', label: '名称' },
  { key: 'showExtension', label: '扩展名' },
  { key: 'includeSubfolders', label: '子文件夹内容' },
  { key: 'showHoverBar', label: '横栏' },
  { key: 'showInspector', label: '检查器' }
]
const TRI_STATES: Array<{ value: 0 | 1 | 2; label: string }> = [
  { value: 0, label: '全局' },
  { value: 1, label: '开' },
  { value: 2, label: '关' }
]

const v = computed(() => props.modelValue)

function set(patch: Partial<FolderViewOverrides>): void {
  emit('update:modelValue', { ...v.value, ...patch })
}
function setDisplayKey(key: keyof DisplayOptions, state: 0 | 1 | 2): void {
  const display = { ...v.value.display, [key]: state }
  emit('update:modelValue', { ...v.value, display })
}

const selCls =
  'h-7 rounded-md border border-line-subtle bg-surface-1 px-2 text-xs text-fg-primary focus-visible:border-brand-500 focus-visible:outline-none'
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <span class="w-16 shrink-0 text-xs text-fg-muted">布局方式</span>
      <select
        :value="v.layout"
        :class="selCls"
        @change="set({ layout: ($event.target as HTMLSelectElement).value })"
      >
        <option value="global">使用全局设置</option>
        <option v-for="l in LAYOUTS" :key="l.key" :value="l.key">{{ l.label }}</option>
      </select>
    </div>
    <div class="flex items-center gap-2">
      <span class="w-16 shrink-0 text-xs text-fg-muted">排列方式</span>
      <select
        :value="v.sort"
        :class="selCls"
        @change="set({ sort: ($event.target as HTMLSelectElement).value })"
      >
        <option value="global">使用全局设置</option>
        <option v-for="s in SORTS" :key="s.key" :value="s.key">{{ s.label }}</option>
      </select>
    </div>

    <!-- 显示 8 开关三态 -->
    <div class="border-t border-line-subtle pt-2">
      <div
        v-for="d in DISPLAY_KEYS"
        :key="d.key"
        class="flex items-center justify-between py-1 text-xs text-fg-primary"
      >
        <span>{{ d.label }}</span>
        <div class="flex overflow-hidden rounded-md border border-line-subtle">
          <button
            v-for="st in TRI_STATES"
            :key="st.value"
            type="button"
            class="px-2 py-0.5 text-[11px] transition-colors"
            :class="
              (v.display[d.key] ?? 0) === st.value
                ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400'
                : 'text-fg-muted hover:bg-surface-hover'
            "
            @click="setDisplayKey(d.key, st.value)"
          >
            {{ st.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
