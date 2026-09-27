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

  // 插件中心（D-025）：启停 / 卸载 / 导入 / 全量视图
  ipcMain.handle('plugins:setEnabled', (_e, id: string, enabled: boolean) =>
    pluginService.setEnabled(String(id ?? ''), enabled === true)
  )
  ipcMain.handle('plugins:uninstall', (_e, id: string) => pluginService.uninstall(String(id ?? '')))
  ipcMain.handle('plugins:importPlugin', (_e, zipPath: string) =>
    pluginService.importPlugin(String(zipPath ?? ''))
  )
  ipcMain.handle('plugins:listAll', () => pluginService.listAll())
  // 选 .leafplugin 文件（null = 用户取消；不落盘——导入走两段式）
  ipcMain.handle('plugins:pickPluginZip', async () => {
    const win = getMainWindow()
    const result = await showOpenDialogFor(win, {
      filters: [{ name: 'Leaf 插件包', extensions: ['leafplugin', 'zip'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  // 两段式第一段：解析包元数据（含权限清单）供安装确认展示；不落盘
  ipcMain.handle('plugins:inspectPlugin', (_e, zipPath: string) =>
    pluginService.inspectPlugin(String(zipPath ?? ''))
  )
}
