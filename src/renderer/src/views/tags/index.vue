<template>
  <!-- 三栏壳子对齐 photos 页（028，Eagle：应用侧栏｜标签管理菜单｜内容区） -->
  <div class="tags-page relative flex h-screen flex-row bg-surface-0">
    <div class="flex min-w-0 flex-1 flex-col">
      <TitleBar />

      <div class="flex min-h-0 flex-1 flex-row">
        <!-- ① 应用侧栏（复用 photos 的 LibraryPanel，「标签管理」行自带高亮） -->
        <div
          class="h-full shrink-0 overflow-hidden border-r border-line-subtle"
          :style="{ width: 'var(--shell-library-panel-w)' }"
        >
          <LibraryPanel />
        </div>

        <!-- ② 标签管理菜单（240px 可拖宽） -->
        <TagManagerSidebar :m="m" />

        <!-- ③ 内容区：工具行 + 批量条 + 群组分节 -->
        <div class="flex min-w-0 flex-1 flex-col">
          <!-- 工具行（Eagle 顶栏：排序 / 布局切换 / 搜索） -->
          <div class="flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle px-4">
            <button type="button" class="toolbar-btn" title="排序" @click="openSortMenu($event)">
              <AppIcon icon="ic-tag-manager-sort" />
            </button>
            <button
              type="button"
              :class="layoutBtnCls('grid')"
              :aria-pressed="m.layoutMode.value === 'grid'"
              title="网格视图"
              @click="m.layoutMode.value = 'grid'"
            >
              <AppIcon icon="ic-tag-manager-layout-grid" />
            </button>
            <button
              type="button"
              :class="layoutBtnCls('list')"
              :aria-pressed="m.layoutMode.value === 'list'"
              title="列表视图"
              @click="m.layoutMode.value = 'list'"
            >
              <AppIcon icon="ic-tag-manager-layout-list" />
            </button>
            <button type="button" class="toolbar-btn" title="新建标签" @click="promptCreateTag">
              <AppIcon icon="ic-sidebar-add" />
            </button>
            <div class="min-w-2 flex-1" />
            <input
              v-model="m.keyword.value"
              type="text"
              placeholder="搜索"
              class="h-7 w-44 rounded-md border border-line-default bg-surface-1 px-2.5 text-xs text-fg-primary placeholder:text-fg-muted focus:border-brand-500 focus:outline-none"
            />
          </div>

          <!-- 批量操作条（F19 保留 + Eagle 移动到群组/常用） -->
          <div
            v-if="m.selection.value.size > 0"
            class="relative flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle bg-brand-500/5 px-4"
          >
            <span class="text-xs font-medium text-fg-primary">
              已选 {{ m.selection.value.size }} 个标签
            </span>
            <div class="min-w-2 flex-1" />
            <UButton size="sm" variant="ghost" @click="m.clearSelection">取消选择</UButton>
            <UButton size="sm" variant="secondary" @click="m.mergeSelected([...m.selection.value])">
              合并为一个标签…
            </UButton>
            <UButton
              size="sm"
              variant="secondary"
              @click="m.moveTagsToGroup([...m.selection.value], null)"
            >
              从群组移除
            </UButton>
            <UButton size="sm" variant="secondary" @click="openBatchMoveMenu($event)">
              移动到群组…
            </UButton>
            <UButton
              size="sm"
              variant="secondary"
              @click="m.setStarred([...m.selection.value], true)"
            >
              设为常用
            </UButton>
            <UButton
              size="sm"
              variant="secondary"
              @click="m.setStarred([...m.selection.value], false)"
            >
              取消常用
            </UButton>
            <UButton size="sm" variant="danger" @click="m.deleteTags([...m.selection.value])">
              删除
            </UButton>
          </div>

          <!-- 分节滚动区（空白右键 + 框选容器） -->
          <div
            ref="contentEl"
            class="app-scroll relative min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3"
            @pointerdown="marquee.onPointerDown"
            @contextmenu="onBlankMenu"
          >
            <div v-if="m.loading.value" class="py-16 text-center text-sm text-fg-muted">
              加载中…
            </div>

            <!-- 空态（Eagle 三变体：全空 / 分类完成 / 搜索无结果）。
                 群组焦点视图例外：Eagle 空群组仍显示「群组名 (0) ＋ 描述」（用户截图
                 「未命名群组（0）＋」形态），组内空态由 TagGroupSection 的行内提示承担 -->
            <div
              v-else-if="!m.currentGroupId.value && m.sections.value.every((s) => s.tags.length === 0)"
              class="empty-state"
            >
              <div class="mb-3 text-5xl">{{ emptyArt }}</div>
              <h2 class="mb-2 text-lg text-fg-primary">{{ emptyTitle }}</h2>
              <p class="text-sm text-fg-secondary">{{ emptyDesc }}</p>
            </div>

            <template v-else>
              <TagGroupSection
                v-for="(s, i) in m.sections.value"
                :key="s.key"
                :section="s"
                :list-mode="m.layoutMode.value === 'list'"
                :selected-ids="m.selection.value"
                :keyword="m.keyword.value"
                :drag-ids="dragIds"
                :class="i > 0 ? 'section-gap' : ''"
                @select="onChipSelect"
                @open="jumpToTagFilter"
                @menu="openChipMenu"
                @add-tags="promptAddTagsToGroup"
                @save-description="m.setGroupDescription"
                @dragstart="onChipDragStart"
                @dragend="onChipDragEnd"
              />
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 拖拽计数徽标（Eagle #tag-manager-drag-badge） -->
    <div
      v-if="dragCount > 0"
      class="drag-badge"
      :style="{ left: `${dragPos.x}px`, top: `${dragPos.y}px` }"
    >
      {{ dragCount }}
    </div>

    <!-- 右键菜单渲染宿主（useContextMenu 是全局单例状态，本页必须自挂渲染件——
         photos 页同款；缺失时状态被设置但永不渲染，右键看似无效） -->
    <UContextMenu />
  </div>
</template>

<script setup lang="ts">
/**
 * 标签管理页（028 整页复刻 Eagle tag-manager；D-013 页化继承）
 *
 * 三栏壳子 = TitleBar + LibraryPanel（应用侧栏）+ [TagManagerSidebar | 内容区]；
 * 右区为 Eagle 群组分节形态：群组名 (计数) ＋ 描述行 + tag chip 网格，
 * 支持点选/框选/双击过滤/右键三菜单/拖拽入组/常用/排序。逻辑在 useTagManager。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TitleBar from '@components/shell/TitleBar.vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UContextMenu from '@components/ui/UContextMenu.vue'
import LibraryPanel from '@views/photos/components/LibraryPanel.vue'
import { useMarquee } from '@views/photos/composables/useMarquee'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { useContextMenu, type MenuItem } from '@composables/useContextMenu'
import { useDialogs } from '@views/photos/composables/useDialogs'
import TagManagerSidebar from './components/TagManagerSidebar.vue'
import TagGroupSection from './components/TagGroupSection.vue'
import { useTagManager } from './composables/useTagManager'
import type { TagSummary } from '../../types/photo'

const router = useRouter()
const tabs = useLibraryTabs()
const menu = useContextMenu()
const { requestPrompt } = useDialogs()

const m = useTagManager()

onMounted(() => {
  void m.load()
})

// ── 框选（Eagle tag-rect-select；复用 photos 的 useMarquee，条目 id 属性换 chipId） ──
const contentEl = ref<HTMLElement | null>(null)
const marquee = useMarquee({
  getContainer: () => contentEl.value,
  itemSelector: '[data-chip-id]',
  idAttribute: 'chipId',
  enabled: () => !m.loading.value,
  getBaseSelection: () => m.selection.value,
  onSelect: (ids) => m.setSelection(ids)
})

// ── 拖拽徽标 ──
const dragCount = ref(0)
const dragIds = ref<string[]>([])
const dragPos = ref({ x: 0, y: 0 })

function onChipDragStart(tag: TagSummary): void {
  // 载荷由 TagChip 写入 dataTransfer（点选拖拽整批带走）；徽标计数取当前选中集
  dragIds.value = m.selection.value.has(tag.id) ? [...m.selection.value] : [tag.id]
  dragCount.value = dragIds.value.length
}

function onChipDragEnd(): void {
  dragCount.value = 0
  dragIds.value = []
}

/** chip 点选 → 选中集（composable 收 TagSummary，委托给 clickSelect） */
function onChipSelect(
  tag: TagSummary,
  mods: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }
): void {
  m.clickSelect(tag.id, mods)
}

function onWindowDragOver(e: DragEvent): void {
  if (dragCount.value > 0) dragPos.value = { x: e.clientX + 12, y: e.clientY + 12 }
}

onMounted(() => window.addEventListener('dragover', onWindowDragOver))
onBeforeUnmount(() => window.removeEventListener('dragover', onWindowDragOver))

// ── 空态三变体（Eagle empty.tags / empty.allTags.done / empty.search） ──
const isSearchEmpty = computed(
  () => m.keyword.value.trim() !== '' && m.sections.value.every((s) => s.tags.length === 0)
)
const emptyArt = computed(() => (isSearchEmpty.value ? '🔍' : '🏷️'))
const emptyTitle = computed(() => {
  if (isSearchEmpty.value) return '没有找到相关标签'
  if (m.viewMode.value === 'unfiled' && m.tags.value.length > 0) return '太棒了！'
  return '没有标签'
})
const emptyDesc = computed(() => {
  if (isSearchEmpty.value) return '也许换个搜索规则就能找到它！'
  if (m.viewMode.value === 'unfiled' && m.tags.value.length > 0) return '所有标签都整理完成啦！'
  return '为项目添加标签，方便管理与查找。'
})

// ── 工具行 ──

function layoutBtnCls(mode: 'grid' | 'list'): string[] {
  return [
    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
    m.layoutMode.value === mode
      ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400'
      : 'text-fg-secondary hover:bg-surface-hover'
  ]
}

/** 排序菜单（Eagle openTagGroupListContextMenu 排序段） */
function openSortMenu(e: MouseEvent): void {
  menu.open(e.clientX, e.clientY, sortMenuItems(), (key) => applySortPick(key))
}

function sortMenuItems(): MenuItem[] {
  return [
    {
      key: 'name-asc',
      label: 'A > Z',
      checked: m.sortBy.value === 'name' && m.sortIncrease.value
    },
    {
      key: 'name-desc',
      label: 'Z > A',
      checked: m.sortBy.value === 'name' && !m.sortIncrease.value
    },
    {
      key: 'usage-asc',
      label: '使用数 高→低',
      checked: m.sortBy.value === 'usage' && !m.sortIncrease.value
    },
    {
      key: 'usage-desc',
      label: '使用数 低→高',
      checked: m.sortBy.value === 'usage' && m.sortIncrease.value
    }
  ]
}

function applySortPick(key: string): void {
  // Eagle 口径：usage 高→低 = imageCount + increase=false（数量大在前）
  if (key === 'name-asc') m.changeSort('name', true)
  else if (key === 'name-desc') m.changeSort('name', false)
  else if (key === 'usage-asc') m.changeSort('usage', false)
  else if (key === 'usage-desc') m.changeSort('usage', true)
}

/** 空白右键（Eagle openTagGroupListContextMenu：排序 + 分组方式▸） */
function onBlankMenu(e: MouseEvent): void {
  e.preventDefault()
  menu.open(
    e.clientX,
    e.clientY,
    [
      ...sortMenuItems(),
      { key: 'd1', divider: true },
      {
        key: 'groupby',
        label: '分组方式',
        children: [
          { key: 'groupby-alphabet', label: '按字母', checked: m.groupBy.value === 'alphabet' },
          { key: 'groupby-group', label: '按标签群组', checked: m.groupBy.value === 'group' }
        ]
      }
    ],
    (rawKey) => {
      // 子菜单回传 sub: 前缀归一化（同 handleMenuAction 口径）
      let key = rawKey
      if (key.startsWith('sub:groupby:')) key = key.slice('sub:groupby:'.length)
      if (key.startsWith('groupby-')) {
        m.groupBy.value = key === 'groupby-alphabet' ? 'alphabet' : 'group'
      } else {
        applySortPick(key)
      }
    }
  )
}

// ── chip 右键（Eagle openTagContextMenu 裁剪版） ──

function openChipMenu(tag: TagSummary, x: number, y: number): void {
  // Eagle：右键前先确保该 chip 在选中集（与点选语义一致）
  if (!m.selection.value.has(tag.id)) m.clickSelect(tag.id, {})
  const ids = [...m.selection.value]
  const isStarred = ids.every((id) => m.tags.value.find((t) => t.id === id)?.starred)
  const groupItems: MenuItem[] = m.groups.value.map((g) => ({
    key: `group:${g.id}`,
    label: g.name,
    checked: ids.every((id) => m.tags.value.find((t) => t.id === id)?.parentId === g.id)
  }))
  const items: MenuItem[] = [
    { key: 'filter', label: '用此标签筛选', icon: 'context-menu/ic-tag-filter' },
    { key: 'd1', divider: true },
    {
      key: 'star',
      label: isStarred ? '取消常用' : '设为常用',
      icon: isStarred ? 'context-menu/ic-tag-unstar' : 'context-menu/ic-tag-star'
    },
    { key: 'rename', label: '重命名', icon: 'context-menu/ic-rename', disabled: ids.length > 1 },
    { key: 'd2', divider: true },
    {
      key: 'move-group',
      label: '移动到群组',
      icon: 'context-menu/ic-tag-move',
      children:
        groupItems.length > 0
          ? groupItems
          : [{ key: '__none', label: '（暂无群组）', disabled: true }]
    },
    {
      key: 'remove-group',
      label: '从群组移除',
      icon: 'context-menu/ic-tag-remove-group',
      disabled: !ids.some((id) => m.tags.value.find((t) => t.id === id)?.parentId)
    },
    { key: 'd3', divider: true },
    { key: 'delete', label: '删除', icon: 'context-menu/ic-tag-delete', danger: true }
  ]
  menu.open(x, y, items, (rawKey) => {
    // UContextMenu 子菜单回传 `sub:<父项>:<子项>`（photos 同款归一化，见 handleMenuAction）
    let key = rawKey
    if (key.startsWith('sub:move-group:')) key = key.slice('sub:move-group:'.length)
    if (key === 'filter') {
      jumpToTagFilter(tag)
    } else if (key === 'star') {
      void m.setStarred(ids, !isStarred)
    } else if (key === 'rename') {
      promptRename(ids)
    } else if (key.startsWith('group:')) {
      void m.moveTagsToGroup(ids, key.slice('group:'.length))
    } else if (key === 'remove-group') {
      void m.moveTagsToGroup(ids, null)
    } else if (key === 'delete') {
      m.deleteTags(ids)
    }
  })
}

function promptRename(ids: string[]): void {
  if (ids.length !== 1) return
  const tag = m.tags.value.find((t) => t.id === ids[0])
  requestPrompt({
    title: '重命名标签',
    label: '新名称',
    initialValue: tag?.name ?? '',
    confirmLabel: '重命名',
    onSubmit: async (name) => {
      await m.renameTag(ids[0]!, name)
    }
  })
}

/** 新建标签（顶层；Eagle 标签主要经素材侧产生，这里保留 Leaf 直建入口） */
function promptCreateTag(): void {
  requestPrompt({
    title: '新建标签',
    label: '标签名称',
    initialValue: '',
    confirmLabel: '新建',
    onSubmit: async (name) => {
      await m.createTag(name)
    }
  })
}

/** 向群组添加标签（Eagle addGroupTags：新建即入组） */
function promptAddTagsToGroup(groupId: string): void {
  const group = m.groups.value.find((g) => g.id === groupId)
  requestPrompt({
    title: `添加标签到「${group?.name ?? '群组'}」`,
    label: '标签名称',
    initialValue: '',
    confirmLabel: '添加',
    onSubmit: async (name) => {
      await m.createTag(name, groupId)
    }
  })
}

/** 批量条「移动到群组…」菜单 */
function openBatchMoveMenu(e: MouseEvent): void {
  const ids = [...m.selection.value]
  if (ids.length === 0) return
  const groupItems: MenuItem[] = m.groups.value.map((g) => ({
    key: `group:${g.id}`,
    label: g.name
  }))
  menu.open(
    e.clientX,
    e.clientY,
    [
      {
        key: 'move',
        label: '移动到群组',
        children:
          groupItems.length > 0
            ? groupItems
            : [{ key: '__none', label: '（暂无群组）', disabled: true }]
      }
    ],
    (rawKey) => {
      let key = rawKey
      if (key.startsWith('sub:move:')) key = key.slice('sub:move:'.length)
      if (key.startsWith('group:')) void m.moveTagsToGroup(ids, key.slice('group:'.length))
    }
  )
}

/** 双击 chip = 跳素材库按该标签过滤（Eagle openTag） */
function jumpToTagFilter(tag: TagSummary): void {
  tabs.setView('all', '全部')
  tabs.tab.tagFilter = [tag.name]
  router.push('/photos').catch(() => {
    /* 已在图库 */
  })
}
</script>

<style scoped>
.toolbar-btn {
  display: flex;
  height: 28px;
  width: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--fg-secondary);
}

.toolbar-btn:hover {
  background-color: var(--surface-hover);
  color: var(--fg-primary);
}

/* Eagle 列表模式由 TagGroupSection 的 listMode prop 承担 */

.section-gap {
  margin-top: 4px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 96px;
  text-align: center;
}

.drag-badge {
  position: fixed;
  z-index: 9999;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 48px;
  background-color: var(--danger, #ef4444);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
  pointer-events: none;
}
</style>
