/**
 * Leaf · AutoUpdateService（自动更新服务）
 *
 * 封装 electron-updater 6.x API，对外提供 4 个方法：
 * - checkForUpdates()    检查更新（拉远端 version manifest）
 * - downloadUpdate()     下载新版本（不安装）
 * - quitAndInstall()     退出并安装（用户确认后调）
 * - getStatus()          当前状态（idle / checking / available / downloading / downloaded / error）
 *
 * 事件通过 BrowserWindow.webContents.send('update:event', payload) 推给渲染端，
 * 渲染端用 window.api.update.onEvent(cb) 订阅。
 *
 * 来源：docs/MODULE_TIERS.md「1.0 必须补的非功能模块」之「自动更新」。
 * 限制：1.0 publish url 是 example.com 占位，发布前需替换。
 */

import { BrowserWindow, app } from 'electron'
import { autoUpdater, ProgressInfo, UpdateInfo } from 'electron-updater'
import { log } from './LogService'
import type { UpdateEvent, UpdateStatus } from '../../renderer/src/types/update'

export type { UpdateEvent, UpdateStatus }

type Listener = (e: UpdateEvent) => void

const listeners = new Set<Listener>()
let currentStatus: UpdateStatus = 'idle'
let cachedInfo: UpdateInfo | null = null
let lastError: string | null = null

function broadcast(e: UpdateEvent): void {
  currentStatus = e.status
  if (e.status === 'error') lastError = e.error ?? null
  if (e.status === 'checking') lastError = null
  log.info(
    'autoUpdate',
    `${e.status}${e.version ? ` v${e.version}` : ''}${e.error ? ` err=${e.error}` : ''}`
  )
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('update:event', e)
    }
  }
  for (const l of listeners) l(e)
}

function wireAutoUpdater(): void {
  // 不自动下载 — 用户手动触发更友好
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    cachedInfo = info
    broadcast({
      status: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null
    })
  })
  autoUpdater.on('update-not-available', () => broadcast({ status: 'not-available' }))
  autoUpdater.on('download-progress', (progress: ProgressInfo) =>
    broadcast({ status: 'downloading', progress })
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    cachedInfo = info
    broadcast({ status: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err: Error) => broadcast({ status: 'error', error: err.message }))
}

let wired = false

/** 占位 feed（electron-builder.yml 默认模板）——未配置发布源时不该让用户收到一次网络错误 */
const PLACEHOLDER_FEED = /https:\/\/(example\.com|your-domain\.com)/i

/** 在 app.whenReady() 后调一次（确保已 ready） */
export function ensureAutoUpdater(): void {
  if (wired) return
  wired = true
  wireAutoUpdater()
}

export const AutoUpdateService = {
  async checkForUpdates(): Promise<UpdateStatus> {
    ensureAutoUpdater()
    if (currentStatus === 'checking') return currentStatus
    const feedUrl = typeof autoUpdater.getFeedURL === 'function' ? autoUpdater.getFeedURL() : ''
    if (!feedUrl || PLACEHOLDER_FEED.test(feedUrl)) {
      broadcast({
        status: 'error',
        error:
          '更新源尚未配置：请在 electron-builder.yml 的 publish.url 填入真实 HTTPS 更新源后重新打包'
      })
      return currentStatus
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      // 错误已被 error 事件处理；这里不再 throw
      log.warn('autoUpdate', `checkForUpdates threw: ${(e as Error).message}`)
    }
    return currentStatus
  },

  async downloadUpdate(): Promise<void> {
    ensureAutoUpdater()
    if (!cachedInfo) {
      log.warn('autoUpdate', 'downloadUpdate called before checkForUpdates; running check first')
      await this.checkForUpdates()
    }
    try {
      await autoUpdater.downloadUpdate()
    } catch (e) {
      log.warn('autoUpdate', `downloadUpdate threw: ${(e as Error).message}`)
    }
  },

  quitAndInstall(): void {
    ensureAutoUpdater()
    autoUpdater.quitAndInstall()
  },

  getStatus(): UpdateStatus {
    return currentStatus
  },

  /** 最近一次 error 事件的文案（菜单/原生反馈用；新一次检查开始时清空） */
  getLastError(): string | null {
    return lastError
  },

  getCachedInfo(): UpdateInfo | null {
    return cachedInfo
  },

  getCurrentVersion(): string {
    return app.getVersion()
  },

  onEvent(cb: Listener): () => void {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }
}
