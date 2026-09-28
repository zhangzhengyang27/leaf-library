import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { assetPath } from '../utils/assetPath'
import icon from '../../../resources/icon.png?asset'
import { is } from '@electron-toolkit/utils'
import { preferencesStore } from '../stores'

/**
 * 窗口启动底色：跟随**应用主题偏好**而非系统外观。
 * 旧版直接读 nativeTheme，导致「应用设为浅色 + 系统为深色」时新窗口闪一下黑，
 * 反之亦然。改为解析 theme 三态（light / dark / auto）。
 */
function resolveWindowBackground(): string {
  let theme: 'light' | 'dark' | 'auto' = 'auto'
  try {
    theme = preferencesStore.getTheme()
  } catch {
    // 偏好未就绪时跟随系统
  }
  const dark = theme === 'dark' || (theme === 'auto' && nativeTheme.shouldUseDarkColors)
  // 与 tokens.css v4 的 --surface-0（亮/暗画布）保持一致，避免首帧跳色
  return dark ? '#191a1e' : '#f5f5f7'
}

/**
 * 窗口登记表：route → BrowserWindow
 * BUGS.md B2：同 route 的窗口已存在时复用（focus + 进程内路由跳转），
 * 避免每次点击模块卡 / ⌘1-9 都 new 一个完整渲染进程导致窗口无限堆积。
 */
const routeWindows = new Map<string, BrowserWindow>()

export function createWindow(route?: string): BrowserWindow {
  // ── 复用分支：该 route 已有存活窗口 → 聚焦并做进程内导航 ──
  if (route) {
    const existing = routeWindows.get(route)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
      existing.webContents.send('navigate-to-route', route)
      return existing
    }
  }

  const window = new BrowserWindow({
    width: 1450,
    height: 950,
    show: false,
    autoHideMenuBar: true,
    /**
     * 启动背景色：避免 ready-to-show 之前的「白屏 / 黑闪」（BUGS.md B4）。
     * 跟随应用主题偏好（默认跟随系统），并与 tokens.css 的 --surface-* 对齐。
     */
    backgroundColor: resolveWindowBackground(),
    // Edge 式自绘标题栏（DECISIONS.md D-008）：darwin 保留系统红绿灯、
    // 拖拽区交给渲染层 TitleBar（-webkit-app-region）；其他平台维持系统标题栏
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'linux' ? { icon: assetPath(icon, __dirname) } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 代码审查 P0-6：开沙箱——preload 仅用 ipcRenderer（无 Node 依赖），
      // 沙箱化后即使渲染层 XSS 也拿不到 Node 能力；移除 webviewTag 缩小攻击面
      sandbox: true,
      spellcheck: false,
      webSecurity: true
    }
  })

  // 带 route 的窗口纳入登记表，关闭时清除
  if (route) {
    routeWindows.set(route, window)
    window.once('closed', () => {
      routeWindows.delete(route)
    })
  }

  // 代码审查 P0-6：仅允许 https 外链交给系统浏览器；其余协议（file/custom）一律拒绝
  window.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://')) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // 阻止主窗口被导航到外部 URL（被注入的 <a target> / location 跳转等）。
  // 收紧（审查 P3-27）：生产只放行应用自身入口文件（忽略 hash 的绝对路径），
  // 任意 file:// 曾被放行——被注入的渲染层可导航到磁盘上任意本地 HTML，
  // 该窗口仍加载同一 preload，window.api 对恶意页面可用
  const entryFileUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const allowed =
      (is.dev && devUrl !== undefined && url.startsWith(devUrl)) ||
      url.split('#')[0] === entryFileUrl
    if (!allowed) event.preventDefault()
  })

  // 页面加载完成后发送路由导航消息
  if (route) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.webContents.send('navigate-to-route', route)
        }
      }, 200)
    })
  }

  // 页面准备就绪后显示窗口（避免白屏）
  window.once('ready-to-show', () => {
    window.show()
  })

  // 十五轮 QA：每次加载强制 100% 缩放——Chromium 会按源持久化 ⌘+/⌘- 的页面缩放，
  // 一旦误触会把整个界面放大（用户实测 150%：侧栏 450px/行高 40px，与 Eagle 永远对不上）。
  // 需要临时缩放仍可用「显示」菜单的 放大/缩小/实际大小。
  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) window.webContents.setZoomLevel(0)
  })

  // 安全保障：如果 ready-to-show 未触发，延迟后强制显示
  setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible()) {
      window.show()
    }
  }, 1000)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = route
      ? `${process.env['ELECTRON_RENDERER_URL']}#${route}`
      : process.env['ELECTRON_RENDERER_URL']
    window.loadURL(url)
    // 开发模式默认打开开发者工具（electron-vite 官方模板惯例）
    window.webContents.openDevTools()
  } else {
    const filePath = join(__dirname, '../renderer/index.html')
    // 十五轮 D18：带 route 的窗口把路由写进 hash（#/photos?boot-view=…），生产模式同样生效
    window.loadFile(filePath, route ? { hash: route } : undefined)
  }

  return window
}
