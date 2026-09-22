<script setup lang="ts">
/**
 * FoldersFilterPanel · 文件夹筛选弹层（五轮对齐 Eagle 实测；二十六轮补全）
 *
 * 结构：顶栏 搜索 + 「逻辑: 任意/所有」（Eagle 原生 ic-logic-* 图标）；
 * 列表行 方框勾选 + 名称 + 计数（含「未分类」伪文件夹）；
 * 底栏提示 选择 左键 / 排除 右键。
 * 左键=包含切换（多选）；右键=排除。Leaf 素材单文件夹归属，
 * 「任一」=并集（常用），「所有」=交集（多选时通常为空，保留语义完整）。
 * 二十六轮：计数改为当前视图候选池实时统计（Eagle 同语义）。
 */
import { computed, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoData } from '../composables/usePhotoData'
import { usePhotoFilters } from '../composables/usePhotoFilters'
import FilterHintBar from './FilterHintBar.vue'

const tabs = useLibraryTabs()
const data = usePhotoData()
const filters = usePhotoFilters()

const search = ref('')

const visibleFolders = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return data.folders.value
  return data.folders.value.filter((f) => f.name.toLowerCase().includes(q))
})

/** 池内文件夹计数（Eagle 弹层右侧计数随视图收敛） */
const folderCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  let none = 0
  for (const p of filters.currentPool.value) {
    if (p.folderId == null) none++
    else out[p.folderId] = (out[p.folderId] ?? 0) + 1
  }
  out['none'] = none
  return out
})
function folderCount(id: string): number {
  return folderCounts.value[id] ?? 0
}

const showUntaggedRow = computed(
  () => !search.value.trim() || '未分类'.toLowerCase().includes(search.value.trim().toLowerCase())
)

type RowState = 'off' | 'include' | 'exclude'
function rowState(id: string): RowState {
  if (tabs.active.folderFilterIds.includes(id)) return 'include'
  if (tabs.active.folderExcludeIds.includes(id)) return 'exclude'
  return 'off'
}

function toggleInclude(id: string): void {
  const inc = tabs.active.folderFilterIds
  const i = inc.indexOf(id)
  if (i >= 0) inc.splice(i, 1)
  else inc.push(id)
  const ex = tabs.active.folderExcludeIds
  const j = ex.indexOf(id)
  if (j >= 0) ex.splice(j, 1)
  tabs.persist()
}
function toggleExclude(id: string): void {
  const ex = tabs.active.folderExcludeIds
  const i = ex.indexOf(id)
  if (i >= 0) ex.splice(i, 1)
  else ex.push(id)
  const inc = tabs.active.folderFilterIds
  const j = inc.indexOf(id)
  if (j >= 0) inc.splice(j, 1)
  tabs.persist()
}

/** 逻辑切换（内联多语句处理器会被 prettier 折行破坏，收敛至此） */
function setMatchAll(v: boolean): void {
  tabs.active.folderMatchAll = v
  tabs.persist()
}
</script>

<template>
  <div class="flex w-[360px] max-w-[80vw] flex-col">
    <!-- 顶栏：搜索 + 逻辑（Eagle 原生图标） -->
    <div class="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
      <AppIcon icon="ic_search" :size="14" class="shrink-0 text-fg-muted" />
      <input
        v-model="search"
        type="text"
        placeholder="搜索..."
        class="h-6 min-w-0 flex-1 bg-transparent text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
      />
      <span class="shrink-0 text-[11px] text-fg-muted">逻辑:</span>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-sm transition-colors"
        :class="
          !tabs.active.folderMatchAll
            ? 'bg-surface-hover text-fg-primary'
            : 'text-fg-muted hover:text-fg-primary'
        "
        title="位于任一选中文件夹（OR）"
        @click="setMatchAll(false)"
      >
        <AppIcon icon="ic-logic-any" :size="14" />
      </button>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-sm transition-colors"
        :class="
          tabs.active.folderMatchAll
            ? 'bg-surface-hover text-fg-primary'
            : 'text-fg-muted hover:text-fg-primary'
        "
        title="位于所有选中文件夹（AND）"
        @click="setMatchAll(true)"
      >
        <AppIcon icon="ic-logic-all" :size="14" />
      </button>
    </div>

    <!-- 列表 -->
    <div class="h-72 overflow-y-auto py-1 app-scroll">
      <button
        v-if="showUntaggedRow"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover"
        :title="rowState('none') === 'exclude' ? '右键取消排除' : '左键包含 / 右键排除'"
        @click="toggleInclude('none')"
        @contextmenu.prevent="toggleExclude('none')"
      >
        <AppIcon
          v-if="rowState('none') === 'include'"
          icon="context-menu/ic-context-menu-checkbox"
          :size="14"
          class="text-brand-500"
        />
        <AppIcon
          v-else-if="rowState('none') === 'exclude'"
          icon="ic-condition-remove"
          :size="14"
          class="text-danger"
        />
        <span v-else class="leaf-checkbox" />
        <span class="min-w-0 flex-1 truncate text-fg-primary">未分类</span>
        <span class="shrink-0 text-[11px] tabular-nums text-fg-muted">{{
          folderCount('none')
        }}</span>
      </button>
      <button
        v-for="f in visibleFolders"
        :key="f.id"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover"
        :title="rowState(f.id) === 'exclude' ? '右键取消排除' : '左键包含 / 右键排除'"
        @click="toggleInclude(f.id)"
        @contextmenu.prevent="toggleExclude(f.id)"
      >
        <AppIcon
          v-if="rowState(f.id) === 'include'"
          icon="context-menu/ic-context-menu-checkbox"
          :size="14"
          class="text-brand-500"
        />
        <AppIcon
          v-else-if="rowState(f.id) === 'exclude'"
          icon="ic-condition-remove"
          :size="14"
          class="text-danger"
        />
        <span v-else class="leaf-checkbox" />
        <span
          class="min-w-0 flex-1 truncate"
          :class="rowState(f.id) === 'exclude' ? 'text-fg-muted line-through' : 'text-fg-primary'"
        >
          {{ f.name }}
        </span>
        <span class="shrink-0 text-[11px] tabular-nums text-fg-muted">{{ folderCount(f.id) }}</span>
      </button>
      <p
        v-if="visibleFolders.length === 0 && !showUntaggedRow"
        class="px-3 py-2 text-[11px] text-fg-muted"
      >
        没有匹配的文件夹
      </p>
    </div>

    <!-- 底栏提示（Eagle 文件夹弹层无 ESC 段） -->
    <FilterHintBar :esc="false" />
  </div>
</template>
