/**
 * Leaf · 平台特性 IPC（dock badge / 任务栏进度 / 用户注意力）
 *
 * 让渲染端能：
 * - 设置 dock / 任务栏 badge（macOS 文本、Win/Linux 数字）
 * - 设置任务栏进度条（屏幕录制、文件下载等长操作）
 * - 请求用户注意力（dock 弹跳 / 任务栏闪烁）
 *
 * 平台差异由 src/main/utils/platform.ts 统一处理，渲染端不用关心。
 */

import { ipcMain, BrowserWindow } from 'electron'
import { setDockBadge, setProgressBar, requestUserAttention } from '../utils/platform'

export function registerPlatformIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('platform:setDockBadge', (_e, text: string | number | null): void => {
    setDockBadge(text)
  })

  ipcMain.handle('platform:setProgressBar', (_e, fraction: number): void => {
    setProgressBar(getMainWindow(), fraction)
  })

  ipcMain.handle(
    'platform:requestUserAttention',
    (_e, level: 'critical' | 'informational' = 'informational'): void => {
      requestUserAttention(getMainWindow(), level)
    }
  )

  // 注：platform:quit 已移除（B13）：preload 的 platform 命名空间从未暴露它，
  // 渲染端无法调用；Dock / 托盘菜单在主进程内直接调用 app.quit()
}
