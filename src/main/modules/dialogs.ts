import {
  dialog,
  type BrowserWindow,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'

/**
 * 在有窗口时绑定到指定窗口展示打开文件/目录对话框；否则走无窗口重载。
 */
export async function showOpenDialogFor(
  win: BrowserWindow | null | undefined,
  options: OpenDialogOptions
) {
  if (win && !win.isDestroyed()) {
    return dialog.showOpenDialog(win, options)
  }
  return dialog.showOpenDialog(options)
}

/**
 * 在有窗口时绑定到指定窗口展示保存对话框；否则走无窗口重载。
 */
export async function showSaveDialogFor(
  win: BrowserWindow | null | undefined,
  options: SaveDialogOptions
) {
  if (win && !win.isDestroyed()) {
    return dialog.showSaveDialog(win, options)
  }
  return dialog.showSaveDialog(options)
}

/**
 * 在有窗口时绑定到指定窗口展示消息框；否则走无窗口重载。
 */
export async function showMessageBoxFor(
  win: BrowserWindow | null | undefined,
  options: Electron.MessageBoxOptions
) {
  if (win && !win.isDestroyed()) {
    return dialog.showMessageBox(win, options)
  }
  return dialog.showMessageBox(options)
}
