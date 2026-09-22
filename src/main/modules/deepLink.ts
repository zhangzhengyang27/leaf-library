/**
 * `leaf://` 深链接入（Eagle 的 `eagle://item/<id>` 那一条）
 *
 * 三条入口都得接，少一条就会出现"有时能跳有时不能"：
 *  - macOS 冷启动/热启动：`open-url`（必须在 whenReady 之前挂，冷启动时它可能先到）；
 *  - Windows/Linux 热启动：`second-instance` 的 argv；
 *  - Windows/Linux 冷启动：进程自身的 argv。
 *
 * 冷启动还有一次竞态：链接到达时渲染层还没 mount，push 过去没人听。
 * 所以链接**先存后发**，渲染层起来后既收 push 也主动 take 一次。
 *
 * 只在打包态注册 scheme：dev 下 `setAsDefaultProtocolClient` 会把**通用 Electron
 * 二进制**写成 leaf: 的处理器并落到用户机器的 LaunchServices 里——那是开发机被悄悄改配置，
 * 而且注册一次就留着，卸载 dev 构建也不会自己清掉。
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { parseDeepLink, DEEP_LINK_SCHEME, type DeepLinkTarget } from '@shared/deepLink'

let pending: DeepLinkTarget | null = null
let getWindow: (() => BrowserWindow | null) | null = null

/** 推给窗口；推不动（还没窗口/已销毁）才暂存，避免 take 时重复打开同一个预览 */
function accept(raw: unknown): boolean {
  const target = parseDeepLink(raw)
  if (!target) return false
  const win = getWindow?.() ?? null
  if (!win || win.isDestroyed()) {
    pending = target
    return false
  }
  pending = null
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.webContents.send('app:deepLink', target)
  return true
}

/**
 * 从 argv 里找第一条**能解析**的 leaf: 参数（Windows/Linux 的深链都走这里）。
 * 逐个试而不是 find 第一条：坏链接排在前面时不该把后面那条真的挡掉。
 */
function fromArgv(argv: string[]): void {
  for (const a of argv) {
    if (a.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}://`) && accept(a)) return
  }
}

/** 渲染层起来后主动取一次；取走即清，避免刷新页面反复弹同一个预览 */
export function takePendingDeepLink(): DeepLinkTarget | null {
  const p = pending
  pending = null
  return p
}

export function registerDeepLinkHandlers(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
  // 渲染层起来后主动取一次（冷启动时 push 没人听，这条是唯一的兜底）
  ipcMain.handle('app:takeDeepLink', () => takePendingDeepLink())

  if (app.isPackaged) {
    // 失败不抛：dev/沙箱/未安装态拿不到 handler 属正常
    try {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
    } catch {
      /* 忽略 */
    }
  } else {
    console.log('[DeepLink] 非打包态，跳过 scheme 注册（避免改动本机 LaunchServices）')
  }

  if (process.platform === 'darwin') {
    app.on('open-url', (event, url) => {
      event.preventDefault()
      if (!accept(url)) console.log('[DeepLink] 已暂存待渲染层取回:', url)
    })
  } else {
    app.on('second-instance', (_e, argv) => fromArgv(argv))
  }
  // argv 三条平台都扫：macOS 上正常不会有 leaf: 参数（走 open-url），
  // 但 `open --args leaf://…` 与验收脚本要能进同一条路径，省得为测试单开一条后门
  fromArgv(process.argv)
}
