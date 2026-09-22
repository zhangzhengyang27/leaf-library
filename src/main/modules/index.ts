/**
 * 主进程模块统一导出（Leaf 素材库独立版）。
 */

// 窗口相关
export { createWindow as createAppWindow } from './windows'

// 协议注册（image:// thumb:// rawfile:// video://）
export { registerProtocols } from './protocols'
export { createTray, removeTray } from './tray'
export { installAppMenu } from './appMenu'

// 对话框工具
export { showOpenDialogFor, showSaveDialogFor } from './dialogs'

// 截图（贴图窗工厂 + 全局快捷键）
export {
  closeAllCaptureWindows,
  closePinWindow,
  createPinWindow,
  getPinPayload
} from './screenshotWindows'
export {
  reapplyScreenshotShortcut,
  unregisterScreenshotShortcut,
  SCREENSHOT_ACCELERATOR
} from './screenshotShortcuts'
