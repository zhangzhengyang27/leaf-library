/**
 * ffmpeg 兜底光栅化（贴图/工业位图档）。
 *
 * 随包 libvips 8.18.6 的真实构建是 `MagickCore: false / OpenEXR: false /
 * OpenJPEG: false / RAD: false`（从 dylib 里 strings 出来的原话），所以
 * exr/tga/dpx/sgi/jp2 交给 sharp 一律是 "Input file contains unsupported
 * image format"。@ffmpeg-installer 里那个 ffmpeg 4.4 反而带齐了这些静态图像
 * 解码器，且已在依赖中——因此这一档不引入任何新依赖。
 *
 * 实测（docs/格式扩展调研-2026-09.md）：exr/tga/dpx/sgi/jp2 → PNG 全部成功；
 * .hdr(Radiance) 4.4 无解码器，不在本档覆盖面内。
 */

import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getFfmpegPath } from './ffmpeg'
import { isRasterFile } from '@shared/assetTypes'

const execFileAsync = promisify(execFile)

/** 上限 2048：4K EXR 全尺寸解码后再 resize 会白吃上百 MB 内存（实测 4096×3000 → 2048×1500 / 272ms） */
const DEFAULT_MAX_EDGE = 2048

/** 本档能否处理该文件（扩展名单一真源在 @shared/assetTypes 的 RASTER_EXTENSIONS） */
export const isFfmpegRasterizable = isRasterFile

/**
 * 用 ffmpeg 把源文件光栅化为 PNG（长边不超过 maxEdge，小图不放大）。
 * 失败抛错，由调用方决定兜底（管线侧会落 thumbStatus=2 → 字母卡）。
 */
export async function rasterizeWithFfmpeg(
  srcPath: string,
  outPngPath: string,
  maxEdge = DEFAULT_MAX_EDGE
): Promise<void> {
  // 必须 execFile（数组参数）：源路径可能含 $(...) / 反引号，字符串拼接过 shell 会被执行
  const vf = `scale='if(gt(iw,${maxEdge}),${maxEdge},iw)':-2`
  await execFileAsync(
    getFfmpegPath(),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      srcPath,
      '-vf',
      vf,
      '-frames:v',
      '1',
      outPngPath
    ],
    { timeout: 30000 }
  )
  if (!existsSync(outPngPath)) throw new Error(`ffmpeg 光栅化无产出: ${srcPath}`)
}

/**
 * 转成 sharp 可读的临时 PNG，返回路径与清理函数（临时文件即用即删，不落 tmpdir 垃圾）。
 * 调用方负责在 finally 里 cleanup()。
 */
export async function toSharpReadableViaFfmpeg(
  srcPath: string
): Promise<{ path: string; cleanup: () => void }> {
  const tmp = join(
    tmpdir(),
    `leaf-raster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
  )
  try {
    await rasterizeWithFfmpeg(srcPath, tmp)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  return {
    path: tmp,
    cleanup: () => rmSync(tmp, { force: true })
  }
}
