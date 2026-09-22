/**
 * Leaf · LogService（主进程）
 *
 * 用途：
 * - 内存 ring buffer 保存最近 500 条日志
 * - 错误日志立即 flush 到磁盘，便于"反馈问题"按钮打包
 * - 用户手动触发的 export 把整段 buffer 写成 zip 或 json
 *
 * 注意：本文件仅被主进程 require，**不要**被渲染进程 import。
 */

import { app } from 'electron'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { LogEntry, LogExportPayload, TelemetryMode } from '../../shared/types'
import { database } from '../db/database'

const MAX_INMEM = 500
const FLUSH_THRESHOLD = 50
const LOG_RETENTION = 10000 // log_entries 保留最多 10000 行
const TELEMETRY_KEY = 'telemetry_mode'

class LogService {
  private buffer: LogEntry[] = []
  private unflushed: LogEntry[] = []
  private diskDir: string | null = null
  /** 当前上报模式；默认 'local'，从 pref_preferences 覆盖。 */
  private mode: TelemetryMode = 'local'

  /** 从 pref_preferences 读 telemetry_mode 并覆盖默认值。必须在 installDatabase() 之后调一次。 */
  loadTelemetryMode(): TelemetryMode {
    try {
      const v = database.handle
        .prepare('SELECT value FROM pref_preferences WHERE key = ?')
        .get(TELEMETRY_KEY) as { value: string } | undefined
      if (v && (v.value === 'off' || v.value === 'local' || v.value === 'remote')) {
        this.mode = v.value
      }
    } catch {
      // db 没就绪 / 没值：保持默认 'local'
    }
    return this.mode
  }

  /** 当前模式（用于 UI 显示） */
  getMode(): TelemetryMode {
    return this.mode
  }

  /** 设置模式并立即持久化。 */
  setMode(m: TelemetryMode): void {
    this.mode = m
    try {
      database.handle
        .prepare(
          `INSERT INTO pref_preferences (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .run(TELEMETRY_KEY, m, Date.now())
    } catch (e) {
      // db 没就绪：内存先记，下次启动再落库
      console.warn('[LogService] persist telemetry_mode failed:', (e as Error).message)
    }
  }

  /**
   * 是否需要把日志落库 / 落盘。
   * 'off' 时只留内存 ring buffer（最多 500 条），重启即清空；
   * 'remote' 走 local 全部路径 + 未来调 sendToRemote()（1.0 不实现）。
   */
  private shouldPersist(): boolean {
    return this.mode === 'local' || this.mode === 'remote'
  }

  private ensureDiskDir(): string {
    if (this.diskDir) return this.diskDir
    const dir = join(app.getPath('userData'), 'logs')
    this.diskDir = dir
    return dir
  }

  log(level: LogEntry['level'], scope: string, msg: string, error?: unknown): void {
    const entry: LogEntry = {
      ts: Date.now(),
      level,
      scope,
      msg,
      stack: error instanceof Error ? error.stack : undefined
    }
    this.buffer.push(entry)
    if (this.buffer.length > MAX_INMEM) {
      this.buffer = this.buffer.slice(-MAX_INMEM)
    }

    // off 模式：上面 ring buffer 照填（便于用户切回 local 时仍有最近 500 条），
    // 但不落库 / 不写磁盘
    if (!this.shouldPersist()) return

    // error / warn 落库
    if (level === 'error' || level === 'warn') {
      this.persistToDb(entry)
    }

    if (level === 'error') {
      this.unflushed.push(entry)
      if (this.unflushed.length >= FLUSH_THRESHOLD) {
        void this.flushToDisk()
      } else {
        void this.flushToDisk()
      }
    }

    if (level === 'error' || level === 'warn') {
      void this.pruneOldLogs()
    }
  }

  /**
   * 把单条日志写到 log_entries（同步，失败不抛）。
   * db 未就绪时静默跳过——主进程启动早期（installDatabase() 之前）的日志不能阻塞启动。
   */
  private persistToDb(entry: LogEntry): void {
    const db = database.maybeHandle
    if (!db) return
    try {
      db.prepare(
        'INSERT INTO log_entries (ts, level, scope, msg, stack, meta_json) VALUES (?, ?, ?, ?, ?, NULL)'
      ).run(entry.ts, entry.level, entry.scope, entry.msg, entry.stack ?? null)
    } catch (e) {
      // 落库失败不应阻塞日志主流程；只在 console 留痕
      console.warn('[LogService] persistToDb failed:', (e as Error).message)
    }
  }

  /**
   * 截断过期的 log_entries；按 ts 升序删到只剩 LOG_RETENTION 行。
   * 每次写完后异步调用一次，廉价、低频。
   */
  private async pruneOldLogs(): Promise<void> {
    const db = database.maybeHandle
    if (!db) return
    try {
      // 用 SQL 直接算溢出量，避免每次 COUNT 一次
      const overflowRow = db
        .prepare(
          `SELECT MAX(c) - ? AS overflow FROM (
             SELECT COUNT(*) AS c FROM log_entries
           )`
        )
        .get(LOG_RETENTION) as { overflow: number | null }
      const overflow = overflowRow.overflow ?? 0
      if (overflow <= 0) return
      db.prepare(
        `DELETE FROM log_entries WHERE id IN (
           SELECT id FROM log_entries ORDER BY ts ASC LIMIT ?
         )`
      ).run(overflow)
    } catch (e) {
      console.warn('[LogService] pruneOldLogs failed:', (e as Error).message)
    }
  }

  info(scope: string, msg: string): void {
    this.log('info', scope, msg)
  }
  warn(scope: string, msg: string, error?: unknown): void {
    this.log('warn', scope, msg, error)
  }
  error(scope: string, msg: string, error?: unknown): void {
    this.log('error', scope, msg, error)
  }

  /** 把 unflushed 错误写到磁盘，单文件 append */
  private async flushToDisk(): Promise<void> {
    if (this.unflushed.length === 0) return
    const batch = this.unflushed.slice()
    this.unflushed = []
    try {
      const dir = this.ensureDiskDir()
      await mkdir(dir, { recursive: true })
      const file = join(dir, `${new Date().toISOString().slice(0, 10)}.log`)
      const lines = batch.map((e) => JSON.stringify(e)).join('\n') + '\n'
      await writeFile(file, lines, { flag: 'a' })
    } catch (e) {
      // 写不进磁盘不应该让应用崩；只在内存留痕
      console.error('[LogService] flushToDisk failed', e)
    }
  }

  /** 用户触发：导出为 json。即便 telemetryMode='off' 也允许（用户主动行为不受模式限制） */
  async export(): Promise<string> {
    await this.flushToDisk()
    const payload: LogExportPayload = {
      entries: this.buffer.slice(),
      meta: {
        platform: process.platform,
        arch: process.arch,
        appVersion: app.getVersion(),
        exportedAt: Date.now()
      }
    }
    const dir = this.ensureDiskDir()
    const file = join(dir, `export-${Date.now()}.json`)
    await writeFile(file, JSON.stringify(payload, null, 2), { flag: 'w' })
    return file
  }

  /** 内存里的最近 N 条 */
  recent(n = 100): LogEntry[] {
    return this.buffer.slice(-n)
  }
}

export const log = new LogService()

/** 主进程全局兜底（接 uncaughtException / unhandledRejection） */
export function installGlobalLogHandlers(): void {
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', err.message, err)
  })
  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', String(reason), reason)
  })
}
