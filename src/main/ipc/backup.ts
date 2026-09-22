/**
 * F16：库定时备份 IPC（配置读写 / 立即备份 / 打开备份目录）。
 *
 * 注册时启动到期检查定时器（自包含，main/index.ts 仅一行注册）。
 */
import { ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { backupSchedulerService } from '../services/BackupSchedulerService'

export function registerBackupIpcHandlers(): void {
  ipcMain.handle('backup:getConfig', () => backupSchedulerService.getConfig())

  ipcMain.handle(
    'backup:setConfig',
    (_e, patch: { enabled?: boolean; intervalDays?: number; keep?: number }) =>
      backupSchedulerService.setConfig(patch)
  )

  ipcMain.handle('backup:runNow', async () => backupSchedulerService.runNow())

  ipcMain.handle('backup:openDir', () => {
    const dir = backupSchedulerService.getConfig().dir
    if (!existsSync(dir)) return false
    void shell.openPath(dir)
    return true
  })

  // 到期检查定时器（启动即挂上；首查延迟 30s 由服务内部控制）
  if (backupSchedulerService.getConfig().enabled) {
    backupSchedulerService.start()
  }
}
