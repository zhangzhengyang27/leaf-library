import { ipcMain } from 'electron'
import { getClipServer } from '../services/ClipServer'

/** 浏览器剪藏服务配置查询（设置页展示端口/token 用） */
export function registerClipServerIpcHandlers(): void {
  ipcMain.handle('clipServer:getConfig', () => {
    // 返回运行中服务的内存明文配置（审查修复）：旧实现回读 clip-server.json
    // ——P0-8 之后落盘的是 safeStorage 密文，设置页展示的 token 因此是密文，
    // 用户手动配置扩展永远 401
    const mem = getClipServer().getConfig()
    if (mem) return { running: true, ...mem }
    return { running: false, port: null, token: null }
  })

  ipcMain.handle('clipServer:regenerateToken', () => {
    // 委托服务统一处理：同步内存 token + 按 P0-8 语义加密落盘
    // （旧实现自写明文文件且不更新运行中的服务，新 token 无效）
    return getClipServer().regenerateToken()
  })
}
