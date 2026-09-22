import { reactive } from 'vue'

/**
 * useToast · 命令式 Toast（全局单例队列）
 *
 * 用法：
 *   const toast = useToast()
 *   toast.success('已保存')
 *   toast.error('导出失败', { description: '磁盘已满' })
 *   const id = toast.loading('上传中…'); toast.dismiss(id)
 *
 * 渲染端需在 AppShell 挂 <UToastProvider />。
 */
export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: number
  kind: 'success' | 'error' | 'info' | 'warning' | 'loading'
  title: string
  description?: string
  /** 存活时长 ms；0 = 手动关闭 */
  duration: number
  /** 可选动作按钮（如「撤销」） */
  action?: ToastAction
}

interface ToastOptions {
  description?: string
  duration?: number
  action?: ToastAction
}

const state = reactive<{ items: ToastItem[] }>({ items: [] })

let seq = 1

function push(
  kind: ToastItem['kind'],
  title: string,
  opts?: ToastOptions,
  defaultDuration = 3000
): number {
  const id = seq++
  const duration = opts?.duration ?? defaultDuration
  state.items.push({
    id,
    kind,
    title,
    description: opts?.description,
    duration,
    action: opts?.action
  })
  if (duration > 0) {
    window.setTimeout(() => dismiss(id), duration)
  }
  return id
}

export function dismiss(id: number): void {
  const i = state.items.findIndex((t) => t.id === id)
  if (i >= 0) state.items.splice(i, 1)
}

export interface ToastApi {
  items: ToastItem[]
  success: (title: string, opts?: ToastOptions) => number
  error: (title: string, opts?: ToastOptions) => number
  warning: (title: string, opts?: ToastOptions) => number
  info: (title: string, opts?: ToastOptions) => number
  loading: (title: string, opts?: ToastOptions) => number
  dismiss: (id: number) => void
}

export function useToast(): ToastApi {
  return {
    items: state.items,
    success: (t: string, o?: ToastOptions) => push('success', t, o),
    error: (t: string, o?: ToastOptions) => push('error', t, o, 4500),
    warning: (t: string, o?: ToastOptions) => push('warning', t, o, 4000),
    info: (t: string, o?: ToastOptions) => push('info', t, o),
    loading: (t: string, o?: ToastOptions) => push('loading', t, o, 0),
    dismiss
  }
}
