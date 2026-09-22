/**
 * Leaf · 壁纸 IPC
 *
 * 安全口径：只接受**已入库且 kind==='image'**的素材路径（与 image://rawfile:// 等协议同一口径），
 * 且渲染层传来的 mode 必须过白名单——它会拼进缓存文件名，带 `../` 就是目录逃逸。
 * 适配层：按目标屏物理像素出派生 JPEG 落 <库目录|userData>/wallpaper/<photoId>/，原素材文件不动；
 * 判定与渲染见 utils/wallpaperFit，契约类型见 @shared/wallpaper。
 * screen 参数 macOS 支持 all/main/屏幕序号；序号按 Electron 的 getAllDisplays 顺序解析，
 * 与 wallpaper 包传给系统二进制的序号是否同序未验证（渲染层目前只传 undefined）。
 */

import { ipcMain, screen } from 'electron'
import { existsSync, statSync } from 'node:fs'
import wallpaper from 'wallpaper'
import { photoRepository, type Photo } from '../db/repos/PhotoRepository'
import { activeSubdir } from '../modules/libraryRegistry'
import { getThumbnailService } from '../services/ThumbnailService'
import { log } from '../services/LogService'
import {
  clampTarget,
  evaluateFit,
  isCacheFresh,
  pruneWallpaperCache,
  probeSource,
  renderWallpaper,
  safeHexColor,
  sanitizeMode,
  wallpaperCachePath,
  EXACT_AR_DELTA,
  type SourceInfo
} from '../utils/wallpaperFit'
import type {
  FitAssessment,
  PixelSize,
  WallpaperAdapt,
  WallpaperAssessResult,
  WallpaperMode,
  WallpaperSetOptions,
  WallpaperSetResult,
  WallpaperStrategy
} from '@shared/wallpaper'

interface ScreenTarget extends PixelSize {
  label: string
}

/** 在飞渲染合并：同一目标可能被快速连点并发触发 */
const inflight = new Map<string, Promise<void>>()

/** 主屏排第一：assess 与「按主屏适配」都取 [0]，而 getAllDisplays 不保证顺序 */
function displayTargets(): ScreenTarget[] {
  const all = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  return [primary, ...all.filter((d) => d.id !== primary.id)].map((display, index) => ({
    // Electron 给的是逻辑像素，Retina 上壁纸要按物理像素出才不糊
    label: display.label || `显示器 ${index + 1}`,
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor)
  }))
}

/**
 * 本次设置的目标屏。
 * 'all'/'main' 且多屏比例不一致时仍只出一张（wallpaper 包不支持一次多张不同图），标签上说明清楚。
 */
function resolveTarget(screenArg: 'all' | 'main' | number | undefined): ScreenTarget {
  const targets = displayTargets()
  const primary = targets[0]
  const explicit = typeof screenArg === 'number'
  const picked = explicit ? (targets[screenArg] ?? primary) : primary
  const ar = picked.width / picked.height
  const mixed =
    targets.length > 1 &&
    targets.some((t) => Math.abs(t.width / t.height - ar) / ar > EXACT_AR_DELTA)
  const label =
    mixed && !explicit
      ? `${picked.label} +${targets.length - 1} 台（按主屏适配）`
      : picked.label
  return { label, ...clampTarget(picked) }
}

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

/**
 * sharp 解不动的格式（预编译不含 HEIC 解码，PDF/PSD 同理）现场让处理管线产出 1024 预览再试。
 * 只读已有缓存不行：刚导入、管线还没跑完的素材会直接设失败。
 */
async function probeAsset(asset: Photo): Promise<SourceInfo> {
  try {
    return await probeSource(asset.filePath)
  } catch {
    /* 回落 1024 预览 */
  }
  const preview = await getThumbnailService().generate(asset.id, asset.filePath, 1024)
  try {
    return await probeSource(preview)
  } catch {
    throw new Error('无法读取该图片，可能是不支持的格式')
  }
}

/** 解析出实际要设的路径：原图直设，或等缓存就绪的派生图 */
async function resolveSetPath(
  asset: Photo,
  mode: WallpaperMode,
  screenArg: 'all' | 'main' | number | undefined
): Promise<{ path: string; adapt: WallpaperAdapt }> {
  const target = resolveTarget(screenArg)
  const info = await probeAsset(asset)
  const fit = evaluateFit(
    {
      source: { width: info.width, height: info.height },
      hasAlpha: info.hasAlpha,
      alphaWide: info.alphaWide
    },
    target
  )
  const strategy: WallpaperStrategy = mode === 'auto' ? fit.strategy : mode
  const adapt: WallpaperAdapt = {
    strategy,
    screenLabel: target.label,
    source: fit.source,
    screen: fit.screen,
    cropPercent: fit.cropPercent,
    upscaleNeed: fit.upscaleNeed,
    reasons: fit.reasons,
    // 原图直设没用到预览图，别在 toast 里声称适配过
    fromPreview: strategy !== 'original' && info.path !== asset.filePath
  }
  if (strategy === 'original') return { path: asset.filePath, adapt }

  const rootDir = activeSubdir('wallpaper')
  const outPath = wallpaperCachePath(rootDir, asset.id, target, strategy)
  // 回落预览时预览的 mtime 永不前进，新鲜度必须同时看素材本体
  const sourceMtime = Math.max(mtimeOf(asset.filePath), mtimeOf(info.path))
  if (!isCacheFresh(outPath, sourceMtime)) {
    const pending = inflight.get(outPath)
    if (pending) await pending
    else {
      const task = renderWallpaper({
        inputPath: info.path,
        outPath,
        target,
        strategy,
        backdrop: safeHexColor(asset.colorDominant)
      }).then(() => undefined)
      inflight.set(outPath, task)
      try {
        await task
      } finally {
        inflight.delete(outPath)
      }
      pruneWallpaperCache(rootDir)
    }
  }
  return { path: outPath, adapt }
}

/** 素材归属校验：返回 Photo，或返回可直接回给渲染层的拒绝结果 */
function findAsset(filePath: string): Photo | { rejected: WallpaperSetResult } {
  if (!filePath || !existsSync(filePath)) {
    return { rejected: { ok: false, error: '文件不存在或已被移动' } }
  }
  const asset = photoRepository.getPhotoByPathIncludingDeleted(filePath)
  if (!asset) {
    // 路径来自渲染层，去掉换行避免伪造日志行
    log.warn('wallpaper', `rejected non-asset path: ${filePath.replace(/[\r\n]/g, '_')}`)
    return { rejected: { ok: false, error: '只能将素材库内的图片设为壁纸' } }
  }
  if (asset.kind !== 'image') {
    return { rejected: { ok: false, error: '只能将图片素材设为壁纸' } }
  }
  return asset
}

export function registerWallpaperIpcHandlers(): void {
  ipcMain.removeHandler('wallpaper:set')
  ipcMain.handle(
    'wallpaper:set',
    async (
      _e,
      filePath: string,
      screenArg?: 'all' | 'main' | number,
      options?: WallpaperSetOptions
    ): Promise<WallpaperSetResult> => {
      try {
        const found = findAsset(filePath)
        if ('rejected' in found) return found.rejected
        const { path, adapt } = await resolveSetPath(
          found,
          sanitizeMode(options?.mode),
          screenArg
        )
        await wallpaper.set(path, { screen: screenArg ?? 'all' })
        log.info('wallpaper', `set: ${path} (${adapt.strategy})`)
        return { ok: true, adapt }
      } catch (error) {
        log.warn('wallpaper', `set failed: ${String(error)}`)
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  // 渲染层展开「设为壁纸」菜单时的预检：不写缓存、不改桌面，只回判定结果
  ipcMain.removeHandler('wallpaper:assess')
  ipcMain.handle(
    'wallpaper:assess',
    async (_e, filePath: string): Promise<WallpaperAssessResult> => {
      try {
        const found = findAsset(filePath)
        if ('rejected' in found) return found.rejected
        const info = await probeAsset(found)
        const source = { width: info.width, height: info.height }
        const assessments: FitAssessment[] = displayTargets().map((display) => {
          const target = clampTarget(display)
          return evaluateFit(
            { source, hasAlpha: info.hasAlpha, alphaWide: info.alphaWide },
            { ...target, label: display.label }
          )
        })
        return { ok: true, assessments }
      } catch (error) {
        log.warn('wallpaper', `assess failed: ${String(error)}`)
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )
}
