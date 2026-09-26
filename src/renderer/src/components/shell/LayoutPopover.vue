<script setup lang="ts">
/**
 * LayoutPopover · 布局弹层（D-012，对齐 Eagle 实测布局弹层）
 *
 * 三段：布局方式（瀑布流/自适应/网格/列表）+ 排列方式（10 种）+ 显示开关（8 项）。
 * 复用 FilterBar 高级筛选的 relative+absolute + 点外关闭模式（项目无 Popover 基建）。
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import USwitch from '../ui/USwitch.vue'
import { useLibraryUI } from '@composables/useLibraryUI'
import {
  useLibraryTabs,
  type LibraryLayout,
  type LibrarySort,
  type DisplayOptions
} from '@renderer/stores/libraryTabs'

const props = defineProps<{ disabled?: boolean }>()
const tabs = useLibraryTabs()
const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

let outsideTimer: number | undefined
function toggle(e: MouseEvent): void {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    // 等面板渲染后注册点外关闭（capture 先于面板内点击处理）。
    // 保存 timer id（审查 P3-64）：组件在定时器触发前卸载时，close 里的
    // removeEventListener 尚无可移除的监听，定时器随后注册的监听会永久泄漏
    outsideTimer = window.setTimeout(() => {
      outsideTimer = undefined
      document.addEventListener('mousedown', onOutside, true)
    }, 0)
  }
}
function onOutside(e: MouseEvent): void {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}
function close(): void {
  open.value = false
  if (outsideTimer !== undefined) {
    window.clearTimeout(outsideTimer)
    outsideTimer = undefined
  }
  document.removeEventListener('mousedown', onOutside, true)
}
onBeforeUnmount(close)

// ── 布局方式 ──

const LAYOUTS: Array<{ key: LibraryLayout; label: string; icon: string }> = [
  { key: 'waterfall', label: '瀑布流', icon: 'ic-layout-pinterest' },
  { key: 'auto', label: '自适应', icon: 'ic-layout-justified' },
  { key: 'grid', label: '网格', icon: 'ic-layout-grid' },
  { key: 'list', label: '列表', icon: 'ic-layout-list' }
]

function setLayout(key: LibraryLayout): void {
  tabs.active.layout = key
  tabs.persist()
}

// ── 排列方式（10 种；随机模式由 shuffle 驱动）──

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
const RANDOM = 'random'

const sortValue = computed<
  | 'imported'
  | 'name'
  | 'size'
  | 'rating'
  | 'modified'
  | 'created'
  | 'extension'
  | 'dimensions'
  | 'duration'
  | typeof RANDOM
>({
  get: () => (tabs.active.shuffle ? RANDOM : tabs.active.sortBy),
  set: (v) => {
    if (v === RANDOM) {
      tabs.active.shuffle = true
    } else {
      tabs.active.shuffle = false
      tabs.active.sortBy = v
    }
    tabs.persist()
  }
})

// ── 显示开关 ──

const d = computed(() => tabs.active.display)
const { panelVisible, togglePanel } = useLibraryUI()
// 顺序对齐 Eagle 4.0 实拍：名称 / 简介 / 扩展名 / 子文件夹内容 / 侧栏 / 检查器
// 二十一轮：扩展名标签/标注随角标渲染移除一并下线（Eagle 默认不显示）
const SWITCHES: Array<{ key: string; label: string }> = [
  { key: 'showName', label: '显示名称' },
  { key: '_summary', label: '显示简介' },
  { key: 'showExtension', label: '显示扩展名' },
  { key: 'includeSubfolders', label: '显示子文件夹内容' },
  { key: '_showSidebar', label: '显示侧栏' },
  { key: 'showInspector', label: '显示检查器' },
  // M3（Eagle「标注数」）：卡片标注计数徽标；走 DisplayOptions 通用布尔开关，无需特判
  { key: 'showAnnotationCount', label: '标注数' },
  { key: 'autoPlayGif', label: 'GIF/WebP 自动播放' }
]
function flagOf(key: string): boolean {
  // 十二轮勘误：显示侧栏 = 壳层行为（useLibraryUI），不占 DisplayOptions
  if (key === '_showSidebar') return panelVisible.value
  return Boolean((d.value as unknown as Record<string, boolean>)[key])
}
/** 简介开关：开=恢复上次内容（默认尺寸），关=none */
function toggleSwitch(key: string, v: boolean): void {
  if (key === '_summary') {
    d.value.showSummary = v ? 'dimensions' : 'none'
  } else if (key === '_showSidebar') {
    if (panelVisible.value !== v) togglePanel()
  } else {
    ;(d.value as unknown as Record<string, boolean>)[key] = v
  }
  tabs.persist()
}

/** 简介内容（四轮对齐 Eagle：卡片第二行单值随下拉切换） */
const SUMMARY_OPTIONS: Array<{ key: DisplayOptions['showSummary']; label: string }> = [
  { key: 'dimensions', label: '尺寸' },
  { key: 'size', label: '大小' },
  { key: 'added', label: '添加日期' },
  { key: 'modified', label: '修改日期' },
  { key: 'created', label: '创建日期' },
  { key: 'none', label: '关闭' }
]
const summaryValue = computed({
  get: () => d.value.showSummary,
  set: (v) => {
    d.value.showSummary = v
    tabs.persist()
  }
})

/** 升序/降序切换（Eagle 布局弹层双钮；随机模式下不可用） */
function setSortAsc(v: boolean): void {
  tabs.active.sortAsc = v
  tabs.persist()
}
const sortDirBtn = (active: boolean): string =>
  `flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors duration-fast ${
    active && !tabs.active.shuffle
      ? 'bg-surface-active text-fg-primary'
      : 'text-fg-secondary hover:bg-surface-hover hover:text-fg-primary'
  }`

/** 刷新：通知 photos 视图重拉当前池（Eagle 刷新按钮语义） */
function refreshView(): void {
  window.dispatchEvent(new CustomEvent('leaf:refresh-photos'))
}

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg-primary focus-visible:shadow-ring-focus focus-visible:outline-none'
</script>

<template>
  <div ref="rootEl" class="relative">
    <slot name="trigger" :toggle="toggle" :open="open" />

    <div
      v-if="open"
      class="absolute right-0 top-9 z-40 w-[300px] rounded-lg border border-line-subtle bg-surface-3 p-3 shadow-lg"
      role="menu"
      aria-label="布局与显示选项"
    >
      <!-- 布局方式（十五轮批6：对齐 Eagle 4.0 下拉形态） -->
      <div class="mb-1 text-xs text-fg-muted">布局方式</div>
      <div class="relative mb-3">
        <select
          :value="tabs.active.layout"
          class="h-8 w-full appearance-none rounded-md border border-line-subtle bg-surface-1 pl-7 pr-6 text-xs text-fg-primary focus-visible:border-brand-500 focus-visible:outline-none"
          aria-label="布局方式"
          @change="setLayout(($event.target as HTMLSelectElement).value as LibraryLayout)"
        >
          <option v-for="l in LAYOUTS" :key="l.key" :value="l.key">{{ l.label }}</option>
        </select>
        <AppIcon
          :icon="LAYOUTS.find((l) => l.key === tabs.active.layout)?.icon ?? 'ic-layout-grid'"
         
          class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-secondary"
        />
      </div>

      <!-- 排列方式（十五轮批6：+ 升序/降序切换，Eagle 同款双钮） -->
      <div class="mb-1 text-xs text-fg-muted">排列方式</div>
      <div class="mb-3 flex items-center gap-1">
        <select
          v-model="sortValue"
          class="h-8 min-w-0 flex-1 rounded-md border border-line-subtle bg-surface-1 px-2 text-xs text-fg-primary focus-visible:border-brand-500 focus-visible:outline-none"
          aria-label="排列方式"
        >
          <option v-for="s in SORTS" :key="s.key" :value="s.key">{{ s.label }}</option>
          <option :value="RANDOM">随机模式</option>
        </select>
        <button
          type="button"
          :class="sortDirBtn(tabs.active.sortAsc)"
          :aria-pressed="tabs.active.sortAsc"
          title="升序"
          @click="setSortAsc(true)"
        >
          <AppIcon icon="context-menu/ic-order-by-increase" />
        </button>
        <button
          type="button"
          :class="sortDirBtn(!tabs.active.sortAsc)"
          :aria-pressed="!tabs.active.sortAsc"
          title="降序"
          @click="setSortAsc(false)"
        >
          <AppIcon icon="context-menu/ic-order-by-decrease" />
        </button>
      </div>

      <!-- 显示开关（顺序对齐 Eagle：简介第二行，行内嵌内容下拉） -->
      <div class="border-t border-line-subtle pt-2">
        <div
          v-for="s in SWITCHES"
          :key="s.key"
          class="flex items-center justify-between py-1.5 text-xs text-fg-primary"
        >
          <span>{{ s.label }}</span>
          <div class="flex items-center gap-1.5">
            <select
              v-if="s.key === '_summary'"
              v-model="summaryValue"
              :disabled="summaryValue === 'none'"
              class="h-6 rounded-sm border border-line-subtle bg-surface-1 px-1 text-[11px] text-fg-secondary focus-visible:border-brand-500 focus-visible:outline-none disabled:opacity-40"
              aria-label="简介内容"
            >
              <option v-for="o in SUMMARY_OPTIONS" :key="o.key" :value="o.key">
                {{ o.label }}
              </option>
            </select>
            <USwitch
              size="sm"
              :model-value="flagOf(s.key)"
              :aria-label="s.label"
              @update:model-value="(v: boolean) => toggleSwitch(s.key, v)"
            />
          </div>
        </div>
      </div>

      <!-- 刷新（Eagle 布局弹层底部整宽按钮） -->
      <button
        type="button"
        class="mt-2 w-full rounded-md border border-line-subtle bg-surface-hover py-1.5 text-xs text-fg-primary transition-colors hover:bg-surface-active"
        @click="refreshView"
      >
        刷新
      </button>
    </div>
  </div>
</template>
