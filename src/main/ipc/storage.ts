/**
 * F11：库存储模式 / 断链扫描 / 重新定位 / 存量迁移 IPC。
 *
 * 注册时延迟 3s 做一次静默断链扫描（自包含，不依赖 main/index.ts 生命周期链）。
 */
import { BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { photoStore } from '../stores'
import { sanitizeIpcMessage } from './utils'
import { showOpenDialogFor } from '../modules/dialogs'

export function registerStorageIpcHandlers(): void {
  ipcMain.handle('storage:getMode', () => photoStore.getStorageMode())

  ipcMain.handle('storage:setMode', (_e, mode: 'reference' | 'copy') => {
    photoStore.setStorageMode(mode === 'copy' ? 'copy' : 'reference')
    return photoStore.getStorageMode()
  })

  ipcMain.handle('storage:scanMissing', async () => {
    try {
      return { ok: true, ...(await photoStore.scanMissing()) }
    } catch (err) {
      return { ok: false, error: sanitizeIpcMessage(err) }
    }
  })

  // 重新定位必须由主进程对话框选路径（审查 P1-3）：渲染层不再传任意路径，
  // 否则换绑后的「已入库素材」路径会绕过 pathPolicy 的全部读取白名单
  ipcMain.handle('storage:relinkPhoto', async (_e, id: string) => {
    try {
      const options: Electron.OpenDialogOptions = {
        title: '重新定位素材文件',
        properties: ['openFile']
      }
      const result = await showOpenDialogFor(BrowserWindow.getFocusedWindow(), options)
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: '已取消' }
      }
      const newPath = result.filePaths[0]
      if (!existsSync(newPath)) return { ok: false, error: '文件不存在' }
      const photo = photoStore.relinkPhoto(id, newPath)
      return { ok: Boolean(photo), photo }
    } catch (err) {
      return { ok: false, error: sanitizeIpcMessage(err) }
    }
  })

  ipcMain.handle('storage:migrateIntoLibrary', async (_e, dryRun: boolean) => {
    try {
      return { ok: true, ...(await photoStore.migrateIntoLibrary({ dryRun: Boolean(dryRun) })) }
    } catch (err) {
      return { ok: false, error: sanitizeIpcMessage(err) }
    }
  })

  // F17：库目录移动修复（oldRoot=用户选择的原库目录；dryRun 先行统计）
  ipcMain.handle('storage:repairMovedLibrary', (_e, oldRoot: string, dryRun: boolean) => {
    try {
      return { ok: true, ...photoStore.repairMovedLibrary(String(oldRoot), Boolean(dryRun)) }
    } catch (err) {
      return { ok: false, error: sanitizeIpcMessage(err) }
    }
  })

  // 启动静默断链扫描（空闲 3s 后；增量标记，重复扫描成本低）
  setTimeout(() => {
    void photoStore.scanMissing().catch(() => {})
  }, 3000)
}
