/**
 * Leaf · WatchedFoldersService（阶段 4.4 监控文件夹自动导入）
 *
 * 每个资源库独立的监控目录列表存 pref_preferences（key `watched:folders`，JSON 数组）。
 * fs.watch(recursive) 监听目录，事件去抖后递归扫描支持的素材扩展名，
 * 复用 addPhotos 管线（按路径去重 + 后台缩略图/EXIF 处理）。
 *
 * 多库语义：切库=应用 relaunch，启动时 init() 按当前库的偏好恢复监控。
 */
import { watch, type FSWatcher } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'
import {
  AUDIO_EXTENSIONS,
  FONT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  RASTER_EXTENSIONS,
  TEXT_EXTENSIONS,
  VIDEO_EXTENSIONS
} from '@shared/assetTypes'
import { prefRepository } from '../db/repos/PrefRepository'
import type { PrefRepository } from '../db/repos/PrefRepository'
import { photoRepository } from '../db/repos/PhotoRepository'
import type { PhotoRepository } from '../db/repos/PhotoRepository'
import { getAssetProcessingRef } from './assetProcessingRef'
import { NotificationService } from './NotificationService'

const PREF_KEY = 'watched:folders'
const SUPPORTED_EXT = new Set([
  ...IMAGE_EXTENSIONS,
  ...RASTER_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...FONT_EXTENSIONS,
  // 修：TEXT 组此前漏配，监控目录里的 txt/md/csv 根本不会自动入库
  ...TEXT_EXTENSIONS
])
/** 事件去抖窗口（ms） */
const DEBOUNCE_MS = 600
/** 单次扫描文件数上限（防大目录失控） */
const SCAN_LIMIT = 2000
/** 递归深度上限（防止符号链接/深层目录失控） */
const MAX_DEPTH = 8
/** watcher 失效后的自动重试间隔 */
const RETRY_MS = 30_000

export class WatchedFoldersService {
  private watchers = new Map<string, FSWatcher>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** watcher 失效重试定时器 */
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** 已就「监控中断」通知过用户的目录（避免每次事件刷屏） */
  private notifiedFailure = new Set<string>()
  private enabled = true

  constructor(
    private readonly prefs: Pick<PrefRepository, 'get' | 'set'> = prefRepository,
    private readonly photos: Pick<PhotoRepository, 'addPhotos'> = photoRepository
  ) {}

  list(): string[] {
    try {
      const raw = this.prefs.get(PREF_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
    } catch {
      return []
    }
  }

  /** 归一化：去尾分隔符（\ 与 / 都去，win32 下同名目录否则产生重复 watcher）。
   *  例外：盘符根（C:\ / C:/）去掉尾分隔符会变成 `C:`——Node watch('C:')
   *  监听的是该盘当前工作目录而非根目录，语义悄然改变，保留原样。 */
  private normalizeFolder(folder: string): string {
    if (/^[a-zA-Z]:[\\/]?$/.test(folder)) return folder
    return folder.replace(/[\\/]+$/, '')
  }

  add(folder: string): string[] {
    const list = this.list()
    const norm = this.normalizeFolder(folder)
    if (!list.includes(norm)) {
      this.prefs.set(PREF_KEY, JSON.stringify([...list, norm]))
    }
    if (this.enabled) this.watchFolder(norm)
    return this.list()
  }

  remove(folder: string): string[] {
    // 代码审查 P1：add() 用归一化的 norm 作 key，这里必须同样归一化，
    // 否则带尾分隔符移除时 watcher 关不掉、pref 条目也删不掉 → 泄漏并持续误导入
    const norm = this.normalizeFolder(folder)
    this.unwatch(norm)
    this.prefs.set(PREF_KEY, JSON.stringify(this.list().filter((p) => p !== norm)))
    return this.list()
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (on) {
      for (const folder of this.list()) this.watchFolder(folder)
    } else {
      this.unwatchAll()
    }
  }

  /** 启动恢复监控（installDatabase 之后调用） */
  init(): void {
    this.enabled = true
    for (const folder of this.list()) this.watchFolder(folder)
  }

  private watchFolder(folder: string): void {
    if (this.watchers.has(folder)) return
    try {
      const watcher = watch(folder, { recursive: true }, () => this.scheduleScan(folder))
      watcher.on('error', () => this.handleWatchError(folder))
      this.watchers.set(folder, watcher)
      // 恢复成功后重置通知标记：下次中断再通知一次
      this.notifiedFailure.delete(folder)
    } catch {
      // 目录不存在/权限不足等：进入重试（目录可能稍后出现）
      this.handleWatchError(folder)
    }
  }

  /**
   * watcher 出错/目录暂不可用：进入 30s 周期重试。
   * 旧实现 error 后直接 unwatch 且不再重试——目录被临时卸载/重命名后
   * 监控永久失效，设置页仍显示「监控中」，用户以为在自动导入实际已停。
   */
  private handleWatchError(folder: string): void {
    this.unwatch(folder)
    if (!this.enabled || this.retryTimers.has(folder)) return
    if (!this.notifiedFailure.has(folder)) {
      this.notifiedFailure.add(folder)
      NotificationService.getInstance().showInfo(
        '文件夹监控中断',
        `${folder} 暂时无法监听（可能被卸载或重命名），将每 30 秒自动重试`
      )
    }
    const t = setTimeout(() => {
      this.retryTimers.delete(folder)
      if (this.enabled && this.list().includes(folder)) this.watchFolder(folder)
    }, RETRY_MS)
    this.retryTimers.set(folder, t)
  }

  private unwatch(folder: string): void {
    const w = this.watchers.get(folder)
    if (w) {
      w.close()
      this.watchers.delete(folder)
    }
    const t = this.timers.get(folder)
    if (t) {
      clearTimeout(t)
      this.timers.delete(folder)
    }
  }

  private unwatchAll(): void {
    for (const folder of [...this.watchers.keys()]) this.unwatch(folder)
  }

  /** 应用退出清理（代码审查 P1：will-quit 时释放全部 watcher 与去抖定时器） */
  stop(): void {
    this.enabled = false
    this.unwatchAll()
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    for (const t of this.retryTimers.values()) clearTimeout(t)
    this.retryTimers.clear()
  }

  private scheduleScan(folder: string): void {
    const prev = this.timers.get(folder)
    if (prev) clearTimeout(prev)
    this.timers.set(
      folder,
      setTimeout(() => void this.scan(folder), DEBOUNCE_MS)
    )
  }

  /** 递归收集受支持扩展名的文件（最多 SCAN_LIMIT 个） */
  private async collect(folder: string, depth = 0): Promise<string[]> {
    if (depth > MAX_DEPTH) return []
    const out: string[] = []
    let entries
    try {
      entries = await readdir(folder, { withFileTypes: true })
    } catch {
      return out
    }
    for (const entry of entries) {
      if (out.length >= SCAN_LIMIT) break
      if (entry.isDirectory()) {
        out.push(...(await this.collect(join(folder, entry.name), depth + 1)))
      } else if (entry.isFile()) {
        const dot = entry.name.lastIndexOf('.')
        const ext = dot >= 0 ? entry.name.slice(dot + 1).toLowerCase() : ''
        if (SUPPORTED_EXT.has(ext)) out.push(join(folder, entry.name))
      }
    }
    return out
  }

  private async scan(folder: string): Promise<void> {
    this.timers.delete(folder)
    if (!this.enabled) return
    const files = await this.collect(folder)
    // collect 可能耗时数秒：期间用户关闭开关（unwatchAll 只清 watcher/定时器）
    // 时不得再导入「幽灵批次」（审查 P3-16）
    if (!this.enabled) return
    if (files.length === 0) return
    try {
      const added = this.photos.addPhotos(files)
      const processing = getAssetProcessingRef()
      for (const p of added) processing?.enqueue(p.id)
    } catch (err) {
      // scan 由 scheduleScan 的 void 调用驱动：不接住会成为 unhandled rejection
      console.error('[WatchedFolders] import failed:', folder, err)
    }
  }
}

export const watchedFoldersService = new WatchedFoldersService()
