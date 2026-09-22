import { isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'
import { BrowserWindow } from 'electron'
import { registerHandlers } from './utils'
import { screenshotService } from '../services/ScreenshotService'
import { reapplyScreenshotShortcut } from '../modules/screenshotShortcuts'
import { isScanDirAllowed } from '../utils/pathPolicy'
import type { ScreenshotSaveRequest, ScreenshotSettings } from '@shared/ipc-contract'

export function registerScreenshotIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  void getMainWindow
  registerHandlers({
    'screenshot.settings.get': () => screenshotService.getSettings(),
    'screenshot.settings.set': (_e, patch: Partial<ScreenshotSettings>) => {
      // saveDir 白名单（审查 P2-9）：任意字符串会让截图管线向任意目录写文件；
      // 合法来源是主进程「选择文件夹」对话框（photos:selectFolder 已登记扫描白名单）
      if (patch && typeof patch.saveDir === 'string' && patch.saveDir) {
        const dir = patch.saveDir
        if (!isAbsolute(dir) || !existsSync(dir) || !isScanDirAllowed(dir)) {
          throw new Error('保存目录不在允许的白名单内（请通过「选择文件夹」对话框重新选取）')
        }
      }
      const result = screenshotService.patchSettings(patch)
      // 快捷键开关即时生效（旧实现只写设置，需重启才挂/摘快捷键）
      reapplyScreenshotShortcut()
      return result
    },
    'screenshot.save': async (_e, req: ScreenshotSaveRequest) => {
      const result = await screenshotService.applySave(req)
      // 入库成功 → 通知主窗口刷新素材池
      if (result.ok && result.photoId) {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('screenshot:imported', {
            photoId: result.photoId,
            filePath: result.filePath
          })
        }
      }
      return result
    },
    'screenshot.pin.close': (_e, req: { id: string }) => {
      screenshotService.closePin(req.id)
      return { ok: true }
    },
    'screenshot.pin.drag': (event, p: { dx: number; dy: number }) => {
      // pin 页用 MouseEvent.screenX/Y 增量拖动（app-region 会吞 dblclick/contextmenu，故手动拖）
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.webContents === event.sender) {
          const [x, y] = win.getPosition()
          win.setPosition(x + p.dx, y + p.dy)
          break
        }
      }
      return { ok: true }
    },
    'screenshot.pin.payload': (_e, req: { id: string }) => screenshotService.getPinPayload(req.id)
  })
}
