/**
 * Leaf · 应用原生菜单（D-012 阶段 4，对齐 Eagle 菜单结构）
 *
 * Eagle 实测菜单：Eagle / 资源库 / 文件 / 编辑 / 查找 / 标签 / 显示 / 窗口 / 帮助。
 * Leaf 映射：
 * - 资源库：库列表（点击切换，重启生效）+ 清除缓存并重新加载
 * - 文件/查找/标签/显示：webContents.send('app:menu-action', { action }) 交由渲染层执行
 * - 设置 ⌘, / 关于：app:openSettings / app:openAbout（useAppMenu 已订阅）
 */
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
  type MenuItemConstructorOptions,
  type WebContents
} from 'electron'
import { getActiveLibrary, listLibraries, setActiveLibrary } from './libraryRegistry'
import { screenshotService } from '../services/ScreenshotService'
import { AutoUpdateService } from '../services/AutoUpdateService'

const REPO_URL = 'https://github.com/zhangzhengyang27/leaf-library'

function sendToAll(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function sendMenuAction(action: string): void {
  sendToAll('app:menu-action', { action })
}

/**
 * 菜单触发的检查更新全流程（不依赖设置页在场，反馈走原生对话框）：
 * dev → 说明；not-available → 已最新；available → 下载/去设置/稍后；
 * 下载完成 → 退出并安装；downloading/downloaded 时点入给对应状态。
 */
async function runUpdateFlowFromMenu(): Promise<void> {
  // dev：electron-updater 官方跳过未打包应用（dev-app-update.yml 还是占位源），直说别哑火
  if (!app.isPackaged) {
    await dialog.showMessageBox({
      type: 'info',
      title: '检查更新',
      message: '开发模式不检查更新',
      detail:
        'electron-updater 仅在打包安装后工作（发布源：GitHub Releases）。正式版里本菜单项即真实检查入口。'
    })
    return
  }
  const status = AutoUpdateService.getStatus()
  if (status === 'downloaded') {
    await offerInstall()
    return
  }
  if (status === 'downloading') {
    await dialog.showMessageBox({
      type: 'info',
      title: '检查更新',
      message: '新版本正在下载中',
      detail: '到 设置 → 关于 可看进度；下载完成后会再次询问是否安装。'
    })
    return
  }
  const result = await AutoUpdateService.checkForUpdates()
  if (result === 'available') {
    const info = AutoUpdateService.getCachedInfo()
    const notes = typeof info?.releaseNotes === 'string' ? info.releaseNotes.slice(0, 400) : ''
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: '检查更新',
      message: `发现新版本 v${info?.version ?? '?'}（当前 v${AutoUpdateService.getCurrentVersion()}）`,
      detail: notes || '到设置页可查看详情。',
      buttons: ['立即下载', '打开设置页', '稍后'],
      defaultId: 0,
      cancelId: 2
    })
    if (response === 0) {
      armInstallPrompt()
      void AutoUpdateService.downloadUpdate()
    } else if (response === 1) {
      sendToAll('app:openSettings')
    }
    return
  }
  if (result === 'not-available') {
    await dialog.showMessageBox({
      type: 'info',
      title: '检查更新',
      message: `Leaf 已是最新版本（v${AutoUpdateService.getCurrentVersion()}）`
    })
    return
  }
  if (result === 'error') {
    await dialog.showMessageBox({
      type: 'warning',
      title: '检查更新',
      message: '检查更新失败',
      detail: AutoUpdateService.getLastError() ?? '未知错误'
    })
  }
}

/** 下载完成后弹「退出并安装」；出错即撤侦听（错误自有 error 事件兜底） */
function armInstallPrompt(): void {
  const off = AutoUpdateService.onEvent(async (e) => {
    if (e.status === 'downloaded') {
      off()
      await offerInstall()
    } else if (e.status === 'error') {
      off()
    }
  })
}

async function offerInstall(): Promise<void> {
  const info = AutoUpdateService.getCachedInfo()
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '安装更新',
    message: `v${info?.version ?? '新版本'} 下载完成`,
    detail: '退出 Leaf 并安装新版本？',
    buttons: ['退出并安装', '稍后'],
    defaultId: 0,
    cancelId: 1
  })
  if (response === 0) AutoUpdateService.quitAndInstall()
}

function focusedWebContents(): WebContents | null {
  return BrowserWindow.getFocusedWindow()?.webContents ?? null
}

function nativeEdit(
  method: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'delete' | 'selectAll'
): () => void {
  return () => focusedWebContents()?.[method]()
}

/**
 * 编辑菜单项（剪切/拷贝/全选）：先做原生编辑（输入框内选中文本时生效），
 * 再让渲染层合成对应 keydown。不能直接用 role: editMenu——macOS 上菜单
 * 加速键会吞掉 renderer 的 keydown（electron#32477 等），⌘C 复制文件 /
 * ⌘X 剪切 / ⌘A 全选的应用级分支会整条失效。
 * 合成事件经 app:menu-action 派发到加载了 App.vue 的窗口（es 截图窗/pin 页
 * 无监听者，天然忽略），由 usePhotoKeyboard 的既有分支统一裁决
 * （isFormTarget 让路 → 输入框内原生 copy/cut 已在上面执行，互不冲突）。
 */
function editWithSynth(
  method: 'cut' | 'copy' | 'selectAll',
  key: string,
  code: string
): () => void {
  return () => {
    nativeEdit(method)()
    const isMac = process.platform === 'darwin'
    sendToAll('app:menu-action', {
      action: 'synthesize-shortcut',
      key,
      code,
      metaKey: isMac,
      ctrlKey: !isMac
    })
  }
}

const editSubmenu: MenuItemConstructorOptions[] = [
  { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: nativeEdit('undo') },
  { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', click: nativeEdit('redo') },
  { type: 'separator' },
  { label: '剪切', accelerator: 'CmdOrCtrl+X', click: editWithSynth('cut', 'x', 'KeyX') },
  { label: '拷贝', accelerator: 'CmdOrCtrl+C', click: editWithSynth('copy', 'c', 'KeyC') },
  { label: '粘贴', accelerator: 'CmdOrCtrl+V', click: nativeEdit('paste') },
  {
    label: '粘贴并匹配样式',
    accelerator: 'Shift+CmdOrCtrl+V',
    click: nativeEdit('pasteAndMatchStyle')
  },
  { label: '删除', click: nativeEdit('delete') },
  { type: 'separator' },
  { label: '全选', accelerator: 'CmdOrCtrl+A', click: editWithSynth('selectAll', 'a', 'KeyA') }
]

export function installAppMenu(): void {
  const isMac = process.platform === 'darwin'

  if (isMac) {
    // dev 下 app.name 是 "leaf-library"/"Electron"，关于面板统一钉成产品名
    app.setAboutPanelOptions({
      applicationName: 'Leaf 素材库',
      applicationVersion: app.getVersion()
    })
  }

  const libraryItems: MenuItemConstructorOptions[] = listLibraries().map((l) => ({
    label: l.id === getActiveLibrary().id ? `✓ ${l.name}` : l.name,
    click: () => {
      setActiveLibrary(l.id)
      // relaunch + quit（而非 exit）：确保 will-quit 清理执行后再重启
      app.relaunch()
      app.quit()
    }
  }))

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            // 显式产品名：dev 下 app.name 是包名 "leaf-library"，不钉会露出来
            label: 'Leaf 素材库',
            submenu: [
              { role: 'about', label: '关于 Leaf' },
              {
                label: '检查更新…',
                click: () => {
                  void runUpdateFlowFromMenu()
                }
              },
              { type: 'separator' },
              {
                label: '设置…',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendToAll('app:openSettings')
              },
              { type: 'separator' },
              { role: 'services', label: '服务' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏 Leaf' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: '退出 Leaf' }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: '资源库',
      submenu: [
        ...libraryItems,
        { type: 'separator' },
        {
          label: '清除缓存并重新加载',
          click: () => {
            app.relaunch()
            app.quit()
          }
        }
      ]
    },
    {
      label: '文件',
      submenu: [
        {
          label: '导入文件夹…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuAction('import-folder')
        },
        {
          label: '导入文件…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuAction('import-files')
        },
        {
          // 全局键归 globalShortcut（⌘⇧A）管，这里故意不配 accelerator 防双触发
          label: '截图',
          click: () => {
            void screenshotService.startCapture('region')
          }
        },
        {
          label: '收藏网址…',
          accelerator: 'CmdOrCtrl+L',
          click: () => sendMenuAction('bookmark')
        },
        { type: 'separator' },
        {
          label: '新增智能文件夹…',
          accelerator: 'Alt+CmdOrCtrl+N',
          click: () => sendMenuAction('new-smart')
        },
        { type: 'separator' },
        // 十五轮 C14：⋯更多菜单迁移入原生菜单（Eagle 工具栏无 ⋯ 按钮）
        {
          label: '批量重命名…',
          click: () => sendMenuAction('batch-rename')
        },
        {
          label: '转换为 WebP…',
          click: () => sendMenuAction('convert-webp')
        },
        {
          label: '导出选中…',
          click: () => sendMenuAction('export-selected')
        },
        {
          label: '移除选中',
          click: () => sendMenuAction('remove-selected')
        },
        {
          label: '移除全部素材…',
          click: () => sendMenuAction('remove-all')
        },
        { type: 'separator' },
        {
          label: '设置密码锁…',
          click: () => sendMenuAction('lock')
        }
      ]
    },
    // 自建编辑菜单（role: editMenu 的加速键在 macOS 会吞 renderer keydown，见 editWithSynth 注释）
    { label: '编辑', submenu: editSubmenu },
    {
      label: '查找',
      submenu: [
        {
          label: '搜索素材',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendMenuAction('focus-search')
        },
        {
          label: '命令面板',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendToAll('app:openCommandPalette')
        },
        { type: 'separator' },
        {
          label: '相似查重…',
          click: () => sendMenuAction('duplicates')
        },
        {
          label: '选择模式',
          click: () => sendMenuAction('selection-mode')
        }
      ]
    },
    // 十五轮批6：整理菜单（Eagle organize.* 语义：对选中批量评分/标签/归组）
    {
      label: '整理',
      submenu: [
        {
          label: '评分',
          submenu: [
            ...[1, 2, 3, 4, 5].map((n) => ({
              label: `${'★'.repeat(n)}`,
              click: () => sendMenuAction(`organize-rating-${n}`)
            })),
            { type: 'separator' as const },
            { label: '取消评分', click: () => sendMenuAction('organize-rating-0') }
          ]
        },
        {
          label: '添加标签…',
          click: () => sendMenuAction('organize-tag-add')
        },
        {
          label: '复制标签',
          click: () => sendMenuAction('organize-tag-copy')
        },
        {
          label: '粘贴标签',
          click: () => sendMenuAction('organize-tag-paste')
        },
        {
          label: '清除标签',
          click: () => sendMenuAction('organize-tag-clear')
        },
        { type: 'separator' },
        {
          label: '添加至文件夹…',
          click: () => sendMenuAction('organize-folder-add')
        }
      ]
    },
    {
      label: '标签',
      submenu: [
        {
          label: '标签管理…',
          click: () => sendMenuAction('open-tags')
        }
      ]
    },
    {
      label: '显示',
      submenu: [
        {
          label: '切换布局',
          accelerator: 'CmdOrCtrl+\\',
          click: () => sendMenuAction('layout-next')
        },
        { type: 'separator' },
        {
          label: '地图视图',
          click: () => sendMenuAction('map')
        },
        {
          label: '切换深色/浅色主题',
          click: () => sendMenuAction('toggle-theme')
        },
        { type: 'separator' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'resetZoom', label: '实际大小' },
        { type: 'separator' },
        {
          label: '显示/隐藏筛选行',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendMenuAction('toggle-filter')
        },
        {
          label: '显示/隐藏侧栏',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendMenuAction('toggle-sidebar')
        },
        { type: 'separator' },
        {
          label: '打开开发者工具',
          accelerator: 'Alt+CmdOrCtrl+I',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
            if (win && !win.isDestroyed()) {
              const wc = win.webContents
              if (wc.isDevToolsOpened()) {
                wc.closeDevTools()
              } else {
                wc.openDevTools({ mode: 'detach' })
              }
            }
          }
        }
      ]
    },
    { role: 'windowMenu' },
    {
      // 不用 role:'help'——mac 上它会混入系统搜索框，与自建项叠加行为含混
      label: '帮助',
      submenu: [
        {
          label: '前往 GitHub 仓库',
          click: () => {
            void shell.openExternal(REPO_URL)
          }
        },
        {
          label: '反馈问题…',
          click: () => {
            void shell.openExternal(`${REPO_URL}/issues`)
          }
        },
        ...(isMac
          ? []
          : ([
              { type: 'separator' } as const,
              {
                label: '关于 Leaf',
                click: () => sendToAll('app:openAbout')
              },
              {
                label: '检查更新…',
                click: () => {
                  void runUpdateFlowFromMenu()
                }
              }
            ] as MenuItemConstructorOptions[]))
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
