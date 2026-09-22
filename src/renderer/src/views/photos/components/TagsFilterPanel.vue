<script setup lang="ts">
/**
 * TagsFilterPanel · 标签筛选弹层（五轮对齐 Eagle 实测；二十六轮补全）
 *
 * 结构：顶栏 搜索 + 「逻辑: 任意/全部/等同」（Eagle 原生 ic-logic-* 图标）；
 * 左栏「已选定」；右栏 未标签行 + 标签列表（方框勾选 + 书签图标 + 名称 + 计数）；
 * 底栏提示 选择 左键 / 排除 右键 / 关闭 ESC。
 * 左键=包含切换；右键=排除（红叉语义）；未标签=只看无标签素材。
 * 二十六轮：计数改为当前视图候选池实时统计（Eagle 同语义，不再用全局 usageCount）。
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

const includeLower = computed(() => tabs.active.tagFilter.map((t) => t.toLowerCase()))
const excludeLower = computed(() => tabs.active.tagExclude.map((t) => t.toLowerCase()))

const visibleTags = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return data.dictionaryTags.value
  return data.dictionaryTags.value.filter((t) => t.name.toLowerCase().includes(q))
})

/** 池内标签计数（Eagle 弹层右侧计数随视图收敛） */
const tagCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const p of filters.currentPool.value) {
    for (const t of p.tags) {
      const lower = t.toLowerCase()
      out[lower] = (out[lower] ?? 0) + 1
    }
  }
  return out
})
function tagCount(name: string): number {
  return tagCounts.value[name.toLowerCase()] ?? 0
}
/** 池内未标签计数 */
const untaggedCount = computed(
  () => filters.currentPool.value.filter((p) => p.tags.length === 0).length
)

function toggleInclude(name: string): void {
  const arr = tabs.active.tagFilter
  const i = arr.findIndex((t) => t.toLowerCase() === name.toLowerCase())
  if (i >= 0) arr.splice(i, 1)
  else arr.push(name)
  tabs.persist()
}
function toggleExclude(name: string): void {
  const arr = tabs.active.tagExclude
  const i = arr.findIndex((t) => t.toLowerCase() === name.toLowerCase())
  if (i >= 0) arr.splice(i, 1)
  else arr.push(name)
  // 同一标签不能同时包含与排除
  const inc = tabs.active.tagFilter
  const j = inc.findIndex((t) => t.toLowerCase() === name.toLowerCase())
  if (j >= 0) inc.splice(j, 1)
  tabs.persist()
}
function toggleUntagged(): void {
  tabs.active.untaggedOnly = !tabs.active.untaggedOnly
  tabs.persist()
}
function removeIncluded(name: string): void {
  const arr = tabs.active.tagFilter
  const i = arr.findIndex((t) => t.toLowerCase() === name.toLowerCase())
  if (i >= 0) arr.splice(i, 1)
  tabs.persist()
}
function removeUntagged(): void {
  tabs.active.untaggedOnly = false
  tabs.persist()
}

/**
 * 逻辑切换（Eagle ic-logic-any / ic-logic-all / ic-logic-equal 三态）：
 * 任意=OR，全部=AND，等同=标签集合与选中完全一致。
 */
type TagLogic = 'any' | 'all' | 'exact'
const tagLogic = computed<TagLogic>(() => {
  if (tabs.active.tagMatchExact) return 'exact'
  return tabs.active.tagMatchAny ? 'any' : 'all'
})
function setLogic(v: TagLogic): void {
  tabs.active.tagMatchExact = v === 'exact'
  tabs.active.tagMatchAny = v === 'any'
  tabs.persist()
}

type RowState = 'off' | 'include' | 'exclude'
function rowState(name: string): RowState {
  const lower = name.toLowerCase()
  if (includeLower.value.includes(lower)) return 'include'
  if (excludeLower.value.includes(lower)) return 'exclude'
  return 'off'
}

const hasSelection = computed(() => tabs.active.tagFilter.length > 0 || tabs.active.untaggedOnly)
</script>

<template>
  <div class="flex w-[560px] max-w-[80vw] flex-col">
    <!-- 顶栏：搜索 + 逻辑三态（Eagle 原生图标） -->
    <div class="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
      <AppIcon icon="ic_search" :size="14" class="shrink-0 text-fg-muted" />
      <input
        v-model="search"
        type="text"
        placeholder="搜索标签"
        class="h-6 min-w-0 flex-1 bg-transparent text-xs text-fg-primary placeholder:text-fg-muted focus:outline-none"
      />
      <span class="shrink-0 text-[11px] text-fg-muted">逻辑:</span>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-sm transition-colors"
        :class="
          tagLogic === 'any'
            ? 'bg-surface-hover text-fg-primary'
            : 'text-fg-muted hover:text-fg-primary'
        "
        title="包含任一选中标签（OR）"
        @click="setLogic('any')"
      >
        <AppIcon icon="ic-logic-any" :size="14" />
      </button>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-sm transition-colors"
        :class="
          tagLogic === 'all'
            ? 'bg-surface-hover text-fg-primary'
            : 'text-fg-muted hover:text-fg-primary'
        "
        title="包含所有选中标签（AND）"
        @click="setLogic('all')"
      >
        <AppIcon icon="ic-logic-all" :size="14" />
      </button>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-sm transition-colors"
        :class="
          tagLogic === 'exact'
            ? 'bg-surface-hover text-fg-primary'
            : 'text-fg-muted hover:text-fg-primary'
        "
        title="标签与选中完全一致（等同）"
        @click="setLogic('exact')"
      >
        <AppIcon icon="ic-logic-equal" :size="14" />
      </button>
    </div>

    <!-- 双栏 -->
    <div class="grid h-72 grid-cols-[168px_1fr] divide-x divide-line-subtle">
      <!-- 左栏：已选定 -->
      <div class="overflow-y-auto py-1.5 app-scroll">
        <p class="px-3 pb-1 text-[11px] font-medium text-fg-secondary">已选定</p>
        <p v-if="!hasSelection" class="px-3 py-1 text-xs text-fg-muted">全部</p>
        <button
          v-if="tabs.active.untaggedOnly"
          type="button"
          class="mx-1.5 flex w-[calc(100%-12px)] items-center gap-1 rounded-sm bg-brand-500 px-2 py-1 text-xs text-white"
          title="点击移除"
          @click="removeUntagged"
        >
          <AppIcon icon="context-menu/ic-tag-undefined" :size="12" />
          <span class="min-w-0 flex-1 truncate text-left">未标签</span>
        </button>
        <button
          v-for="t in tabs.active.tagFilter"
          :key="t"
          type="button"
          class="mx-1.5 flex w-[calc(100%-12px)] items-center gap-1 rounded-sm bg-brand-500 px-2 py-1 text-xs text-white"
          :title="`点击移除「${t}」`"
          @click="removeIncluded(t)"
        >
          <span class="min-w-0 flex-1 truncate text-left">{{ t }}</span>
          <AppIcon icon="ic-modal-close" :size="11" />
        </button>
      </div>

      <!-- 右栏：未标签 + 标签列表 -->
      <div class="overflow-y-auto py-1 app-scroll">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover"
          @click="toggleUntagged"
          @contextmenu.prevent="toggleUntagged"
        >
          <AppIcon
            v-if="tabs.active.untaggedOnly"
            icon="context-menu/ic-context-menu-checkbox"
            :size="14"
            class="text-brand-500"
          />
          <span v-else class="leaf-checkbox" />
          <AppIcon icon="context-menu/ic-tag-undefined" :size="13" class="text-fg-secondary" />
          <span class="min-w-0 flex-1 truncate text-fg-primary">未标签</span>
          <span class="shrink-0 text-[11px] tabular-nums text-fg-muted">{{ untaggedCount }}</span>
        </button>
        <button
          v-for="t in visibleTags"
          :key="t.id"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover"
          :title="rowState(t.name) === 'exclude' ? '右键取消排除' : '左键包含 / 右键排除'"
          @click="toggleInclude(t.name)"
          @contextmenu.prevent="toggleExclude(t.name)"
        >
          <AppIcon
            v-if="rowState(t.name) === 'include'"
            icon="context-menu/ic-context-menu-checkbox"
            :size="14"
            class="text-brand-500"
          />
          <AppIcon
            v-else-if="rowState(t.name) === 'exclude'"
            icon="ic-condition-remove"
            :size="14"
            class="text-danger"
          />
          <span v-else class="leaf-checkbox" />
          <AppIcon icon="context-menu/ic-tag-normal" :size="13" class="text-fg-secondary" />
          <span
            class="min-w-0 flex-1 truncate"
            :class="
              rowState(t.name) === 'exclude' ? 'text-fg-muted line-through' : 'text-fg-primary'
            "
          >
            {{ t.name }}
          </span>
          <span class="shrink-0 text-[11px] tabular-nums text-fg-muted">{{
            tagCount(t.name)
          }}</span>
        </button>
        <p v-if="visibleTags.length === 0" class="px-3 py-2 text-[11px] text-fg-muted">
          没有匹配的标签
        </p>
      </div>
    </div>

    <!-- 底栏提示 -->
    <FilterHintBar />
  </div>
</template>
