/**
 * D-020：库存储（入库即拷贝）/ 断链扫描 / 重新定位 / 存量迁移 IPC。
 *
 * 注册时延迟 3s 做一次静默断链扫描（自包含，不依赖 main/index.ts 生命周期链）。
 *
 * 这里**没有** getMode/setMode：曾经有过「引用原文件 / 拷贝入库」两档开关，
 * 默认还是引用，结果是编辑类动作要么拒绝要么改写用户散在磁盘上的原件，
 * 与 Eagle 的「库自持一份」模型对不上。现在导入一律拷贝入库，开关与它的
 * preload 通道一并撤掉。
 */
import { BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { photoStore } from '../stores'
import { sanitizeIpcMessage } from './utils'
import { showOpenDialogFor } from '../modules/dialogs'

export function registerStorageIpcHandlers(): void {
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

  // 断链素材批量处置：软删进回收站（可还原），给"库里几千条丢失"一个出口
  ipcMain.handle('storage:moveMissingToTrash', () => {
    try {
      return { ok: true, removed: photoStore.moveMissingToTrash() }
    } catch (err) {
      return { ok: false, removed: 0, error: sanitizeIpcMessage(err) }
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
