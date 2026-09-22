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
