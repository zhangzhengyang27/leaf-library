/**
 * Leaf · ThumbnailService
 *
 * 缩略图管线（借鉴 Immich 的分级缩略图思路）：
 *   thumb   256px  —— 网格用
 *   preview 1024px —— 预览/phash/主色用（对预览做感知哈希可保证跨格式确定性）
 *
 * 落盘 <userData>/thumbs/<photoId>/{256,1024}.jpg，由 thumb:// 协议按需读取，
 * 未命中缓存时现场生成。sharp 解不了的格式先经一次预转换（见 toReadable）：
 * HEIC 走系统 sips，exr/tga/dpx/sgi/jp2 走自带 ffmpeg。
 */

import { existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import { convertHeicToPng, isHeicPath } from '../utils/imageConvert'
import { isFfmpegRasterizable, toSharpReadableViaFfmpeg } from '../utils/ffmpegRaster'
import { activeSubdir } from '../modules/libraryRegistry'

export const THUMB_SIZES = [256, 1024] as const
export type ThumbSize = (typeof THUMB_SIZES)[number]

const JPEG_QUALITY: Record<ThumbSize, number> = { 256: 72, 1024: 80 }

/** 在飞请求合并：thumb:// 协议与后台管线可能并发生成同一缩略图（审查 P2-24） */
const inflight = new Map<string, Promise<string>>()

export class ThumbnailService {
  constructor(private readonly rootDir: string) {
    mkdirSync(this.rootDir, { recursive: true })
  }

  private dirFor(photoId: string): string {
    const dir = join(this.rootDir, photoId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  pathFor(photoId: string, size: ThumbSize): string {
    return join(this.rootDir, photoId, `${size}.jpg`)
  }

  has(photoId: string, size: ThumbSize): boolean {
    return existsSync(this.pathFor(photoId, size))
  }

  getCachedPath(photoId: string, size: ThumbSize): string | null {
    const p = this.pathFor(photoId, size)
    return existsSync(p) ? p : null
  }

  /** 生成指定尺寸缩略图（HEIC 自动转 PNG 后处理，临时文件即用即删）。返回生成文件路径。 */
  async generate(photoId: string, filePath: string, size: ThumbSize): Promise<string> {
    const outPath = this.pathFor(photoId, size)
    if (existsSync(outPath)) return outPath
    // 并发去重：两个管线同时为同一 photoId+size 生成时复用同一 Promise，
    // 避免两个 toFile 交叉写同一目标
    const pending = inflight.get(outPath)
    if (pending) return pending
    const task = this.generateInner(photoId, filePath, size, outPath).finally(() =>
      inflight.delete(outPath)
    )
    inflight.set(outPath, task)
    return task
  }

  private async generateInner(
    photoId: string,
    filePath: string,
    size: ThumbSize,
    outPath: string
  ): Promise<string> {
    this.dirFor(photoId)
    const { path: readable, cleanup } = await this.toReadable(filePath)
    try {
      await this.rasterize(readable, outPath, size)
    } finally {
      cleanup() // 临时 PNG 即用即删，不留在系统 tmpdir
    }
    return outPath
  }

  /**
   * 把 sharp 解不了的源格式转成 sharp 可读的临时文件。
   * - HEIC：预编译 libvips 的 heif 只登记了 .avif，缺 libde265 → 走系统 sips
   * - exr/tga/dpx/sgi/jp2：libvips 无 MagickCore/OpenEXR/OpenJPEG → 走自带 ffmpeg
   * - 其余：原样返回，cleanup 为空操作
   */
  private async toReadable(filePath: string): Promise<{ path: string; cleanup: () => void }> {
    if (isHeicPath(filePath)) {
      const tmp = await convertHeicToPng(filePath)
      return { path: tmp, cleanup: () => rmSync(tmp, { force: true }) }
    }
    if (isFfmpegRasterizable(filePath)) {
      return toSharpReadableViaFfmpeg(filePath)
    }
    return { path: filePath, cleanup: () => {} }
  }

  /**
   * 确保两级缩略图都存在（处理管线调用）。
   * 需要预转换的格式只做一次转换，两级共用（审查修复：避免重复转换 + 临时文件泄漏）。
   */
  async ensure(photoId: string, filePath: string): Promise<{ thumb: string; preview: string }> {
    if (!isHeicPath(filePath) && !isFfmpegRasterizable(filePath)) {
      const thumb = await this.generate(photoId, filePath, 256)
      const preview = await this.generate(photoId, filePath, 1024)
      return { thumb, preview }
    }

    const thumbPath = this.pathFor(photoId, 256)
    const previewPath = this.pathFor(photoId, 1024)
    const needThumb = !existsSync(thumbPath)
    const needPreview = !existsSync(previewPath)
    if (needThumb || needPreview) {
      this.dirFor(photoId)
      const { path: readable, cleanup } = await this.toReadable(filePath)
      try {
        if (needThumb) await this.rasterize(readable, thumbPath, 256)
        if (needPreview) await this.rasterize(readable, previewPath, 1024)
      } finally {
        cleanup()
      }
    }
    return { thumb: thumbPath, preview: previewPath }
  }

  /** 供外部（视频抽帧等）复用的栅格化入口 */
  async rasterize(source: string, outPath: string, size: ThumbSize): Promise<void> {
    const outDir = join(outPath, '..')
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
    // 原子替换（审查 P2-24）：直写目标时 thumb:// 并发读/并发写会留下永久损坏的缓存
    const tmpPath = `${outPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
    try {
      await sharp(source)
        .rotate() // 按 EXIF 方向摆正
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY[size], mozjpeg: true })
        .toFile(tmpPath)
      renameSync(tmpPath, outPath)
    } catch (err) {
      rmSync(tmpPath, { force: true })
      console.error(`[ThumbnailService] rasterize failed: ${source} @${size}`, err)
      throw err
    }
  }

  /** 清理某张图的缩略图目录（硬删除时调用） */
  remove(photoId: string): void {
    rmSync(join(this.rootDir, photoId), { recursive: true, force: true })
  }
}

let singleton: ThumbnailService | null = null

export function getThumbnailService(): ThumbnailService {
  if (!singleton) {
    singleton = new ThumbnailService(activeSubdir('thumbs'))
  }
  return singleton
}
