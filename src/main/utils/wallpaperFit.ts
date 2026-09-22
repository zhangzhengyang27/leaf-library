/**
 * Leaf · 壁纸适配核心
 *
 * 「设为壁纸」原先把素材原文件直设桌面，两种常见素材会翻车：
 *   - 比例与屏幕差得远（手机竖图放 16:9，系统居中裁切丢掉 ~65% 画面）；
 *   - 带透明的 PNG（logo/抠图），系统给一块死黑底。
 * 这里按目标屏幕物理像素出派生图：小偏差居中裁切（cover），
 * 大偏差与透明图走「自身放大模糊作底 + 主体留白居中」（blurred）。
 *
 * 刻意不 import electron：显示器枚举、缓存目录、主色都由 ipc 层传入，纯函数便于单测。
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'fs'
import { dirname, isAbsolute, join, relative } from 'path'
import sharp, { type Sharp } from 'sharp'
import type {
  FitAssessment,
  FitReason,
  PixelSize,
  WallpaperMode,
  WallpaperStrategy
} from '@shared/wallpaper'

/** 比例偏差在此内视为与屏幕同步（直接设原图不重编码）；ipc 层判「多屏比例是否混用」同口径 */
export const EXACT_AR_DELTA = 0.02
/** cover 丢弃面积不超过此值时优先裁切，再多就换成模糊留白 */
const COVER_MAX_CROP = 0.15
/** 比值边界的浮点松弛：2000×1000 → 1700×1000 数学上正好 15%，二进制下是 0.15000000000000002 */
const BOUNDARY_EPS = 1e-9
/** 放大倍率超过此值才判定「分辨率不足」（舍入误差不算） */
const UPSCALE_EPS = 1.02
/** 长边封顶：6K 屏按物理像素出图到 6144 只是内存和耗时翻倍，肉眼无收益 */
const MAX_EDGE = 4096
/** 模糊底派生图的输出质量 */
const JPEG_QUALITY = 88
/** 主体四周留白占短边比例（避免贴边显得没设计） */
const PAD_RATIO = 0.04
/**
 * 模糊底在 1/4 尺度上算，但 blur 之后必须先落 buffer 再单独放大。
 * libvips 会把 conv 融进同一条 resize 链，不切开的话 sigma 落在最终网格上：
 * 实测硬边过渡宽度 14px（等于全尺度 blur(6)）而非预期的 ~76px，且比切开更慢（343ms vs 284ms）。
 */
const BACKDROP_DOWNSCALE = 4
const BACKDROP_BLUR = 6
/** 压暗系数作用在 gamma 编码值上（0.72 ≈ 线性光下一整档），让居中的主体从背景里浮出来 */
const BACKDROP_DIM = 0.72
/**
 * 透明判定分两问，一个口径同时造成漏检和误报：
 *  - any：alpha<250 的采样点够多 → 容器真有洞，不许直设原图（系统会给一块黑底）；
 *  - wide：alpha<=128 的占比过阈 → 洞大到该用模糊底兜，而不是靠 flatten 补主色。
 * 用 <250 计 wide 会被 Lanczos 振铃放大：4000×3000 上仅一行为透明（真面积 0.033%）
 * 在 128×96 采样格里占 1.04%，而按 <=128 数是 0.00%。
 */
const ALPHA_ANY_SAMPLES = 2
const ALPHA_WIDE_RATIO = 0.005
/** 缓存保留张数，超出按 mtime 淘汰最旧 */
const CACHE_KEEP = 24
/** 崩溃残留的 .jpg.tmp 清扫时限（小于此值可能正被并发渲染使用，不能碰） */
const TMP_ORPHAN_MS = 60 * 60 * 1000

const FALLBACK_BACKDROP = '#1b1b1f'

/** 缓存文件名里的目标标签，如 3024x1964 */
export function targetTag(target: PixelSize): string {
  return `${target.width}x${target.height}`
}

/**
 * 渲染层传来的 mode 会参与拼缓存文件名，TS 联合类型在 IPC 边界不存在，必须运行时收敛。
 * 非法值静默降级为 auto（不报错：它只表示"没给对策略"，不是攻击载荷）。
 */
export function sanitizeMode(raw: unknown): WallpaperMode {
  return raw === 'auto' || raw === 'original' || raw === 'cover' || raw === 'blurred'
    ? raw
    : 'auto'
}

/** 长边封顶后的目标尺寸（保持比例） */
export function clampTarget(size: PixelSize, maxEdge = MAX_EDGE): PixelSize {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height))
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale))
  }
}

/** '#rrggbb' 白名单校验，其余（NULL/异常值）落回中性深色 */
export function safeHexColor(value?: string | null): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : FALLBACK_BACKDROP
}

export function evaluateFit(
  input: { source: PixelSize; hasAlpha: boolean; alphaWide?: boolean },
  screen: PixelSize & { label?: string }
): FitAssessment {
  const { source, hasAlpha, alphaWide = false } = input
  const srcAr = source.width / source.height
  const screenAr = screen.width / screen.height
  const r = srcAr / screenAr
  const arDelta = Math.abs(r - 1)
  // cover 后保留面积 = min(r, 1/r)：源更宽时高边撑满、宽被裁，反之同理
  const cropPercent = 1 - Math.min(r, 1 / r)
  const upscaleNeed = Math.max(screen.width / source.width, screen.height / source.height)

  const reasons: FitReason[] = []
  if (hasAlpha) reasons.push('transparency')
  if (arDelta > EXACT_AR_DELTA) reasons.push('ratio')
  if (upscaleNeed > UPSCALE_EPS) reasons.push('resolution')

  // 选档只看内容代价：丢弃面积过大、或透明范围大到裁切补不回来，就留白
  let strategy: WallpaperStrategy
  if (cropPercent > COVER_MAX_CROP + BOUNDARY_EPS || alphaWide) strategy = 'blurred'
  // 比例吻合也不许直设有洞的容器（系统给黑底）；此时 cover 的丢弃面积为 0，等于只 flatten
  else if (arDelta <= EXACT_AR_DELTA + BOUNDARY_EPS && !hasAlpha) strategy = 'original'
  else strategy = 'cover'

  return {
    source,
    screen: { width: screen.width, height: screen.height },
    screenLabel: screen.label ?? '',
    arDelta,
    cropPercent,
    upscaleNeed,
    hasAlpha,
    strategy,
    reasons
  }
}

export interface SourceInfo extends PixelSize {
  /** 实际可解码的路径（HEIC/PDF 等 sharp 解不动时落回 1024 预览） */
  path: string
  /** 容器带 alpha 且实测真有透明像素 → 否决「原图直设」 */
  hasAlpha: boolean
  /** 透明面积占比过阈 → 选模糊底而非裁切 */
  alphaWide: boolean
}

/** EXIF orientation 5~8 为 90° 旋转/镜像，编码尺寸与呈现尺寸互换 */
function orientedSize(meta: { width?: number; height?: number; orientation?: number }): PixelSize {
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  const rotated = (meta.orientation ?? 1) >= 5
  return rotated ? { width: height, height: width } : { width, height }
}

/**
 * 读取用于适配的源尺寸与真实透明度。
 * meta.hasAlpha 只说明「容器带 alpha」，全不透明的 PNG 也为 true，要数实际透明像素。
 */
export async function probeSource(filePath: string, fallbackPath?: string): Promise<SourceInfo> {
  const candidates = fallbackPath ? [filePath, fallbackPath] : [filePath]
  let lastError: unknown
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      const meta = await sharp(path).metadata()
      const size = orientedSize(meta)
      if (!size.width || !size.height) continue
      const alpha = meta.hasAlpha === true ? await measureTransparency(path) : null
      return {
        ...size,
        path,
        hasAlpha: alpha?.any === true,
        alphaWide: alpha?.wide === true
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error(`无法读取图片尺寸: ${filePath}`)
}

/**
 * 缩到 128px 数 alpha 通道，分两问回答（见 ALPHA_* 注释）。
 * 代价不是常数：JPEG 源靠 shrink-on-load 约 1ms，50MP RGBA PNG 实测 ~115ms。
 */
async function measureTransparency(path: string): Promise<{ any: boolean; wide: boolean }> {
  const { data, info } = await sharp(path)
    .rotate()
    .resize(128, 128, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const last = ch - 1
  let some = 0
  let clear = 0
  let total = 0
  for (let i = last; i < data.length; i += ch) {
    total++
    if (data[i] < 250) some++
    if (data[i] <= 128) clear++
  }
  if (!total) return { any: false, wide: false }
  return { any: some >= ALPHA_ANY_SAMPLES, wide: clear / total > ALPHA_WIDE_RATIO }
}

/**
 * 派生图落盘路径。strategy 来自渲染层可控的 mode 参数，必须钉死在枚举内：
 * 拼进 join 的字符串带 `../` 就是目录逃逸（本模块第三次栽在同一类信任边界上）。
 */
export function wallpaperCachePath(
  rootDir: string,
  photoId: string,
  target: PixelSize,
  strategy: WallpaperStrategy
): string {
  if (strategy !== 'cover' && strategy !== 'blurred') {
    throw new Error(`非法壁纸策略: ${String(strategy)}`)
  }
  const out = join(rootDir, photoId, `${targetTag(target)}-${strategy}.jpg`)
  const rel = relative(rootDir, out)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('壁纸缓存路径越出缓存目录')
  }
  return out
}

/** 缓存命中要求源文件未变动过（素材被覆盖时旧派生图就是错的） */
export function isCacheFresh(outPath: string, sourceMtimeMs: number): boolean {
  if (!existsSync(outPath)) return false
  try {
    const stat = statSync(outPath)
    return stat.size > 0 && stat.mtimeMs >= sourceMtimeMs
  } catch {
    return false
  }
}

/** 淘汰最旧的壁纸派生图（并回收崩溃残留的 .tmp），返回删除数 */
export function pruneWallpaperCache(rootDir: string, keep = CACHE_KEEP): number {
  if (!existsSync(rootDir)) return 0
  const files: Array<{ path: string; mtime: number; orphan: boolean }> = []
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(rootDir, entry.name)
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const tmp = name.endsWith('.jpg.tmp')
      if (!tmp && !name.endsWith('.jpg')) continue
      try {
        const mtime = statSync(path).mtimeMs
        // 刚写下的 .tmp 可能正被并发渲染使用，只回收超时残留
        if (tmp && Date.now() - mtime < TMP_ORPHAN_MS) continue
        files.push({ path, mtime, orphan: tmp })
      } catch {
        /* 并发淘汰：刚被别的调用删掉 */
      }
    }
  }
  const keepable = files.filter((f) => !f.orphan).sort((a, b) => b.mtime - a.mtime)
  const stale = [...keepable.slice(keep), ...files.filter((f) => f.orphan)]
  for (const f of stale) rmSync(f.path, { force: true })
  return stale.length
}

export interface RenderOptions {
  inputPath: string
  outPath: string
  target: PixelSize
  strategy: Exclude<WallpaperStrategy, 'original'>
  /** 透明像素与边缘的落底色（素材主色） */
  backdrop: string
}

/**
 * 按目标尺寸出 JPEG（JPEG 无 alpha，顺带解决透明图直设变黑底）。
 * 先写 .tmp 再 rename，避免半途文件被当成有效缓存或被 wallpaper.set 读走。
 */
export async function renderWallpaper(options: RenderOptions): Promise<PixelSize> {
  const { inputPath, outPath, strategy } = options
  const target = clampTarget(options.target)
  const base = (): Sharp => sharp(inputPath).rotate()

  let pipeline: Sharp
  if (strategy === 'cover') {
    pipeline = base().resize(target.width, target.height, { fit: 'cover', position: 'centre' })
  } else {
    // 模糊底先在 1/4 尺度上算（高斯开销降到 ~1/16），再单独放大回目标尺寸
    const small = {
      width: Math.max(2, Math.round(target.width / BACKDROP_DOWNSCALE)),
      height: Math.max(2, Math.round(target.height / BACKDROP_DOWNSCALE))
    }
    // blur 后必须先落 buffer：同链放大时 libvips 会把 conv 融进 resize，sigma 会落在最终网格上
    const blurredSmall = await base()
      .resize(small.width, small.height, { fit: 'cover' })
      .blur(BACKDROP_BLUR)
      .linear(BACKDROP_DIM, 0)
      .flatten({ background: options.backdrop })
      // 中间图显式 PNG：不写格式会沿用源容器，JPEG 源于是多付一次 q80 有损代
      .png()
      .toBuffer()

    const pad = Math.round(Math.min(target.width, target.height) * PAD_RATIO)
    const foreground = await base()
      .resize(Math.max(1, target.width - pad * 2), Math.max(1, target.height - pad * 2), {
        fit: 'contain',
        // alpha:0 是关键：写成 1（或不写）会让留白区整体变黑，实测 64% 画布近黑
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer()

    pipeline = sharp(blurredSmall)
      .resize(target.width, target.height, { fit: 'cover' })
      .composite([{ input: foreground, gravity: 'centre' }])
  }

  mkdirSync(dirname(outPath), { recursive: true })
  const tmpPath = `${outPath}.tmp`
  try {
    await pipeline
      .flatten({ background: options.backdrop })
      .jpeg({ quality: JPEG_QUALITY })
      .toFile(tmpPath)
    renameSync(tmpPath, outPath)
  } catch (error) {
    rmSync(tmpPath, { force: true })
    throw error
  }
  return target
}
