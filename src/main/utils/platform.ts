/**
 * Leaf · 平台差异集中工具
 *
 * 目标：把所有 process.platform === 'darwin' / 'win32' / 'linux' 分支
 * 集中到这一处。模块代码直接 import 语义化函数（isMac / isWin / isLinux），
 * 不再散落字符串判断。
 *
 * 来源：docs/DECISIONS.md「平台差异集中化」（P1-4）
 */

export const PLATFORM = {
  darwin: 'darwin',
  win32: 'win32',
  linux: 'linux'
} as const

export type Platform = (typeof PLATFORM)[keyof typeof PLATFORM]

export function isMac(): boolean {
  return process.platform === PLATFORM.darwin
}

export function isWin(): boolean {
  return process.platform === PLATFORM.win32
}

export function isLinux(): boolean {
  return process.platform === PLATFORM.linux
}

/**
 * 平台对应的「主修饰键」符号（用于菜单 / 快捷键 UI 提示）
 * - Mac: ⌘
 * - Win/Linux: Ctrl
 */
export function modKeyLabel(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

/**
 * 平台对应的「主修饰键」名（用于 accelerator 字段）
 * - Mac: Cmd
 * - Win/Linux: Ctrl
 */
export function modKeyName(): 'Cmd' | 'Ctrl' {
  return isMac() ? 'Cmd' : 'Ctrl'
}

/**
 * 把通用 accelerator 字符串转成当前平台格式。
 * 用法：toAccelerator('Mod+K') → 'Cmd+K' 或 'Ctrl+K'
 */
export function toAccelerator(s: string): string {
  const m = modKeyName()
  return s.replace(/Mod/g, m)
}

/**
 * 「文件管理器」入口抽象。
 * - Mac: Finder
 * - Win: Explorer
 * - Linux: Files / Nautilus（openPath 自动选默认）
 */
export function fileManagerLabel(): string {
  if (isMac()) return '访达'
  if (isWin()) return '资源管理器'
  return '文件管理器'
}

/**
 * 平台对应的 dock / 任务栏「未读数」badge。
 *
 * - Mac: app.dock.setBadge(text) —— 显示红圆角文本
 * - Win/Linux: app.setBadgeCount(n) —— Win 任务栏覆盖图标 + Linux Unity launcher
 *
 * 传 0 / '' / null 表示清空。
 */
export function setDockBadge(text: string | number | null): void {
  // Mac dock 支持任意文本；Win/Linux 只接受 count
  if (isMac() && app.dock) {
    app.dock.setBadge(text === null ? '' : String(text))
  } else {
    const n = typeof text === 'number' ? text : text === '' || text === null ? 0 : Number(text) || 0
    if (Number.isFinite(n)) app.setBadgeCount(n)
  }
}

/**
 * 平台对应的 dock 弹跳（用户通知用）。
 * - Mac: app.dock.bounce(type) —— 'critical' 持续到用户激活，'informational' 1 秒
 * - Win/Linux: BrowserWindow.flashFrame(true) —— 任务栏图标闪烁
 *
 * Win/Linux 需要 BrowserWindow；Mac 只要 dock。
 */
export function requestUserAttention(
  win: BrowserWindow | null,
  level: 'critical' | 'informational' = 'informational'
): void {
  if (isMac() && app.dock) {
    app.dock.bounce(level)
  } else if (win && !win.isDestroyed()) {
    win.flashFrame(true)
    // Win: 切回前台后停止闪烁
    win.once('focus', () => win.flashFrame(false))
  }
}

/**
 * 任务栏 / Dock 进度条（屏幕录制、文件下载等场景用）。
 * - Mac: BrowserWindow.setProgressBar(fraction, { mode: 'normal' | 'paused' | 'error' })
 * - Win: 同 API
 * - Linux: Unity launcher（依赖 DE 支持）
 *
 * fraction: -1（清除）/ 0-1（进度）
 */
export function setProgressBar(win: BrowserWindow | null, fraction: number): void {
  if (!win || win.isDestroyed()) return
  if (fraction < 0) {
    win.setProgressBar(-1)
    return
  }
  win.setProgressBar(Math.min(1, Math.max(0, fraction)))
}

/**
 * 平台对应的「quit 拦截」行为。
 * - Mac: 关闭所有窗口不退出（标准 macOS 行为）；仅 Dock 右键 / Cmd+Q 真退出
 * - Win/Linux: 关闭最后一个窗口 = 退出应用
 *
 * Electron 默认行为已正确，但 app.on('window-all-closed') 内不需要主动 quit
 * Mac 上。这里集中一个常量方便 caller 引用。
 */
export function shouldQuitOnAllWindowsClosed(): boolean {
  return !isMac()
}

/**
 * 平台对应的「托盘点击默认行为」。
 * - Mac: 点击切换窗口可见性（菜单走 dock）
 * - Win/Linux: 点击直接弹菜单
 */
export function trayClickShouldToggleWindow(): boolean {
  return isMac()
}

// Re-export electron 引用以避免 caller 重复 import
import { app, BrowserWindow } from 'electron'
