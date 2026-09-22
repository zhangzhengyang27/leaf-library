/**
 * Leaf · BackupSchedulerService（F16：库定时自动备份，对齐 Eagle 备份体系）
 *
 * - 备份目标：<库>/backups/leaf-backup-<ts>.db（legacy 库落 userData/backups/）
 * - better-sqlite3 db.backup() 在线备份：运行中事务安全，不阻塞素材操作
 * - 到期检查：注册时 + 每小时定时（启动 30s 后首查，不拖慢启动）
 * - 保留份数：默认 10，超出按 mtime 旧→新删除（utils/backupRetention）
 * - 配置存 pref_preferences：backup:auto-enabled / backup:interval-days /
 *   backup:keep / backup:last-at
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { database } from '../db/database'
import { activeRoot } from '../modules/libraryRegistry'
import { prefRepository } from '../db/repos/PrefRepository'
import type { PrefRepository } from '../db/repos/PrefRepository'
import { selectBackupsToDelete } from '../utils/backupRetention'
import { NotificationService } from './NotificationService'

const K_ENABLED = 'backup:auto-enabled'
const K_INTERVAL = 'backup:interval-days'
const K_KEEP = 'backup:keep'
const K_LAST = 'backup:last-at'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 每小时检查到期
const DAY_MS = 24 * 60 * 60 * 1000

export interface BackupConfig {
  enabled: boolean
  intervalDays: number
  keep: number
  lastAt: number | null
  dir: string
}

export class BackupSchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null
  /** 首查延迟句柄（防频繁开关备份时窗口期堆积） */
  private bootTimer: ReturnType<typeof setTimeout> | null = null
  /** 互斥：手动「立即备份」与定时 checkDue 并发时避免同时写同一目标文件 */
  private running = false
  /** 上次自动备份失败通知时间（24h 内不重复打扰） */
  private lastFailNotifyAt: number | null = null

  constructor(private readonly prefs: Pick<PrefRepository, 'get' | 'set'> = prefRepository) {}

  private backupDir(): string {
    const root = activeRoot()
    return root ? join(root, 'backups') : join(app.getPath('userData'), 'backups')
  }

  private getInt(key: string, fallback: number): number {
    const raw = this.prefs.get(key)
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) && n > 0 ? n : fallback
  }

  getConfig(): BackupConfig {
    const lastRaw = this.prefs.get(K_LAST)
    const lastAt = lastRaw ? parseInt(lastRaw, 10) : NaN
    return {
      enabled: this.prefs.get(K_ENABLED) === '1',
      intervalDays: this.getInt(K_INTERVAL, 7),
      keep: this.getInt(K_KEEP, 10),
      lastAt: Number.isFinite(lastAt) ? lastAt : null,
      dir: this.backupDir()
    }
  }

  setConfig(patch: { enabled?: boolean; intervalDays?: number; keep?: number }): BackupConfig {
    if (patch.enabled !== undefined) this.prefs.set(K_ENABLED, patch.enabled ? '1' : '0')
    if (patch.intervalDays !== undefined && patch.intervalDays > 0)
      this.prefs.set(K_INTERVAL, String(Math.round(patch.intervalDays)))
    if (patch.keep !== undefined && patch.keep > 0)
      this.prefs.set(K_KEEP, String(Math.round(patch.keep)))
    const cfg = this.getConfig()
    if (patch.enabled !== undefined) {
      if (cfg.enabled) this.start()
      else this.stop()
    }
    return cfg
  }

  /** 立即执行一次在线备份；超保留数清理旧份 */
  async runNow(): Promise<{ ok: boolean; file?: string; error?: string }> {
    if (this.running) return { ok: false, error: '备份进行中' }
    this.running = true
    try {
      const dir = this.backupDir()
      mkdirSync(dir, { recursive: true })
      // 精确到毫秒：秒级时间戳同秒并发会写同一文件
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const file = join(dir, `leaf-backup-${ts}.db`)
      await database.handle.backup(file)
      if (!existsSync(file)) throw new Error('备份文件未生成')
      this.prune(dir, this.getConfig().keep)
      this.prefs.set(K_LAST, String(Date.now()))
      return { ok: true, file }
    } catch (err) {
      console.error('[Backup] run failed:', err)
      return { ok: false, error: (err as Error).message }
    } finally {
      this.running = false
    }
  }

  /** 清理超出保留数的旧备份（按 mtime 旧→新删） */
  private prune(dir: string, keep: number): void {
    try {
      const files = readdirSync(dir)
        .filter((n) => n.startsWith('leaf-backup-') && n.endsWith('.db'))
        .map((name) => {
          try {
            return { name, mtimeMs: statSync(join(dir, name)).mtimeMs }
          } catch {
            return { name, mtimeMs: 0 }
          }
        })
      for (const name of selectBackupsToDelete(files, keep)) {
        try {
          unlinkSync(join(dir, name))
        } catch {
          /* 文件被占用等：下次再清 */
        }
      }
    } catch (err) {
      console.warn('[Backup] prune failed:', err)
    }
  }

  /** 到期检查：开启且距上次备份 ≥ intervalDays 时静默执行 */
  async checkDue(): Promise<void> {
    const cfg = this.getConfig()
    if (!cfg.enabled) return
    const dueAt = (cfg.lastAt ?? 0) + cfg.intervalDays * DAY_MS
    if (Date.now() < dueAt) return
    const r = await this.runNow()
    if (r.ok) {
      console.log('[Backup] auto backup done:', r.file)
      this.lastFailNotifyAt = null
    } else if (!this.lastFailNotifyAt || Date.now() - this.lastFailNotifyAt > DAY_MS) {
      // 自动备份失败必须让用户知道（磁盘满/权限问题），但 24h 内不重复打扰
      this.lastFailNotifyAt = Date.now()
      NotificationService.getInstance().showInfo('自动备份失败', r.error ?? '未知错误')
    }
  }

  /** 启动定时器（注册时调用；首查延迟 30s 不拖慢启动） */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.checkDue(), CHECK_INTERVAL_MS)
    if (this.bootTimer) clearTimeout(this.bootTimer)
    this.bootTimer = setTimeout(() => void this.checkDue(), 30_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.bootTimer) clearTimeout(this.bootTimer)
    this.bootTimer = null
  }
}

export const backupSchedulerService = new BackupSchedulerService()
