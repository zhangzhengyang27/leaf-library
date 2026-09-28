/**
 * Leaf · 托盘（D-013 阶段 3，对齐 Eagle「在系统选单上显示图示」）
 *
 * - 左键/右键：都打开菜单（2026-09-28 定稿：原「一点即截」误触率高，截图走菜单项）
 * - 菜单：显示主窗口 / 截图 / 退出
 */
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { assetPath } from '../utils/assetPath'
import trayIcon from '../../../resources/tray.png?asset'
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
  // 18pt 彩色叶（tray.png + 同名 @2x 自动配对，系统按 18pt 画）；macOS 26 下 template
  // 形态状态项不被系统注册（electron#48812），故全平台统一彩色非 template 形态
  const imgPath = assetPath(trayIcon, __dirname)
  const image = nativeImage.createFromPath(imgPath)
  tray = new Tray(image)
  if (image.isEmpty()) {
    // 空图会得到一个 16px 宽、0 高的隐形状态项（2026-09-28 排查坑），必须显形
    console.warn(`[tray] 图标加载为空图: ${imgPath}`)
  }
  tray.setToolTip('Leaf 素材库')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => showMainWindow()
      },
      {
        label: '截图',
        click: () => {
          void screenshotService.startCapture('region')
        }
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
}

export function removeTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
