import { ipcMain } from 'electron'
import { watchedFoldersService } from '../services/WatchedFoldersService'
import { isScanDirAllowed } from '../utils/pathPolicy'

/** 监控文件夹自动导入（阶段 4.4）：设置页「自动导入」分区用 */
export function registerWatchedFoldersIpcHandlers(): void {
  ipcMain.handle('watched:list', () => watchedFoldersService.list())
  ipcMain.handle('watched:add', (_e, folder: string) => {
    if (typeof folder !== 'string' || !folder.trim()) return watchedFoldersService.list()
    // 目录白名单（审查 P2-2）：只登记用户对话框选过的/库根内的目录
    if (!isScanDirAllowed(folder)) {
      throw new Error('目录不在允许监控的白名单内（请通过「选择文件夹」对话框选取）')
    }
    return watchedFoldersService.add(folder)
  })
  ipcMain.handle('watched:remove', (_e, folder: string) => watchedFoldersService.remove(folder))
  ipcMain.handle('watched:setEnabled', (_e, on: boolean) => {
    watchedFoldersService.setEnabled(on)
    return true
  })
}
