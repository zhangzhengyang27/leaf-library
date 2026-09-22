/**
 * Leaf · system info IPC（userData 路径 + legacy 归档目录）
 *
 * 暴露给 SettingsView「数据」区块，让用户看到：
 * - 数据目录在哪
 * - 旧 JSON 是否归档到 legacy-backup/
 *
 * 后续可以加：版本、平台、locale、磁盘占用等。
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { log } from '../services/LogService'
import { database } from '../db/database'
import { isOpenPathAllowed } from '../utils/pathPolicy'

export interface SystemInfo {
  userDataPath: string
  dbPath: string
}

function readSystemInfo(): SystemInfo {
  const userDataPath = app.getPath('userData')
  const dbPath = database.resolvePath()
  return { userDataPath, dbPath }
}

// ── macOS 分享面板（NSSharingServicePicker 原生绑定；仅 darwin，惰性加载） ──
type ShareAddon = { share: (paths: string[]) => boolean }
let shareAddon: ShareAddon | null | undefined
function loadShareAddon(): ShareAddon | null {
  if (shareAddon !== undefined) return shareAddon
  shareAddon = null
  if (process.platform !== 'darwin') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    shareAddon = require('leaf-macos-share') as ShareAddon
  } catch (error) {
    console.warn('[system] leaf-macos-share 加载失败，分享回退复制:', error)
    shareAddon = null
  }
  return shareAddon
}

/** 拉起分享面板；面板不可用时返回 false（调用方回退复制降级） */
function showSharePanel(paths: string[]): boolean {
  const addon = loadShareAddon()
  if (!addon || paths.length === 0) return false
  try {
    return addon.share(paths)
  } catch (error) {
    console.warn('[system] 分享面板失败:', error)
    return false
  }
}

export function registerSystemInfoIpcHandlers(): void {
  ipcMain.handle('system:info', (): SystemInfo => readSystemInfo())

  // F7：剪藏扩展目录（引导安装/访达定位用）；打包产物未含时返回 null。
  // 打包后 extension/chrome 经 extraResources 落在 resources/extension，
  // app.asar 内路径 Finder/Chrome 均无法加载（审查 P2-30）
  ipcMain.handle('system:getExtensionDir', (): string | null => {
    const candidates = app.isPackaged
      ? [join(process.resourcesPath, 'extension'), join(app.getAppPath(), 'extension', 'chrome')]
      : [join(app.getAppPath(), 'extension', 'chrome')]
    for (const dir of candidates) {
      if (existsSync(dir)) return dir
    }
    return null
  })

  ipcMain.handle('system:openPath', (_e, p: string): boolean => {
    if (!p) return false
    if (!existsSync(p)) {
      log.warn('systemInfo', `openPath: not found ${p}`)
      return false
    }
    if (!isOpenPathAllowed(p)) {
      log.warn('systemInfo', `openPath: blocked non-whitelisted path ${p}`)
      return false
    }
    shell.openPath(p)
    return true
  })

  // 六期：书签打开原链接（仅放行 http/https，防恶意协议）
  ipcMain.handle('system:shareFiles', (_e, paths: string[]): boolean => showSharePanel(paths))
  ipcMain.handle('system:openExternal', (_e, url: string): boolean => {
    if (!/^https?:\/\//i.test(url ?? '')) return false
    void shell.openExternal(url)
    return true
  })

  // 十八轮 P3：在其它应用打开——弹出应用选择器（macOS 选 .app），返回应用路径。
  // 选中的路径记入会话白名单，openWith/revealInApp 只放行白名单内的 appPath（审查 P1-4）
  const sessionAllowedApps = new Set<string>()
  ipcMain.handle('system:pickApp', async (): Promise<string | null> => {
    const options: Electron.OpenDialogOptions = {
      title: '选择应用',
      properties: ['openFile'],
      filters:
        process.platform === 'darwin'
          ? [{ name: '应用', extensions: ['app'] }]
          : [{ name: '可执行文件', extensions: ['exe', 'lnk'] }]
    }
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = result.filePaths[0]
    sessionAllowedApps.add(picked)
    return picked
  })

  // 十八轮 P3：用指定应用打开文件。必须 execFile（数组参数、不经 shell）：
  // 旧实现 exec(`open -a "..." "..."`) 里 JSON.stringify 不转义 $()/反引号，
  // 渲染层传入恶意字符串即可执行任意命令（RCE）。
  // filePath 过白名单 + appPath 必须来自 pickApp/KNOWN_FILE_MANAGERS 白名单：
  // 否则 XSS 可拿 Terminal.app 打开任意脚本 = 变相 RCE（审查 P1-4）。
  ipcMain.handle('system:openWith', (_e, filePath: string, appPath: string): boolean => {
    if (
      !filePath ||
      !appPath ||
      !existsSync(filePath) ||
      !existsSync(appPath) ||
      !isOpenPathAllowed(filePath) ||
      !sessionAllowedApps.has(appPath)
    ) {
      return false
    }
    if (process.platform === 'darwin') {
      execFile('open', ['-a', appPath, filePath], (err) => {
        if (err) log.warn('system', `openWith failed: ${err.message}`)
      })
    } else {
      // 直接 CreateProcess/execve，无 shell 解析，注入面为零。
      // 已知限制：win32 的 .lnk 目标无法经 execFile 启动（CreateProcess 不解析快捷方式），
      // 用 explorer 打开快捷方式本体兜底（无法转发文件参数）。
      if (process.platform === 'win32' && appPath.toLowerCase().endsWith('.lnk')) {
        execFile('explorer.exe', [appPath], (err) => {
          if (err) log.warn('system', `openWith(lnk) failed: ${err.message}`)
        })
      } else {
        execFile(appPath, [filePath], (err) => {
          if (err) log.warn('system', `openWith failed: ${err.message}`)
        })
      }
    }
    return true
  })

  // 十八轮 P3：检测已安装的第三方文件管理器（Eagle「打开文件所在的位置▸」子菜单等价）
  const KNOWN_FILE_MANAGERS = [
    {
      name: 'Path Finder',
      appPath: '/Applications/Path Finder.app',
      bundle: 'com.cocoatech.pathfinder'
    },
    {
      name: 'ForkLift',
      appPath: '/Applications/ForkLift.app',
      bundle: 'com.binarynights.ForkLift'
    },
    { name: 'muCommander', appPath: '/Applications/muCommander.app', bundle: 'com.mucommander' }
  ]
  // 已知文件管理器路径预先入白名单（审查 P1-4）
  for (const fm of KNOWN_FILE_MANAGERS) {
    if (existsSync(fm.appPath)) sessionAllowedApps.add(fm.appPath)
  }
  // 已知文件管理器路径预先入白名单（审查 P1-4）
  for (const fm of KNOWN_FILE_MANAGERS) {
    if (existsSync(fm.appPath)) sessionAllowedApps.add(fm.appPath)
  }
  ipcMain.handle('system:listFileManagers', (): Array<{ name: string; appPath: string }> => {
    return KNOWN_FILE_MANAGERS.filter((fm) => existsSync(fm.appPath)).map((fm) => ({
      name: fm.name,
      appPath: fm.appPath
    }))
  })

  // 十八轮 P3：在指定文件管理器中显示文件所在位置（打开所在文件夹并选中文件）
  ipcMain.handle('system:revealInApp', (_e, filePath: string, appPath: string): boolean => {
    if (
      !filePath ||
      !appPath ||
      !existsSync(filePath) ||
      !existsSync(appPath) ||
      !isOpenPathAllowed(filePath) ||
      !sessionAllowedApps.has(appPath)
    ) {
      return false
    }
    const folder = dirname(filePath)
    // 同 openWith：execFile 数组参数，杜绝 shell 注入
    execFile('open', ['-a', appPath, folder], (err) => {
      if (err) log.warn('system', `revealInApp failed: ${err.message}`)
    })
    return true
  })
}
