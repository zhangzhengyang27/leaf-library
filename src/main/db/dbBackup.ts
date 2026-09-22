/**
 * Leaf · 数据库备份 / 还原（迁移中心 UI 用）
 *
 * 设计：
 * - exportDb()：把 leaf.db（含 WAL / SHM）复制到用户选的位置（showSaveDialog）
 * - importDb()：用户选 db 文件，先关 db handle，用其覆盖现有 db，重启应用
 * - factoryReset()：删 leaf.db + WAL + SHM + 重启；下次启动重建数据库
 *
 * 安全策略：
 * - 所有破坏性操作（import / reset）执行后调 app.relaunch() + app.quit()
 * - 用户的「选择路径」通过 dialog 模块，不自己拼路径
 */

import { dialog, app, BrowserWindow } from 'electron'
import { existsSync, copyFileSync, rmSync } from 'node:fs'
import { database } from './database'
import { log } from '../services/LogService'

/**
 * 把当前 leaf.db 复制到用户选的位置。
 * 返回保存路径（用户取消则 null）。
 */
export async function exportDb(getMainWindow: () => BrowserWindow | null): Promise<string | null> {
  const win = getMainWindow()
  const dbPath = database.path()

  const result = await dialog.showSaveDialog(win ?? undefined!, {
    title: '导出数据库',
    defaultPath: `leaf-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: 'SQLite 数据库', extensions: ['db'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  })

  if (result.canceled || !result.filePath) return null

  try {
    // 关 db 以确保 WAL flush 到主文件
    database.close()
    copyFileSync(dbPath, result.filePath)
    log.info('dbBackup', `exported db to ${result.filePath}`)
    // 下次 database.handle 访问时会自动 ensureOpen
    return result.filePath
  } catch (e) {
    log.error('dbBackup', `export failed: ${(e as Error).message}`, e)
    throw e
  }
}

/**
 * 用户提供的 db 文件覆盖当前 db。
 * 副作用：重启应用（不重启的话新 db 不会生效）。
 */
export async function importDb(getMainWindow: () => BrowserWindow | null): Promise<{
  imported: boolean
  filePath: string | null
}> {
  const win = getMainWindow()
  const dbPath = database.path()

  const result = await dialog.showOpenDialog(win ?? undefined!, {
    title: '导入数据库',
    filters: [{ name: 'SQLite 数据库', extensions: ['db'] }],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { imported: false, filePath: null }
  }

  const src = result.filePaths[0]
  if (!src || !existsSync(src)) {
    return { imported: false, filePath: null }
  }

  // 二次确认（用户可能误选错文件）
  const confirm = await dialog.showMessageBox(win ?? undefined!, {
    type: 'warning',
    title: '确认导入数据库',
    message: '导入数据库将覆盖当前所有数据，且无法撤销。',
    detail: `即将用：${src}\n当前数据：${dbPath}\n\n导入后应用会自动重启。`,
    buttons: ['确认导入', '取消'],
    defaultId: 1,
    cancelId: 1
  })
  if (confirm.response !== 0) return { imported: false, filePath: null }

  try {
    // 关 db + 清 WAL/SHM + 拷贝 + 重启
    database.close()
    const walPath = `${dbPath}-wal`
    const shmPath = `${dbPath}-shm`
    if (existsSync(walPath)) rmSync(walPath)
    if (existsSync(shmPath)) rmSync(shmPath)
    copyFileSync(src, dbPath)
    log.info('dbBackup', `imported db from ${src}, relaunching`)
    // 延后重启（让 IPC response 回去）
    setTimeout(() => {
      app.relaunch()
      // quit（而非 exit）：让 will-quit 清理（监控/剪藏/截图服务）走完，DB 已在上面显式 close
      app.quit()
    }, 100)
    return { imported: true, filePath: src }
  } catch (e) {
    log.error('dbBackup', `import failed: ${(e as Error).message}`, e)
    throw e
  }
}

/**
 * 恢复出厂：删 leaf.db + WAL + SHM，重启应用。
 * 下次启动自动重建数据库（空 SQLite + dataMigrations() 跳过）。
 */
export async function factoryReset(getMainWindow: () => BrowserWindow | null): Promise<boolean> {
  const win = getMainWindow()
  const dbPath = database.path()

  const confirm = await dialog.showMessageBox(win ?? undefined!, {
    type: 'warning',
    title: '恢复出厂设置',
    message: '此操作将清空所有数据（标签 / 壁纸 / 番茄钟 / 截图 / 录制 / 收藏）。',
    detail: '操作不可撤销。建议先「导出数据库」备份。\n\n确认继续？',
    buttons: ['确认清空', '取消'],
    defaultId: 1,
    cancelId: 1
  })
  if (confirm.response !== 0) return false

  try {
    database.close()
    const walPath = `${dbPath}-wal`
    const shmPath = `${dbPath}-shm`
    if (existsSync(walPath)) rmSync(walPath)
    if (existsSync(shmPath)) rmSync(shmPath)
    rmSync(dbPath)
    log.warn('dbBackup', `factory reset, relaunching`)
    setTimeout(() => {
      app.relaunch()
      // quit（而非 exit）：让 will-quit 清理（监控/剪藏/截图服务）走完，DB 已在上面显式 close
      app.quit()
    }, 100)
    return true
  } catch (e) {
    log.error('dbBackup', `factory reset failed: ${(e as Error).message}`, e)
    throw e
  }
}
