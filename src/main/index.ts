import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
// 数据存储实例
import { tagStore, preferencesStore, photoStore } from './stores'
// IPC 处理器
import {
  registerNotificationIpcHandlers,
  registerPhotoIpcHandlers,
  registerPreferencesIpcHandlers,
  registerPrettierIpcHandlers,
  registerTagIpcHandlers,
  registerAutoUpdateIpcHandlers,
  registerSystemInfoIpcHandlers,
  registerLogIpcHandlers,
  registerPlatformIpcHandlers,
  registerClipServerIpcHandlers,
  registerDeepSeekIpcHandlers,
  registerWallpaperIpcHandlers,
  registerLibrariesIpcHandlers,
  registerWatchedFoldersIpcHandlers,
  registerClipboardWatchIpcHandlers,
  registerStorageIpcHandlers,
  registerBackupIpcHandlers,
  registerVectorsIpcHandlers,
  registerSearchIpcHandlers,
  registerEditIpcHandlers,
  registerMediaIpcHandlers,
  registerAnnotationIpcHandlers,
  registerPluginsIpcHandlers,
  registerScreenshotIpcHandlers
} from './ipc'
// 主进程模块
import {
  createAppWindow,
  createTray,
  installAppMenu,
  registerProtocols,
  registerDeepLinkHandlers,
  reapplyScreenshotShortcut,
  unregisterScreenshotShortcut
} from './modules'
import { dbPathOf, ensureRegistry, getActiveLibrary } from './modules/libraryRegistry'
// dev 下 dock 显示 Electron 默认图标（打包态由 build/icon.icns 提供），这里补设
import dockIconPath from '../../resources/icon.png?asset'
import { assetPath } from './utils/assetPath'
// SQLite 单例
import { installDatabase, setDatabasePath, uninstallDatabase } from './db/database'
import { log, installGlobalLogHandlers } from './services/LogService'
// 素材库处理管线（缩略图/EXIF/哈希/主色）
import { AssetProcessingService } from './services/AssetProcessingService'
import { getThumbnailService } from './services/ThumbnailService'
import { logFormatCapability } from './utils/formatCapability'
import { setAssetProcessingRef } from './services/assetProcessingRef'
import { getClipServer } from './services/ClipServer'
import { watchedFoldersService } from './services/WatchedFoldersService'
import { screenshotService } from './services/ScreenshotService'
import { photoRepository } from './db/repos/PhotoRepository'

let mainWindow: BrowserWindow | null = null

// 素材库后台处理服务（installDatabase 后创建）
let assetProcessing: AssetProcessingService | null = null

// 全局异常兜底：console 留痕 + 落 LogService（旧实现只 console.error，
// 用户机器上的崩溃主进程日志永远收不到；installGlobalLogHandlers 是补充监听，不冲突）。
// 致命错误分级（审查 P3-26）：60s 窗口内 uncaughtException 连续 ≥3 次，
// 说明进程已带伤运行（DB 写入中途异常等），提示用户并主动退出而非静默腐烂
let uncaughtCount = 0
let uncaughtWindowStart = Date.now()
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught Exception:', error)
  log.error('main', `uncaughtException: ${error.message}`, error)
  const now = Date.now()
  if (now - uncaughtWindowStart > 60_000) {
    uncaughtWindowStart = now
    uncaughtCount = 0
  }
  uncaughtCount += 1
  if (uncaughtCount >= 3 && app.isReady()) {
    dialog.showErrorBox(
      'Leaf 遇到连续错误',
      '应用遇到连续内部错误，即将退出。请重新启动；若反复出现，请导出日志反馈。'
    )
    app.quit()
  }
})
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled Rejection:', reason)
  log.error('main', `unhandledRejection: ${String(reason)}`, reason)
})
installGlobalLogHandlers()

// 抑制 macOS 输入法相关的警告（需要在应用启动前设置）
if (process.platform === 'darwin') {
  const originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = function (chunk: any, encoding?: any, callback?: any) {
    if (typeof chunk === 'string' && chunk.includes('IMKCFRunLoopWakeUpReliable')) {
      return true
    }
    return originalWrite(chunk, encoding, callback)
  }
}

// leaf:// 深链：监听器必须挂在模块加载期——macOS 冷启动时 open-url 可能在
// whenReady 兑现之前就到，晚一步这条链接就永远丢了
registerDeepLinkHandlers(() => mainWindow)

// D-013：单实例锁（重复启动聚焦已有窗口）
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    } else {
      // darwin 常驻托盘、窗口全关后再次启动（审查 P3-25）：
      // 旧实现什么都不做，用户以为启动失败；重建主窗口与 activate 行为对齐
      mainWindow = createAppWindow()
      // 与 whenReady / activate 两处一致：关窗必须清空，否则下面的
      // mainWindow?.webContents.send 会对已销毁实例抛 Object has been destroyed
      mainWindow.on('closed', () => {
        mainWindow = null
      })
    }
  })

  app.whenReady().then(() => {
    // 注册协议（image:// thumb:// rawfile:// video://）
    registerProtocols()

    // dev 补 dock 图标：macOS 26 砍了 dock 私有 API——NativeImage 形态静默失效（electron#47327），
    // 路径字符串形态在 Electron 44 可用（zhiye 同款实证）。打包态走 icns 不需要。
    if (process.platform === 'darwin' && !app.isPackaged) {
      try {
        app.dock?.setIcon(assetPath(dockIconPath, __dirname))
      } catch (e) {
        console.warn('[dock] setIcon failed:', e)
      }
    }


    // 格式能力探测：把 sharp 真实解码面写进日志，白名单与解码通道脱节时显形
    logFormatCapability()

    // D-013 多资源库：先解析激活库（首启把 userData 登记为默认库），再按其路径开库
    ensureRegistry()
    setDatabasePath(dbPathOf(getActiveLibrary()))

    // D-012 原生菜单（资源库子菜单依赖注册表就绪）
    installAppMenu()

    // 初始化 SQLite 数据库（最早：service 层后面要拿 handle）
    installDatabase()
    try {
      log.loadTelemetryMode()
    } catch {
      /* ignore */
    }

    // 素材库后台处理管线：创建后恢复未完成的处理任务（断点续跑）
    assetProcessing = new AssetProcessingService({
      photos: photoRepository,
      thumbs: getThumbnailService(),
      notify: (p) => {
        mainWindow?.webContents.send('photos:processing', p)
      }
    })
    setAssetProcessingRef(assetProcessing)

    // 浏览器剪藏服务：本地回环 HTTP API（扩展/MCP 共用）
    import('./services/ClipServer')
      .then(({ getClipServer }) => getClipServer().start())
      .catch((error) => console.error('[Main] ClipServer 启动失败:', error))

    void assetProcessing.recoverPending().catch((error) => {
      console.error('[Main] 素材处理恢复失败:', error)
    })

    electronApp.setAppUserModelId('com.leaf.library')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // 注册所有 IPC 处理器（模块化）
    registerNotificationIpcHandlers()
    registerTagIpcHandlers(tagStore)
    registerPrettierIpcHandlers(preferencesStore)
    registerPreferencesIpcHandlers(preferencesStore)
    registerPhotoIpcHandlers(
      () => mainWindow,
      photoStore,
      () => assetProcessing
    )
    registerAutoUpdateIpcHandlers()
    registerSystemInfoIpcHandlers()
    registerLogIpcHandlers()
    registerPlatformIpcHandlers(() => mainWindow)
    registerClipServerIpcHandlers()
    registerDeepSeekIpcHandlers(() => mainWindow)
    registerWallpaperIpcHandlers()
    registerLibrariesIpcHandlers()
    registerWatchedFoldersIpcHandlers()
    registerPluginsIpcHandlers(() => mainWindow)
    registerScreenshotIpcHandlers(() => mainWindow)
    reapplyScreenshotShortcut()

    // 阶段 4.4：监控文件夹自动导入（偏好存各库 pref_preferences，切库 relaunch 后自动恢复）
    watchedFoldersService.init()

    // F8：剪贴板常驻监听（按偏好自启动；开关读写走 clipboardWatch:* 通道）
    registerClipboardWatchIpcHandlers()

    // F11：库存储模式 / 断链扫描（注册后 3s 静默扫描一次）
    registerStorageIpcHandlers()

    // F16：库定时备份（注册即挂到期检查；开关关闭时定时器不启动）
    registerBackupIpcHandlers()

    // G1：图像向量档（状态/下载/建索引/找相似/文搜图）
    registerVectorsIpcHandlers()

    // 中文分词取词（词典只在主进程一份，渲染层来这儿取同一套词）
    registerSearchIpcHandlers()

    // P1：图片就地编辑（旋转/翻转，编辑前先收库内副本）
    registerEditIpcHandlers()

    // P1：视频同目录字幕轨
    registerMediaIpcHandlers()

    // P1：标注 comments[]（存储 + 校验在 @shared/annotations 一份）
    registerAnnotationIpcHandlers()

    // 003：后台分批回填缺失的文件系统时间（低优先级，逐批让出事件循环）
    // 十五轮 A1：同循环顺带回填 file_size=0 的存量行；A2 补齐缺失宽高；完成后通知渲染层刷新
    // （启动时渲染层先于回填加载，存量库首启会短暂显示 0 KB / —）
    // 代码审查 P1：保存 timer 句柄，will-quit 时可终止
    let backfillTimer: NodeJS.Timeout | null = null
    let backfillHadWork = false
    const backfillFileDatesLoop = (): void => {
      void (async () => {
        try {
          const dates = photoRepository.backfillFileDates(200)
          const sizes = photoRepository.backfillFileSizes(200)
          const dims = (await assetProcessing?.backfillMissingDimensions(100)) ?? 0
          // 022：存量视频的实测帧率（逐帧步进用）；每张一次 ffmpeg -i，批次给得小
          const fps = (await assetProcessing?.backfillMissingFps(50)) ?? 0
          if (dates + sizes + dims + fps > 0) {
            backfillHadWork = true
            backfillTimer = setTimeout(backfillFileDatesLoop, 250)
          } else {
            if (backfillHadWork && mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('photos:backfilled')
            }
            backfillHadWork = false
            backfillTimer = null
          }
        } catch (error) {
          console.error('[Main] backfillFileDates:', error)
          backfillTimer = null
        }
      })()
    }
    setTimeout(backfillFileDatesLoop, 3000)

    // 创建新窗口 IPC 处理
    ipcMain.handle('create-new-window', (_event, route: string) => {
      createAppWindow(route)
      return true
    })

    mainWindow = createAppWindow()

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    // 确保主窗口显示（如果 ready-to-show 事件没有触发）
    if (mainWindow) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
          console.log('强制显示主窗口')
          mainWindow.show()
          mainWindow.focus()
        }
      }, 500)
    }

    // D-013：托盘（darwin 常驻；win/linux 亦创建，供快速唤起）
    createTray()

    app.on('activate', function () {
      // macOS 关窗后点 Dock 图标重建窗口
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createAppWindow()
        mainWindow.on('closed', () => {
          mainWindow = null
        })
        if (mainWindow) {
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.show()
              mainWindow.focus()
            }
          }, 100)
        }
      }
    })

    // 应用退出前清理（代码审查 P1：补齐服务停止——旧实现只关 DB）
    app.on('will-quit', () => {
      if (backfillTimer) clearTimeout(backfillTimer)
      unregisterScreenshotShortcut()
      // 攒批中的错误日志落盘（正常退出路径；崩溃路径由 uncaughtException 兜底）
      log.flushPending()
      try {
        screenshotService.dispose()
      } catch (error) {
        console.error('[Main] 清理截图会话失败:', error)
      }
      try {
        watchedFoldersService.stop()
      } catch (error) {
        console.error('[Main] 停止文件夹监控失败:', error)
      }
      try {
        getClipServer().stop()
      } catch (error) {
        console.error('[Main] 停止剪藏服务失败:', error)
      }
      try {
        uninstallDatabase()
      } catch (error) {
        console.error('[Main] 关闭数据库失败:', error)
      }
    })
  })

  app.on('window-all-closed', () => {
    // D-013：darwin 关窗不退出（托盘/Dock 常驻，Eagle 行为）；win/linux 维持退出
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
