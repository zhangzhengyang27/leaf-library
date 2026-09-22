import { ipcMain, type BrowserWindow } from 'electron'
import { pluginService } from '../services/PluginService'
import { showOpenDialogFor } from '../modules/dialogs'

/** 插件系统（阶段 5.1 MVP）：列表 / 自定义目录 / 读取插件资源 */
export function registerPluginsIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('plugins:list', () => pluginService.list())

  ipcMain.handle('plugins:getExtraDir', () => pluginService.getExtraDir())

  ipcMain.handle('plugins:setExtraDir', (_e, dir: string) => {
    pluginService.setExtraDir(String(dir ?? ''))
    return pluginService.list()
  })

  ipcMain.handle('plugins:pickExtraDir', async () => {
    const win = getMainWindow()
    const result = await showOpenDialogFor(win, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    pluginService.setExtraDir(result.filePaths[0])
    return pluginService.list()
  })

  ipcMain.handle('plugins:readAsset', (_e, pluginId: string, relativePath: string) =>
    pluginService.readAsset(String(pluginId), String(relativePath))
  )

  // 插件市场：内置插件清单 / 一键安装
  ipcMain.handle('plugins:listBuiltin', () => pluginService.listBuiltin())
  ipcMain.handle('plugins:installBuiltin', (_e, id: string) =>
    pluginService.installBuiltin(String(id))
  )
}
