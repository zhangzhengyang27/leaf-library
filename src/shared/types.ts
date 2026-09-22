/**
 * Shared types for renderer ↔ main IPC payload shapes.
 * 这里放 cross-process 通用类型；具体 module 的私有类型留在各自 store / repository。
 */

/** 一条工作日志 */
export interface LogEntry {
  ts: number
  level: 'info' | 'warn' | 'error'
  scope: string
  msg: string
  stack?: string
}

export interface LogExportPayload {
  entries: LogEntry[]
  meta: {
    platform: NodeJS.Platform
    arch: string
    appVersion: string
    exportedAt: number
  }
}

/**
 * 上报模式：
 * - 'off'   : 只保留内存 ring buffer；不落库、不写文件
 * - 'local' : 当前默认，落 log_entries + 磁盘 .log 文件，可导出
 * - 'remote': 在 local 基础上，预留远程上报通道（1.0 不实现，仅 stub）
 *
 * 用户在 Settings → 「日志 / 反馈」里切换；持久化到 pref_preferences。
 */
export type TelemetryMode = 'off' | 'local' | 'remote'
