/**
 * Leaf 素材库 · 壳层 UI 全局状态（D-008 Edge 化）
 *
 * 模块级单例：TitleBar（☰ 开关）与 photos 视图（LibraryPanel 显隐）共享。
 */
import { ref } from 'vue'

const PANEL_KEY = 'leaf.library-panel-visible'
const FILTERBAR_KEY = 'leaf.filterbar-visible'

function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return raw !== '0'
  } catch {
    return fallback
  }
}

const panelVisible = ref(loadFlag(PANEL_KEY, true))
// 十八轮：Eagle 无筛选 chips 行，默认关闭（⌘⇧F 可切换）
const filterBarVisible = ref(loadFlag(FILTERBAR_KEY, false))

function togglePanel(): void {
  panelVisible.value = !panelVisible.value
  try {
    localStorage.setItem(PANEL_KEY, panelVisible.value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function toggleFilterBar(): void {
  filterBarVisible.value = !filterBarVisible.value
  try {
    localStorage.setItem(FILTERBAR_KEY, filterBarVisible.value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function useLibraryUI(): {
  panelVisible: typeof panelVisible
  togglePanel: typeof togglePanel
  filterBarVisible: typeof filterBarVisible
  toggleFilterBar: typeof toggleFilterBar
} {
  return { panelVisible, togglePanel, filterBarVisible, toggleFilterBar }
}
