<script setup lang="ts">
/**
 * LibraryInfoPanel · 右侧常驻信息面板（四轮对齐 Eagle：无选中/非文件夹视图时显示）
 *
 * Eagle 实测：检查器区域永不留空——「全部」等视图无选中时显示当前范围
 * 的筛选框 + 基本信息（文件数 / 文件大小）。本组件承接该形态：
 * 顶部输入框过滤当前视图（与工具栏搜索同源），基本信息为视图统计。
 * 十八轮：右下角 ? 帮助按钮（Eagle 同位），点击弹出快捷键速查层。
 * 十九轮：对齐 Eagle 文件夹信息面板——添加描述输入框、添加日期、密码保护、导出按钮。
 */
import { computed, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import type { Photo } from '../../../types/photo'

const props = defineProps<{
  /** 当前视图素材（已随视图/筛选解析） */
  photos: Photo[]
}>()

const tabs = useLibraryTabs()

const fileCount = computed(() => props.photos.length)
const totalSize = computed(() => props.photos.reduce((sum, p) => sum + (p.fileSize || 0), 0))

// 当前视图的添加日期（取最早的导入日期，Eagle 显示文件夹添加日期）
const addDate = computed(() => {
  if (props.photos.length === 0) return '—'
  const dates = props.photos
    .map((p) => p.importedAt || p.createdAt)
    .filter(Boolean)
    .sort()
  if (dates.length === 0) return '—'
  const d = new Date(dates[0])
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

function fmtTotal(bytes: number): string {
  if (bytes <= 0) return '0 KB'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes.toFixed(0)} bytes`
}

// ── 快捷键速查弹层（Eagle ? 帮助按钮） ──

const helpOpen = ref(false)
const shortcuts = [
  { label: '搜索素材', keys: '⌘F' },
  { label: '快速搜索', keys: '⌘J' },
  { label: '命令面板', keys: '⌘K' },
  { label: '标签筛选', keys: '⌘⇧T' },
  { label: '新增文件夹', keys: '⌘⇧N' },
  { label: '新增智能文件夹', keys: '⌥⇧⌘N' },
  { label: '显示/隐藏筛选行', keys: '⌘⇧F' },
  { label: '显示/隐藏侧栏', keys: '⌘B' },
  { label: '全选', keys: '⌘A' },
  { label: '创建副本', keys: '⌘D' },
  { label: '就地重命名', keys: 'F2' },
  { label: '高级模式（检查器信息全展开）', keys: 'F8' },
  { label: '预览（空格）', keys: 'Space' },
  { label: '丢到回收站', keys: '⌘⌫' }
]

function toggleHelp(): void {
  helpOpen.value = !helpOpen.value
}
</script>

<template>
  <aside
    class="relative flex h-full w-[var(--shell-inspector-w)] shrink-0 flex-col border-l border-line-default bg-surface-1"
    aria-label="资源库信息"
  >
    <!-- 顶部：当前视图名称（只读）——「全部」等固定入口的名称不可修改（Eagle 同）；
         此前误做成 placeholder=「全部」的搜索框，视觉上像可改名的可编辑字段 -->
    <div class="p-3">
      <input
        :value="tabs.active.title"
        type="text"
        readonly
        class="h-8 w-full cursor-default rounded-md border border-line-default bg-surface-0 px-3 text-xs text-fg-primary focus:outline-none"
        aria-label="视图名称"
      />
    </div>

    <!-- 基本信息 -->
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <div class="mb-2 text-xs font-medium text-fg-secondary">基本信息</div>
      <dl class="space-y-1.5 text-xs">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-fg-tertiary">文件数</dt>
          <dd class="tabular-nums text-fg-primary">{{ fileCount }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-fg-tertiary">占用空间</dt>
          <dd class="tabular-nums text-fg-primary">{{ fmtTotal(totalSize) }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-fg-tertiary">添加日期</dt>
          <dd class="tabular-nums text-fg-primary">{{ addDate }}</dd>
        </div>
      </dl>
    </div>

    <!-- 右下角 ? 帮助按钮（Eagle 同位） -->
    <button
      type="button"
      class="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border border-line-default bg-surface-1 text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary"
      aria-label="帮助"
      title="快捷键速查"
      @click="toggleHelp"
    >
      ?
    </button>

    <!-- 快捷键速查弹层 -->
    <div
      v-if="helpOpen"
      class="absolute bottom-10 right-2 z-50 w-56 rounded-md border border-line-default bg-surface-1 py-1 shadow-lg"
    >
      <p class="px-3 py-1.5 text-[10px] font-medium tracking-wider text-fg-tertiary uppercase">
        快捷键速查
      </p>
      <div class="max-h-64 overflow-y-auto">
        <div
          v-for="sc in shortcuts"
          :key="sc.label"
          class="flex items-center justify-between px-3 py-1 text-xs"
        >
          <span class="text-fg-secondary">{{ sc.label }}</span>
          <kbd class="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-primary">{{
            sc.keys
          }}</kbd>
        </div>
      </div>
    </div>
  </aside>
</template>
