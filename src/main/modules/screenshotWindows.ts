/**
 * 贴图窗工厂（frameless + 置顶 + skipTaskbar）。
 * 截图交互已整体交给 electron-screenshots（见 services/ScreenshotService），
 * 本模块只保留 Leaf 自己的贴图小窗：payload(dataURL) 存内存 Map，pin 页取回。
 */
import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { v4 as uuidv4 } from 'uuid'

interface PinPayload {
  dataUrl: string
  width: number
  height: number
}

const pinWindows = new Map<string, BrowserWindow>()
const pinPayloads = new Map<string, PinPayload>()

export function createPinWindow(payload: PinPayload): string {
  const id = uuidv4()
  const width = Math.max(60, Math.min(payload.width, 1200))
  const height = Math.max(60, Math.min(payload.height, 900))
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    skipTaskbar: true,
    resizable: true,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      spellcheck: false
    }
  })
  win.setMenu(null)
  win.setAlwaysOnTop(true, 'floating')
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/capture.html#pin?pid=${id}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/capture.html'), { hash: `pin?pid=${id}` })
  }
  win.once('ready-to-show', () => win.show())
  pinWindows.set(id, win)
  pinPayloads.set(id, payload)
  win.once('closed', () => {
    pinWindows.delete(id)
    pinPayloads.delete(id)
  })
  return id
}

export function getPinPayload(id: string): PinPayload | null {
  return pinPayloads.get(id) ?? null
}

export function closePinWindow(id: string): void {
  const win = pinWindows.get(id)
  if (win && !win.isDestroyed()) win.destroy()
  pinWindows.delete(id)
  pinPayloads.delete(id)
}

/** 主进程退出时统一回收 */
export function closeAllCaptureWindows(): void {
  for (const [, win] of pinWindows) if (!win.isDestroyed()) win.destroy()
  pinWindows.clear()
  pinPayloads.clear()
}
