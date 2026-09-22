/**
 * 格式能力探测（防"假绿灯"）。
 *
 * 踩过的坑：`sharp.format[k].input` 是对象 `{file,buffer,stream}` 而不是布尔值，
 * 用 `!!f.input` 判断会恒为 true，于是 jxl/rad/dcraw/magick/pdf 全被读成"支持"，
 * 而真实构建是 `MagickCore:false / OpenEXR:false / OpenJPEG:false / RAD:false`。
 * 判定能力只能读 `.input.file`，或者直接真解码一次。
 *
 * 这里给出「白名单声称能处理，但没有任何解码通道」的差集，供启动日志与单测共用。
 */

import sharp from 'sharp'
import { IMAGE_EXTENSIONS, RASTER_EXTENSIONS } from '@shared/assetTypes'

/** sharp 能按文件路径直接解码的扩展名（不含点，小写） */
export function sharpReadableExtensions(): string[] {
  const out: string[] = []
  for (const [name, fmt] of Object.entries(sharp.format)) {
    const input = fmt.input as { file?: boolean; fileSuffix?: string[] } | undefined
    if (!input?.file) continue
    if (input.fileSuffix?.length) {
      // '.svg.gz' 这类复合后缀取首段；heif 只登记 .avif（HEIC 不在其中）
      for (const s of input.fileSuffix) {
        const bare = s.replace(/^\./, '').split('.')[0]
        if (bare) out.push(bare)
      }
    } else {
      out.push(name)
    }
  }
  return [...new Set(out)]
}

/**
 * 不经 sharp 的既有通道：系统 sips（HEIC 三兄弟）、pdfjs（PDF/AI）、
 * PSD 内嵌预览资源、自带 ffmpeg 兜底光栅化（RASTER 组）。
 *
 * RASTER 在这里被"算作有通道"不是自我声明：它的有效性由
 * `__tests__/ffmpegRaster.test.ts` 逐个扩展名真跑 ffmpeg 往返来担保——
 * 往 RASTER_EXTENSIONS 里加一个 ffmpeg 解不了的格式，那条用例会红。
 */
const DEDICATED_CHANNELS = new Set([
  'heic',
  'heif',
  'hif', // 三者同走 sips / heic-decode（isHeicPath）
  'psd',
  'pdf',
  'ai',
  ...RASTER_EXTENSIONS
])

/** 白名单里声称是图片、但四条通道一条都覆盖不到的扩展名 */
export function imageWhitelistGaps(): string[] {
  const sharpReadable = new Set(sharpReadableExtensions())
  return [...IMAGE_EXTENSIONS, ...RASTER_EXTENSIONS].filter(
    (e) => !sharpReadable.has(e) && !DEDICATED_CHANNELS.has(e)
  )
}

/** 启动时调用一次：把真实解码面打到日志，白名单漂移时立刻显形 */
export function logFormatCapability(): void {
  console.log(`[format] sharp 可按路径解码: ${sharpReadableExtensions().join(' ')}`)
  const gaps = imageWhitelistGaps()
  if (gaps.length > 0) {
    console.warn(
      `[format] 白名单声称是图片但无解码通道（会落字母卡）: ${gaps.join(' ')} —— 需补解码档或从白名单移除`
    )
  }
}
