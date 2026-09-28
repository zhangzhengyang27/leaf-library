/**
 * 截图服务：窗口交互整体复用开源库 electron-screenshots（nashaofu/screenshots，
 * iShot/Snipaste 同类交互，社区久经验证），Leaf 只做自己的部分——
 * 截图完成后的入库管线（photos + 自动标签 + 通知 + 主窗口刷新）、
 * 偏好设置、贴图窗、快捷键与托盘/菜单接线。
 */
import Screenshots from 'electron-screenshots'
import { app, BrowserWindow, clipboard, ClipboardItem, shell, systemPreferences } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { preferencesStore, photoStore } from '../stores'
import { getAssetProcessingRef } from './assetProcessingRef'
import { NotificationService } from './NotificationService'
import { closePinWindow, getPinPayload } from '../modules/screenshotWindows'
import { getActiveLibrary } from '../modules/libraryRegistry'
import { screenshotFileName, uniqueFilePath } from '../utils/screenshotFile'
import type {
  ScreenshotSaveRequest,
  ScreenshotSaveResult,
  ScreenshotSettings
} from '@shared/ipc-contract'

const MAC_SCREEN_CAPTURE_PREFS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

/** 传给 es 的界面语言（其编辑器按钮 tooltip） */
const ES_LANG = {
  operation_ok_title: '入库（Enter）',
  operation_cancel_title: '取消（Esc）',
  operation_save_title: '保存',
  operation_redo_title: '重做',
  operation_undo_title: '撤销',
  operation_mosaic_title: '马赛克',
  operation_text_title: '文字',
  operation_brush_title: '画笔',
  operation_arrow_title: '箭头',
  operation_ellipse_title: '椭圆',
  operation_rectangle_title: '矩形'
}

class ScreenshotService {
  getSettings(): ScreenshotSettings {
    return preferencesStore.getScreenshotSettings()
  }

  patchSettings(patch: Partial<ScreenshotSettings>): ScreenshotSettings {
    return preferencesStore.patchScreenshotSettings(patch)
  }

  hasScreenPermission(): boolean {
    if (process.platform !== 'darwin') return true
    return systemPreferences.getMediaAccessStatus('screen') === 'granted'
  }

  /** 当前活跃的 es 实例（每次截图新建，结束后销毁——永远走"首次截图"这条已验证路径） */
  private $screenshots: Screenshots | null = null

  /** es 的 hide/复用路径在 macOS 26 上同样不合成（第二轮窗口 onscreen:false）。
   *  销毁上一次会话遗留的窗口（实例即弃）。 */
  private destroyPrevious(): void {
    const prev = this.$screenshots
    this.$screenshots = null
    if (prev?.$win && !prev.$win.isDestroyed()) {
      try {
        prev.$win.destroy()
      } catch {
        // ignore
      }
    }
  }

  /** 创建全新的 es 实例并绑定 ok/cancel 事件 */
  private createScreenshots(): Screenshots {
    // macOS 26 实测：panel 窗口一旦 setKiosk(true) 就不再被合成（窗口存在、有焦点、
    // 却永远不上屏）。es 在 show 事件里 setKiosk(true)——全局短路 kiosk 进入
    //（本项目无其它 kiosk 使用方），保留退出路径。
    const proto = BrowserWindow.prototype as unknown as {
      setKiosk: (flag: boolean) => BrowserWindow
      __kioskPatched?: boolean
    }
    if (!proto.__kioskPatched) {
      const original = proto.setKiosk
      proto.setKiosk = function (this: BrowserWindow, flag: boolean) {
        if (flag) return this
        return original.call(this, flag)
      }
      proto.__kioskPatched = true
    }
    const ss = new Screenshots({ lang: ES_LANG, singleWindow: true })
    // ok：编辑器确认完成，buffer = 选区+标注的 PNG（默认行为会写剪贴板，
    // 这里 preventDefault 后统一走 Leaf 管线：入库 + 剪贴板 + 通知 + 刷新）。
    // preventDefault 会跳过 es 自己的收窗流程，故 endCapture 由我们补上，
    // 完成后销毁窗口（实例即弃，下次截图新建——规避 hide/复用不合成问题）。
    ss.on('ok', (event: { preventDefault: () => void }, buffer: Buffer) => {
      event.preventDefault()
      void this.applyEsCapture(buffer)
      void ss
        .endCapture()
        .catch((err: unknown) => {
          console.error('[Screenshot] es endCapture error:', err)
        })
        .then(() => this.destroyPrevious())
    })
    ss.on('cancel', () => {
      // es 自己 hide 窗口；实例即弃，顺手销毁
      this.destroyPrevious()
    })
    return ss
  }

  /** 防并发进入：托盘连点/托盘+快捷键同触时避免起两个 es 会话 */
  private starting = false

  async startCapture(_mode: 'region' | 'fullscreen' | 'last' = 'region'): Promise<{
    ok: boolean
    error?: string
  }> {
    if (this.starting) return { ok: false, error: 'busy' }
    this.starting = true
    try {
      if (!this.hasScreenPermission()) {
        this.guidePermission()
        return { ok: false, error: 'permission' }
      }
      // toggle：再按一次快捷键 = 结束当前截图
      if (this.$screenshots?.$win && !this.$screenshots.$win.isDestroyed() && this.$screenshots.$win.isVisible()) {
        const active = this.$screenshots
        await active.endCapture()
        this.destroyPrevious()
        return { ok: true }
      }
      this.destroyPrevious()
      const ss = this.createScreenshots()
      this.$screenshots = ss
      await ss.startCapture()
      return { ok: true }
    } catch (err) {
      NotificationService.getInstance().showInfo('截图启动失败', String(err))
      return { ok: false, error: String(err) }
    } finally {
      this.starting = false
    }
  }

  /**
   * es 编辑器确认后的入库管线（Leaf 的差异化所在）：
   * 落盘到资源库 screenshots/ → photos 入库 → 缩略图管线 → 自动标签 →
   * 写剪贴板 → 系统通知 → 广播主窗口刷新。
   */
  private async applyEsCapture(buffer: Buffer): Promise<void> {
    try {
      const settings = this.getSettings()
      const dir = this.resolveSaveDir(settings)
      mkdirSync(dir, { recursive: true })
      const filePath = uniqueFilePath(dir, screenshotFileName(), '.png')
      writeFileSync(filePath, buffer)

      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([new Uint8Array(buffer)], { type: 'image/png' })
        })
      ])

      const photo = photoStore.addPhoto(filePath)
      getAssetProcessingRef()?.enqueue(photo.id)
      if (settings.autoTag) photoStore.addTag(photo.id, '截图')

      NotificationService.getInstance().showSuccess(
        '截图已入库',
        filePath.split(/[\\/]/).pop() ?? filePath
      )

      // 广播主窗口刷新素材池（截图窗口独立于主窗口，需主动通知）
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && !win.getParentWindow()) {
          win.webContents.send('screenshot:imported', { photoId: photo.id, filePath })
        }
      }
    } catch (err) {
      NotificationService.getInstance().showInfo('截图入库失败', String(err))
    }
  }

  private resolveSaveDir(settings: ScreenshotSettings): string {
    if (settings.saveDir) return settings.saveDir
    try {
      return join(getActiveLibrary().path, 'screenshots')
    } catch {
      return join(app.getPath('pictures'), 'Leaf Screenshots')
    }
  }

  dispose(): void {
    this.destroyPrevious()
  }

  closePin(id: string): void {
    closePinWindow(id)
  }

  getPinPayload(id: string): { ok: boolean; dataUrl?: string; width?: number; height?: number } {
    const p = getPinPayload(id)
    return p ? { ok: true, dataUrl: p.dataUrl, width: p.width, height: p.height } : { ok: false }
  }

  async applySave(req: ScreenshotSaveRequest): Promise<ScreenshotSaveResult> {
    // 贴图窗的入库/复制动作（图片已在剪贴板或内存，走同一文件管线）
    const decoded = req.dataUrl
      ? {
          buffer: Buffer.from(req.dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        }
      : null
    if (!decoded) return { ok: false, error: 'invalid dataUrl' }
    const settings = this.getSettings()

    let filePath: string | undefined
    if (req.actions.file || req.actions.library) {
      const dir = this.resolveSaveDir(settings)
      mkdirSync(dir, { recursive: true })
      filePath = uniqueFilePath(dir, screenshotFileName(), '.png')
      writeFileSync(filePath, decoded.buffer)
    }
    if (req.actions.clipboard) {
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([new Uint8Array(decoded.buffer)], { type: 'image/png' })
        })
      ])
    }

    let photoId: string | undefined
    if (req.actions.library && filePath) {
      const photo = photoStore.addPhoto(filePath)
      photoId = photo.id
      getAssetProcessingRef()?.enqueue(photo.id)
      if (settings.autoTag) photoStore.addTag(photo.id, '截图')
      NotificationService.getInstance().showSuccess(
        '截图已入库',
        filePath.split(/[\\/]/).pop() ?? filePath
      )
    }
    return { ok: true, filePath, photoId }
  }

  private guidePermission(): void {
    NotificationService.getInstance().showInfo(
      '需要屏幕录制权限',
      '请在 系统设置 › 隐私与安全性 › 屏幕录制 中勾选 Leaf，然后重试'
    )
    if (process.platform === 'darwin') void shell.openExternal(MAC_SCREEN_CAPTURE_PREFS)
  }
}

export const screenshotService = new ScreenshotService()
