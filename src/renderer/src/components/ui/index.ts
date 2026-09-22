<script setup lang="ts">
/**
 * UContextMenu · 右键菜单（D-008）
 * - Fluent 风格：rounded-lg + shadow-md + fast 动效
 * - 视口边缘自动翻转定位
 * - 键盘：↑↓ 移动 / Enter 确认 / Esc 关闭
 * 状态源见 composables/useContextMenu.ts（模块单例）
 * 二十四轮：二级子菜单（Eagle 密码保护/排列/移动文件夹/导出 等箭头项，
 * hover 父项弹出飞出面板，越界向左翻转）；色点行；快捷键提示。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useContextMenu, type MenuItem } from '../../composables/useContextMenu'

const { state, close } = useContextMenu()

const panelRef = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const activeIndex = ref(-1)
/** 六轮：菜单搜索（Eagle 卡片右键菜单顶部搜索框） */
const query = ref('')

// ── 二级子菜单（二十四轮）──
interface SubmenuState {
  parent: MenuItem
  parentKey: string
  items: MenuItem[]
  x: number
  y: number
}
const submenu = ref<SubmenuState | null>(null)
const submenuRef = ref<HTMLElement | null>(null)
const SUB_W = 200
/** 网格子菜单（emoji 图标）宽度 */
const SUB_GRID_W = 248

function subWidth(): number {
  return submenu.value?.parent.grid ? SUB_GRID_W : SUB_W
}

/** 过滤后仍应渲染的项（含分隔线——两侧至少一侧可见才渲染） */
function visibleItems(): Array<{ item: MenuItem; index: number }> {
  const s = state.value
  if (!s) return []
  const q = query.value.trim().toLowerCase()
  const all = s.items
  if (!s.searchable || !q) return all.map((item, index) => ({ item, index }))
  const match = (it: MenuItem): boolean => !it.divider && (it.label ?? '').toLowerCase().includes(q)
  return all
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => {
      if (item.divider) {
        const prev = all[index - 1]
        const next = all[index + 1]
        return Boolean(prev && next && match(prev) && match(next))
      }
      return match(item)
    })
}

=== ui index exports ===
/**
 * UI 组件库 · barrel 导出
 *
 * 设计语言：Raycast/Linear（深色优先 · 分层表面 · 描边划界 · 玻璃拟态）
 * 全部组件基于 tokens.css v2，禁止在业务代码中绕过 token 写死颜色。
 *
 * 用法：
 *   import { UButton, UModal, useToast } from '@components/ui'
 */
export { default as UButton } from './UButton.vue'
export { default as UInput } from './UInput.vue'
export { default as USwitch } from './USwitch.vue'
export { default as UCheckbox } from './UCheckbox.vue'
export { default as UBadge } from './UBadge.vue'
export { default as USkeleton } from './USkeleton.vue'
export { default as UEmpty } from './UEmpty.vue'
export { default as UModal } from './UModal.vue'
export { default as UTooltip } from './UTooltip.vue'
export { default as USelect } from './USelect.vue'
export { default as UProgress } from './UProgress.vue'
export { default as UToastProvider } from './UToastProvider.vue'
export { default as UTabs } from './UTabs.vue'
export { default as UDrawer } from './UDrawer.vue'
export { default as UContextMenu } from './UContextMenu.vue'
export { default as UPromptModal } from './UPromptModal.vue'

export { useContextMenu } from '../../composables/useContextMenu'
export type { MenuItem } from '../../composables/useContextMenu'

export { useToast, dismiss as dismissToast } from '../../composables/useToast'
export type { ToastItem } from '../../composables/useToast'
