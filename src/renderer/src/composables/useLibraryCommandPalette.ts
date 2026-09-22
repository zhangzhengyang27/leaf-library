/**
 * Leaf 素材库 · 命令面板状态（D-011 审查修复）
 *
 * 模块级单例：TitleBar（🔍 按钮）与 photos 视图共享同一份显隐状态。
 * ⌘K 监听由 LibraryCommandPalette 组件自己挂（全局可用，含 settings/about）。
 */
import { ref } from 'vue'

const isOpen = ref(false)

export function useLibraryCommandPalette(): {
  isOpen: typeof isOpen
  open: () => void
  close: () => void
  toggle: () => void
} {
  function open(): void {
    isOpen.value = true
  }
  function close(): void {
    isOpen.value = false
  }
  function toggle(): void {
    isOpen.value = !isOpen.value
  }
  return { isOpen, open, close, toggle }
}
