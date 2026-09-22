/**
 * Leaf · 托盘（D-013 阶段 3，对齐 Eagle「在系统选单上显示图示」）
 *
 * - 左键/单击：显示或聚焦主窗口（darwin 隐藏时不退出，配合 window-all-closed 分支）
 * - 右键菜单：显示主窗口 / 打开素材库 / 退出
 */
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import icon from '../../../resources/icon.png?asset'
import { screenshotService } from '../services/ScreenshotService'

let tray: Tray | null = null

function showMainWindow(): void {
  const win = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())
  const target = win ?? BrowserWindow.getAllWindows()[0]
  if (target) {
    if (target.isMinimized()) target.restore()
    target.show()
    target.focus()
  }
}

export function createTray(): void {
  if (tray) return
  const image = nativeImage.createFromPath(join(__dirname, icon)).resize({ width: 16, height: 16 })
  image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setToolTip('Leaf 素材库（点击截图）')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '截图',
        click: () => {
          void screenshotService.startCapture('region')
        }
      },
      {
        label: '显示主窗口',
        click: () => showMainWindow()
      },
      { type: 'separator' },
      {
        label: '退出 Leaf',
        // app.quit()（而非 app.exit(0)）：走 will-quit 清理（关库/停监控/停剪藏服务）
        click: () => {
          app.quit()
        }
      }
    ])
  )
  // 左键单击 = 立即截图（用户要求：菜单栏按钮一点即截）；主窗口从右键菜单进
  tray.on('click', () => {
    void screenshotService.startCapture('region')
  })
}

export function removeTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
