/**
 * F8：剪贴板常驻监听 IPC（开关读写）。
 *
 * 注册时按偏好自启动/停轮询；will-quit 清理在 ClipboardWatcherService 内自包含。
 */
import { ipcMain } from 'electron'
import { clipboardWatcherService } from '../services/ClipboardWatcherService'

export function registerClipboardWatchIpcHandlers(): void {
  clipboardWatcherService.init()

  ipcMain.handle('clipboardWatch:getEnabled', (): boolean => clipboardWatcherService.isEnabled())

  ipcMain.handle('clipboardWatch:setEnabled', (_e, on: boolean): boolean => {
    clipboardWatcherService.setEnabled(Boolean(on))
    return clipboardWatcherService.isEnabled()
  })
}
