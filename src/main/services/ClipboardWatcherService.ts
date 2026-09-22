/**
 * Leaf · ClipboardWatcherService（F8：剪贴板常驻监听自动导入，对齐 Eagle）
 *
 * 1s 轮询剪贴板，内容指纹（文本 md5 / 图片 PNG md5）变化才处理：
 * - 文本：逐行解析绝对路径 / file:// URL（existsSync 过滤）→ 走 addPhotos 管线
 * - 图片位图：写 userData/clips/clipboard-<ts>.png → 入库
 * 防回环：自身导入后 2s 内冻结轮询并刷新指纹（应用内「复制文件」不会二次导入）。
 *
 * 开关存 pref_preferences（key `clipboard:watch`，'1'/'0'，默认关）。
 * 接线自包含：registerClipboardWatchIpcHandlers() 内完成启动恢复与 will-quit 清理，
 * main/index.ts 无需感知（避免与并行开发的其他服务互相踩）。
 */
import { app, clipboard } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { NotificationService, NotificationType } from './NotificationService'
import { getAssetProcessingRef } from './assetProcessingRef'
import { activeSubdir } from '../modules/libraryRegistry'
import { photoRepository } from '../db/repos/PhotoRepository'
import type { PhotoRepository } from '../db/repos/PhotoRepository'
import { prefRepository } from '../db/repos/PrefRepository'
import type { PrefRepository } from '../db/repos/PrefRepository'
import { extractPathsFromText } from '../utils/clipboardPaths'

const PREF_KEY = 'clipboard:watch'
const POLL_MS = 1000
/** 导入后冻结窗口（防回环） */
const FREEZE_MS = 2500
/** 单次文本解析路径上限 */
const MAX_PATHS = 200

export class ClipboardWatcherService {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastFingerprint = ''
  private frozenUntil = 0

  constructor(
    private readonly prefs: Pick<PrefRepository, 'get' | 'set'> = prefRepository,
    private readonly photos: Pick<PhotoRepository, 'addPhotos'> = photoRepository
  ) {}

  isEnabled(): boolean {
    return this.prefs.get(PREF_KEY) === '1'
  }

  setEnabled(on: boolean): void {
    this.prefs.set(PREF_KEY, on ? '1' : '0')
    if (on) this.start()
    else this.stop()
  }

  /** 启动时按偏好恢复 */
  init(): void {
    if (this.isEnabled()) this.start()
  }

  start(): void {
    if (this.timer) return
    // 以启动瞬间的剪贴板为基线，避免开启瞬间把历史内容整个导入
    this.lastFingerprint = this.fingerprint()
    this.timer = setInterval(() => void this.tick(), POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private fingerprint(): string {
    const text = clipboard.readText()
    if (text) return 'text:' + createHash('md5').update(text).digest('hex')
    const img = clipboard.readImage()
    if (!img.isEmpty()) {
      // 廉价指纹（审查 P2-27）：旧实现每秒对整张图做完整 PNG 编码再哈希，
      // 5K 截图下主进程每秒数百 ms 阻塞；改为尺寸+缩放图哈希
      const size = img.getSize()
      const thumb = img.resize({ width: 32, height: 32 })
      return (
        'img:' +
        size.width +
        'x' +
        size.height +
        ':' +
        createHash('md5').update(thumb.toPNG()).digest('hex')
      )
    }
    return ''
  }

  private freeze(): void {
    this.frozenUntil = Date.now() + FREEZE_MS
    this.lastFingerprint = this.fingerprint()
  }

  private async tick(): Promise<void> {
    if (Date.now() < this.frozenUntil) return
    const fp = this.fingerprint()
    if (!fp || fp === this.lastFingerprint) return
    this.lastFingerprint = fp

    const paths = this.extractPaths()
    if (paths.length > 0) {
      this.import(paths, `剪贴板 ${paths.length} 个文件`)
      return
    }
    const png = this.readImagePng()
    if (png) {
      this.import([png], '剪贴板图片')
    }
  }

  /** 文本 → 逐行绝对路径 / file:// URL（解析逻辑见 utils/clipboardPaths） */
  private extractPaths(): string[] {
    const text = clipboard.readText()
    if (!text) return []
    return extractPathsFromText(text, existsSync, MAX_PATHS)
  }

  private readImagePng(): string | null {
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    const png = img.toPNG()
    if (png.length === 0) return null
    const dir = activeSubdir('clips')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `clipboard-${Date.now()}.png`)
    writeFileSync(file, png)
    return file
  }

  private import(paths: string[], label: string): void {
    try {
      const added = this.photos.addPhotos(paths)
      const processing = getAssetProcessingRef()
      for (const p of added) processing?.enqueue(p.id)
      this.freeze()
      if (added.length > 0) {
        NotificationService.getInstance().show(
          NotificationType.SUCCESS,
          '剪贴板自动导入',
          `已从${label}导入 ${added.length} 项`
        )
      }
    } catch (err) {
      console.error('[ClipboardWatcher] import failed:', err)
    }
  }
}

export const clipboardWatcherService = new ClipboardWatcherService()

// 应用退出清理（自包含，不依赖 main/index.ts 的 will-quit 链）
app.on('will-quit', () => {
  clipboardWatcherService.stop()
})
