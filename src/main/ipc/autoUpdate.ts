import { ipcMain } from 'electron'
import { AutoUpdateService, type UpdateStatus } from '../services/AutoUpdateService'

export function registerAutoUpdateIpcHandlers(): void {
  ipcMain.handle('update:check', async (): Promise<UpdateStatus> => {
    return AutoUpdateService.checkForUpdates()
  })

  ipcMain.handle('update:download', async (): Promise<void> => {
    await AutoUpdateService.downloadUpdate()
  })

  ipcMain.handle('update:install', (): void => {
    AutoUpdateService.quitAndInstall()
  })

  ipcMain.handle('update:getStatus', (): UpdateStatus => {
    return AutoUpdateService.getStatus()
  })

  ipcMain.handle('update:getCurrentVersion', (): string => {
    return AutoUpdateService.getCurrentVersion()
  })
}
