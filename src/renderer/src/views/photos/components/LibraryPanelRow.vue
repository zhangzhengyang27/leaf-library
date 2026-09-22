<script setup lang="ts">
/**
 * LibraryPanelRow · 侧栏树行（LibraryPanel 内部组件）
 * 圆角填充 pill 活动态（Edge 风）；可选徽标计数与色点；拖拽落点高亮；
 * G7：可折叠行（文件夹树）左缘 ▸/▾ 折叠箭头，对齐 Eagle 逐行折叠。
 * Eagle 4.0 .sidebar-item 实测：高 26px；margin 0 12px 1px；padding 0 6px 0 4px；
 * 圆角 6px；文字 13px / text-fg-primary；hover = 5% 反色层（bg-surface-hover）。
 * 二十一轮修复：<button> 在 Chromium 下 display:flex 不撑满父宽 → 外层 div 承担
 * margin（Eagle 0 12px）与缩进，按钮 w-full 撑满；折叠箭头绝对定位于行左缘
 * （Eagle：箭头在图标列外侧的 gutter，不挤占行内布局）。
 * 二十四轮：editing 态（Eagle 新建/重命名文件夹的行内输入框——自动聚焦全选，
 * Enter/失焦提交、ESC 取消；编辑中不渲染按钮，避免 input 嵌进 button）。
 */
import { ref, watch } from 'vue'
import AppIcon from '@components/AppIcon.vue'

interface RowItem {
  key: string
  view: string
  title: string
  icon: string
  count?: number
  color?: string | null
  /** 为 true 时用 color 给图标染色（如文件夹）；为 false/缺省则 color 仅渲染为色点（如标签） */
  tintIcon?: boolean
  /** 二十四轮：emoji 图标（Eagle 文件夹图标，存在时替代图形图标） */
  emoji?: string
}

const props = defineProps<{
  item: RowItem
  active: boolean
  indent?: boolean
  count?: number
  dropTarget?: boolean
  dragOver?: boolean
  /** R5 文件夹封面缩略图（存在时替代图标） */
  coverUrl?: string
  /** G7：该行有子级（渲染折叠箭头） */
  expandable?: boolean
  /** G7：当前是否展开 */
  expanded?: boolean
  /** 四轮：树深度（>0 渲染 Eagle 式缩进参考线） */
  depth?: number
  /** 二十四轮：行内重命名编辑态 */
  editing?: boolean
}>()

const emit = defineEmits<{
  open: [e: MouseEvent]
  'open-aux': [e: MouseEvent]
  contextmenu: [e: MouseEvent]
  'toggle-expand': [e: MouseEvent]
  'drag-over': [e: DragEvent]
  'drag-leave': [e: DragEvent]
  drop: [e: DragEvent]
  /** 二十四轮：提交（Enter/失焦），载荷为输入值 */
  'edit-commit': [value: string]
  /** 二十四轮：取消（ESC） */
  'edit-cancel': []
}>()

// ── 行内编辑：进入时预填原名并全选（Eagle 直接输入即覆盖）；
// immediate：新建文件夹的行首次挂载即处于编辑态，也要预填。
// editDone 只在进入编辑时复位——退出（editing→false）后输入框卸载引发的
// blur 不得再次提交（否则 Enter 提交 + 失焦提交双重触发）──
const draft = ref('')
const editDone = ref(false)
watch(
  () => props.editing,
  (on) => {
    if (on) {
      editDone.value = false
      draft.value = props.item.title
    }
  },
  { immediate: true }
)

function finish(kind: 'commit' | 'cancel'): void {
  if (editDone.value) return
  editDone.value = true
  if (kind === 'commit') emit('edit-commit', draft.value)
  else emit('edit-cancel')
}

/** 指针离开「整行」才算离开：行内有折叠箭头/图标/标题/徽章等子节点，
 *  拖拽时跨它们的边界会不断冒泡 dragleave，不加这层守卫高亮在真实拖动里
 *  会被立刻清掉（合成事件只派 dragover 时看不出来） */
function onRowDragLeave(e: DragEvent): void {
  if (!props.dropTarget) return
  const row = e.currentTarget as HTMLElement | null
  const next = e.relatedTarget as Node | null
  if (row && next && row.contains(next)) return
  emit('drag-leave', e)
}

/** Eagle：进入编辑即聚焦并全选 */
const vEditFocus = {
  mounted: (el: HTMLInputElement): void => {
    el.focus()
    el.select()
  }
}
</script>

<template>
  <div class="relative mx-3 mb-px" :class="[indent ? 'pl-5' : '']">
    <!-- 四轮：缩进参考线（对齐 Eagle 文件夹树连接线；缩进 = depth*16） -->
    <span
      v-if="(depth ?? 0) > 0"
      class="pointer-events-none absolute inset-y-1 border-l border-line-subtle"
      :style="{ left: `${Math.max((depth ?? 0) * 16 - 4, 0)}px` }"
      aria-hidden="true"
    />
    <!-- 二十四轮：行内重命名（Eagle 新建/重命名文件夹——输入框替换整行，Enter/失焦提交、ESC 取消） -->
    <div
      v-if="editing"
      class="flex h-[26px] w-full items-center gap-2 rounded-[6px] bg-surface-active pl-1 pr-1.5"
    >
      <img v-if="coverUrl" :src="coverUrl" class="size-5 shrink-0 rounded-sm object-cover" alt="" />
      <span v-else-if="item.emoji" class="shrink-0 text-[13px] leading-none">{{ item.emoji }}</span>
      <AppIcon
        v-else-if="item.icon"
        :icon="item.icon"
        :color="item.color && item.tintIcon ? item.color : undefined"
        class="shrink-0"
      />
      <input
        v-model="draft"
        v-edit-focus
        type="text"
        class="h-5 min-w-0 flex-1 rounded-[3px] border border-[#3478f6] bg-white px-1.5 text-[13px] leading-none text-[#111] caret-[#3478f6] focus:outline-none"
        data-rename-input
        aria-label="文件夹名称"
        @click.stop
        @contextmenu.stop
        @keyup.enter="finish('commit')"
        @keyup.esc="finish('cancel')"
        @blur="finish('commit')"
        @dragover.stop
        @drop.stop
      />
    </div>
    <button
      v-else
      type="button"
      class="group/row relative flex h-[26px] w-full items-center gap-2 rounded-[6px] pl-1 pr-1.5 text-left transition-all duration-fast outline-none"
      :class="[
        active
          ? 'bg-surface-active text-fg-primary font-medium'
          : 'text-fg-secondary hover:bg-surface-hover hover:text-fg-primary',
        dragOver ? 'ring-2 ring-brand-500' : ''
      ]"
      :data-drop-target="dropTarget"
      @click="emit('open', $event)"
      @auxclick="emit('open-aux', $event)"
      @contextmenu.prevent="emit('contextmenu', $event)"
      @dragover="dropTarget && emit('drag-over', $event)"
      @dragleave="onRowDragLeave"
      @drop="dropTarget && emit('drop', $event)"
    >
      <!-- G7：折叠箭头（Eagle：行左缘 gutter 内 ▸/▾，绝对定位不挤占图标列） -->
      <span
        v-if="expandable"
        role="button"
        :aria-label="expanded ? '折叠' : '展开'"
        class="absolute -left-[15px] flex size-4 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary"
        @click.stop.prevent="emit('toggle-expand', $event)"
      >
        <AppIcon icon="ic-arrow-right" :size="12" :class="expanded ? 'rotate-90' : ''" />
      </span>
      <span
        v-if="item.color && !item.tintIcon"
        class="size-2.5 shrink-0 rounded-full border border-black/10"
        :style="{ backgroundColor: item.color }"
      />
      <img v-if="coverUrl" :src="coverUrl" class="size-5 shrink-0 rounded-sm object-cover" alt="" />
      <!-- 二十四轮：emoji 文件夹图标优先于图形图标 -->
      <span v-else-if="item.emoji" class="shrink-0 text-[13px] leading-none">{{ item.emoji }}</span>
      <AppIcon
        v-else-if="item.icon && !(item.color && !item.tintIcon)"
        :icon="item.icon"
        :color="item.color && item.tintIcon ? item.color : undefined"
        class="shrink-0"
      />
      <span class="min-w-0 flex-1 truncate text-[13px] leading-none">{{ item.title }}</span>
      <span
        v-if="(count ?? item.count) !== undefined && (count ?? item.count)! > 0"
        class="shrink-0 text-[12px] tabular-nums"
        :class="active ? 'text-fg-primary' : 'text-fg-muted'"
      >
        {{ count ?? item.count }}
      </span>
    </button>
  </div>
</template>
