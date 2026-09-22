/**
 * 截图全局快捷键（对齐 docs/modules/08-screenshot.md US-SC-01 的 ⌘⇧A）。
 * 注意：不做成应用菜单 accelerator——globalShortcut 与菜单 accelerator 双注册会双触发。
 */
import { globalShortcut } from 'electron'
import { screenshotService } from '../services/ScreenshotService'
import { NotificationService } from '../services/NotificationService'

export const SCREENSHOT_ACCELERATOR = 'CommandOrControl+Shift+A'

let registered = false
/** 已就「注册失败」通知过用户（设置页每次保存都会 reapply，避免重复弹通知） */
let failNotified = false

/** 按设置开关挂/摘快捷键（启动与设置变更时调用） */
export function reapplyScreenshotShortcut(): void {
  const enabled = screenshotService.getSettings().shortcutEnabled
  if (enabled && !registered) {
    const ok = globalShortcut.register(SCREENSHOT_ACCELERATOR, () => {
      void screenshotService.startCapture('region')
    })
    registered = ok
    if (!ok && !failNotified) {
      failNotified = true
      // 注册失败通常是其他应用（如 iShot）已占用该组合键——必须让用户知道，
      // 否则表现为「快捷键坏了」且无任何提示
      console.warn(
        `[Screenshot] globalShortcut ${SCREENSHOT_ACCELERATOR} register failed (occupied?)`
      )
      NotificationService.getInstance().showInfo(
        '截图快捷键注册失败',
        `${SCREENSHOT_ACCELERATOR} 可能已被其它应用（如 iShot）占用，请在设置中更换或关闭占用方`
      )
    }
  } else if (!enabled && registered) {
    globalShortcut.unregister(SCREENSHOT_ACCELERATOR)
    registered = false
    failNotified = false
  }
}

export function unregisterScreenshotShortcut(): void {
  if (registered) {
    globalShortcut.unregister(SCREENSHOT_ACCELERATOR)
    registered = false
  }
  failNotified = false
}
