/**
 * Leaf · Update types（renderer + main 共用）
 *
 * 放在 renderer 端，因为：
 * 1. 渲染端需要 import 类型做 UI 状态管理
 * 2. 主进程通过 import { UpdateStatus } from '../../renderer/src/types/update' 复用
 *
 * 字段含义见 src/main/services/AutoUpdateService.ts UpdateEvent。
 */

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

export interface UpdateEvent {
  status: UpdateStatus
  version?: string
  releaseNotes?: string | null
  progress?: UpdateProgress
  error?: string
}
