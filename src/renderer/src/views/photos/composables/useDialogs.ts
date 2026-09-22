/**
 * Leaf 素材库 · 应用内确认框 + 输入框（D-008 重构）
 *
 * 替代原生 confirm/prompt（BUGS.md B18 延续）；由 photo 视图挂载
 * ConfirmDialogModal / PromptDialogModal 渲染，任意 composable 可调用。
 */
import { ref } from 'vue'
import { useToast } from '@composables/useToast'

// ── 确认框 ──

export interface ConfirmRequest {
  title: string
  body: string
  confirmLabel: string
  /** 可选勾选框（Eagle 删除文件夹的「把文件夹内项目丢到回收站」），勾选值回传给 action */
  checkbox?: { label: string; checked: boolean }
  action: (checked: boolean) => Promise<void>
}

const pendingConfirm = ref<ConfirmRequest | null>(null)
const confirming = ref(false)
/** 确认框勾选框的当前值（无勾选框时恒 false）；单独成 ref 让模板绑定不必穿透 null */
const confirmChecked = ref(false)

function requestConfirm(
  title: string,
  body: string,
  confirmLabel: string,
  action: (checked: boolean) => Promise<void>,
  checkbox?: ConfirmRequest['checkbox']
): void {
  confirmChecked.value = checkbox?.checked ?? false
  pendingConfirm.value = { title, body, confirmLabel, action, checkbox }
}

/**
 * 代码审查 P1：action 抛错不再静默——旧实现异常冒泡成未处理 rejection
 * （切库失败等场景用户完全无感），现在统一捕获并 toast。
 */
async function runConfirmed(): Promise<void> {
  const req = pendingConfirm.value
  if (!req) return
  confirming.value = true
  try {
    await req.action(confirmChecked.value)
  } catch (error) {
    console.error('[dialogs] confirm action failed:', error)
    useToast().error('操作失败', { description: (error as Error).message })
  } finally {
    confirming.value = false
    pendingConfirm.value = null
  }
}

// ── 输入框（替代 window.prompt）──

export interface PromptRequest {
  title: string
  label: string
  initialValue: string
  confirmLabel: string
  onSubmit: (value: string) => Promise<void>
}

const pendingPrompt = ref<PromptRequest | null>(null)

function requestPrompt(req: Omit<PromptRequest, 'confirmLabel'> & { confirmLabel?: string }): void {
  pendingPrompt.value = { confirmLabel: '确定', ...req }
}

export function useDialogs(): {
  pendingConfirm: typeof pendingConfirm
  confirmChecked: typeof confirmChecked
  confirming: typeof confirming
  requestConfirm: typeof requestConfirm
  runConfirmed: typeof runConfirmed
  pendingPrompt: typeof pendingPrompt
  requestPrompt: typeof requestPrompt
} {
  return {
    pendingConfirm,
    confirmChecked,
    confirming,
    requestConfirm,
    runConfirmed,
    pendingPrompt,
    requestPrompt
  }
}
