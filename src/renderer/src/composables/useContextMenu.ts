/**
 * Leaf · 右键菜单状态（D-008，模块单例）
 *
 * open(x, y, items, onPick) 打开；UContextMenu.vue 负责渲染与键盘交互。
 * 菜单项支持 divider 与 danger；键盘 ↑↓ 移动 / Enter 确认 / Esc 关闭。
 */
import { ref } from 'vue'

export interface MenuItem {
  /** 稳定键；divider 项可为空串 */
  key: string
  label?: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  /** 右对齐快捷键提示（Eagle 菜单 ⌘⇧N 形态） */
  shortcut?: string
  /** 色点行（Eagle 文件夹菜单的文件夹颜色）：渲染为一排圆点 */
  colors?: Array<{ key: string; hex: string }>
  /** 星级行（Eagle 卡片菜单的评分）：单行 5 颗星，点第 N 颗以既有 `rate-N` 约定回调；
   *  值 = 当前评分（多选评分不一致时传 0，即全部空心） */
  stars?: number
  /** 二级子菜单（Eagle 密码保护▸/排列▸/移动文件夹▸ 等箭头项），hover 弹出 */
  children?: MenuItem[]
  /** 子菜单以网格排布（Eagle 文件夹图标▸ 的 emoji 网格），children 需非空 */
  grid?: boolean
  /** 渲染为分隔线（其余字段忽略） */
  divider?: boolean
}

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
  onPick: (key: string) => void
  /** 六轮：菜单顶部搜索框（Eagle 卡片右键菜单形态），按 label 过滤 */
  searchable?: boolean
}

const state = ref<MenuState | null>(null)

export function useContextMenu(): {
  state: typeof state
  open: (
    x: number,
    y: number,
    items: MenuItem[],
    onPick: (key: string) => void,
    opts?: { searchable?: boolean }
  ) => void
  close: () => void
} {
  function open(
    x: number,
    y: number,
    items: MenuItem[],
    onPick: (key: string) => void,
    opts?: { searchable?: boolean }
  ): void {
    state.value = { x, y, items, onPick, searchable: opts?.searchable }
  }

  function close(): void {
    state.value = null
  }

  return { state, open, close }
}
