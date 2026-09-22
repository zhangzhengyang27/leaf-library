/**
 * Leaf · 全局模块快捷键（⌘1-9 / Ctrl+1-9）
 *
 * 来源：docs/IA.md「P3 全局快捷键直达」
 * - Mac: ⌘1-9
 * - Win/Linux: Ctrl+1-9
 * - 9 模块顺序见 constants/modules.ts MODULES 数组
 *
 * 注意：
 * - 只在输入框（input / textarea / contentEditable）外触发
 * - 其它 app 已经注册的快捷键不抢
 * - 统一当前窗口内 router.push（v4：不再新开窗口）
 */

import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MODULES } from '../constants/modules'

function isMetaOrCtrl(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function useModuleShortcuts(): void {
  const router = useRouter()

  const onKeyDown = (e: KeyboardEvent): void => {
    // 仅 ⌘/Ctrl + 数字 1-9
    if (!isMetaOrCtrl(e)) return
    if (e.altKey || e.shiftKey) return
    if (isTypingTarget(e.target)) return

    const key = e.key
    if (key < '1' || key > '9') return

    const idx = parseInt(key, 10) - 1
    const m = MODULES[idx]
    if (!m) return

    e.preventDefault()
    // 代码审查 P2：usage.recordUse 为死通道（主进程无 handler），删除
    router.push(m.path)
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
  })
}
