/**
 * Leaf · Log IPC（导出 + telemetry mode 切换）
 *
 * 暴露给渲染端：
 * - log:export         导出当前 ring buffer + meta 为 JSON 文件，返回绝对路径
 * - log:getMode        取当前 telemetry mode
 * - log:setMode        切换 mode（持久化到 pref_preferences）
 *
 * remote 模式在 1.0 不实现，仅占位。
 */

import { dialog, ipcMain, shell } from 'electron'
import { log } from '../services/LogService'
import type { TelemetryMode } from '../../shared/types'

export function registerLogIpcHandlers(): void {
  ipcMain.handle('log:export', async (): Promise<string | null> => {
    const filePath = await log.export()
    // 友好地弹一个「保存到…」对话框，让用户主动选路径
    const result = await dialog.showMessageBox({
      type: 'info',
      message: '日志已导出',
      detail: filePath,
      buttons: ['打开所在目录', '确定'],
      defaultId: 0,
      cancelId: 1
    })
    if (result.response === 0) {
      shell.showItemInFolder(filePath)
    }
    return filePath
  })

  ipcMain.handle('log:getMode', (): TelemetryMode => log.getMode())
  ipcMain.handle('log:setMode', (_e, mode: TelemetryMode): TelemetryMode => {
    log.setMode(mode)
    return log.getMode()
  })
}
