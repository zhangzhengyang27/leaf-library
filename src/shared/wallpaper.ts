/**
 * Leaf · 壁纸适配契约类型
 *
 * 「设为壁纸」不再直设原文件：主进程按目标屏物理像素判定并出派生图。
 * 判定与渲染实现在 src/main/utils/wallpaperFit.ts，此处只放跨进程共享的形状，
 * 让 preload 声明、主进程 handler 与渲染层菜单共用一份口径。
 */

/** 用户可选口径：auto 交由判定决定，其余为强制策略 */
export type WallpaperMode = 'auto' | 'original' | 'cover' | 'blurred'
export type WallpaperStrategy = Exclude<WallpaperMode, 'auto'>

/** 不适配的原因（可同时多个） */
export type FitReason = 'ratio' | 'resolution' | 'transparency'

export interface PixelSize {
  width: number
  height: number
}

/** 一次「素材 × 某块屏」的匹配判定 */
export interface FitAssessment {
  /** 原图经 EXIF 方向校正后的像素尺寸 */
  source: PixelSize
  /** 目标屏幕物理像素（已按长边上限收敛） */
  screen: PixelSize
  screenLabel: string
  /** |原图宽高比 / 屏幕宽高比 − 1| */
  arDelta: number
  /** cover 居中裁切会丢弃的面积占比 0~1 */
  cropPercent: number
  /** 铺满屏幕所需的放大倍率；>1 表示原图分辨率不够 */
  upscaleNeed: number
  hasAlpha: boolean
  strategy: WallpaperStrategy
  reasons: FitReason[]
}

/** 实际写桌面的那张图是怎么来的 */
export interface WallpaperAdapt {
  strategy: WallpaperStrategy
  screenLabel: string
  source: PixelSize
  screen: PixelSize
  cropPercent: number
  upscaleNeed: number
  reasons: FitReason[]
  /** 源解码失败回落 1024 预览（HEIC/PDF/PSD 等 sharp 不认的格式） */
  fromPreview: boolean
}

export interface WallpaperSetOptions {
  mode?: WallpaperMode
}

export interface WallpaperSetResult {
  ok: boolean
  error?: string
  adapt?: WallpaperAdapt
}

export interface WallpaperAssessResult {
  ok: boolean
  error?: string
  assessments?: FitAssessment[]
}
