/**
 * Leaf · AssetProcessingService
 *
 * 图片入库后的后台处理管线（p-queue 串行度 2）：
 *   1. 缩略图（256/1024，HEIC 先走系统转换）—— ThumbnailService
 *   2. EXIF 解析（exifr，支持 HEIC）—— 回填 taken_at/相机/参数/GPS 等既有列
 *   3. 文件 md5（js-md5）—— 精确去重（hash 列）
 *   4. pHash（sharp-phash，对 1024 预览计算保证跨格式确定性）—— 二期以图搜图/查重
 *   5. 主色（sharp stats.dominant，对预览计算）
 *
 * thumb_status 状态机：0 待处理 → 1 完成 / 2 失败；启动时 recoverPending() 扫描补漏。
 * 进度通过 notify 回调推给渲染层（photos:processing）。
 */

import { existsSync, createReadStream, rmSync } from 'fs'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { tmpdir } from 'os'
import exifr from 'exifr'
import PQueue from 'p-queue'
import pHash from 'sharp-phash'
import sharp from 'sharp'
import type { PhotoRepository } from '../db/repos/PhotoRepository'
import type { ThumbnailService } from './ThumbnailService'
import { ocrService } from './OcrService'
import { docTextService } from './DocTextService'
import {
  isDocTextFile,
  isFontFile,
  isSystemPreviewFile,
  kindOfExt,
  type AssetKind
} from '@shared/assetTypes'
import { renderSystemPreview } from '../utils/systemPreview'
import { clipEmbeddings } from './ClipEmbeddingService'
import { getFfmpegPath } from '../utils/ffmpeg'
import { probeMedia } from '../utils/ffmpegProbe'
import { isPdfLikeFile, renderPdfFirstPage } from './PdfRasterizer'
import { extractPsdThumbnail, isPsdFile } from './PsdThumbnail'

const execFileAsync = promisify(execFile)

export interface ProcessingProgress {
  photoId: string
  status: 'done' | 'failed'
  done: number
  total: number
}

interface ExifLike {
  Make?: string
  Model?: string
  LensModel?: string
  ISO?: number
  FNumber?: number
  ExposureTime?: number
  FocalLength?: number
  ExifImageWidth?: number
  ExifImageHeight?: number
  latitude?: number
  longitude?: number
  DateTimeOriginal?: Date
  CreateDate?: Date
  ModifyDate?: Date
}

function toHexColor(c: { r: number; g: number; b: number }): string {
  const hex = (v: number): string => v.toString(16).padStart(2, '0')
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
}

/**
 * 十五轮 B4：主色板提取（Eagle 检查器预览图下方多色点行）。
 * 缩到 48px raw RGB → 4bit/通道分桶计数 → 按占比取前 5 个互异色
 * （欧氏距离阈值逐级放宽 96→48→0，保证小图也能凑满）。
 */
export async function extractPalette(preview: string, max = 5): Promise<string[]> {
  const { data } = await sharp(preview)
    .resize(48, 48, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 2 < data.length; i += 3) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const acc = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    acc.n += 1
    acc.r += r
    acc.g += g
    acc.b += b
    counts.set(key, acc)
  }
  const sorted = [...counts.values()].sort((a, b) => b.n - a.n)
  const picked: Array<{ r: number; g: number; b: number }> = []
  for (const minDist of [96, 48, 0]) {
    for (const c of sorted) {
      const avg = {
        r: Math.round(c.r / c.n),
        g: Math.round(c.g / c.n),
        b: Math.round(c.b / c.n)
      }
      if (
        picked.every(
          (p) => (p.r - avg.r) ** 2 + (p.g - avg.g) ** 2 + (p.b - avg.b) ** 2 >= minDist * minDist
        )
      ) {
        picked.push(avg)
      }
      if (picked.length >= max) return picked.map(toHexColor)
    }
  }
  return picked.map(toHexColor)
}

/** 快门速度格式化：0.008s → 「1/125」，2s → 「2s」 */
function formatShutter(seconds: number | undefined): string | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return undefined
  if (seconds >= 1) return `${Math.round(seconds * 10) / 10}s`
  return `1/${Math.round(1 / seconds)}`
}

function dateToMs(d: Date | undefined): number | undefined {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : undefined
}

/** ffmpeg 抽帧（1s 处取一帧；过短视频回退 0s），输出 PNG 供缩略图管线复用 */
export async function extractVideoFrame(videoPath: string, outPath: string): Promise<void> {
  const ffmpeg = getFfmpegPath()
  const args = (seek: string): string[] => [
    '-ss',
    seek,
    '-i',
    videoPath,
    '-y',
    '-vframes',
    '1',
    outPath
  ]
  try {
    await execFileAsync(ffmpeg, args('00:00:01'), { timeout: 30000 })
  } catch {
    await execFileAsync(ffmpeg, args('00:00:00'), { timeout: 30000 })
  }
  if (!existsSync(outPath)) throw new Error('ffmpeg frame extraction failed')
}

/** 流式计算文件 md5（仅用于去重，非安全用途），内存占用常数级 */
async function hashFileStreaming(filePath: string): Promise<string> {
  const hasher = createHash('md5')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hasher.update(chunk))
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
  return hasher.digest('hex')
}

export class AssetProcessingService {
  private queue = new PQueue({ concurrency: 2 })
  private queued = new Set<string>()
  private doneCount = 0
  private totalCount = 0

  constructor(
    private readonly deps: {
      photos: PhotoRepository
      thumbs: ThumbnailService
      notify?: (progress: ProcessingProgress) => void
    }
  ) {
    // 队列清空时归零计数（审查 P3-12）：旧实现只增不减，多次「重新处理」后
    // 渲染层进度条长期显示旧累计值，批次语义失真
    this.queue.on('idle', () => {
      this.doneCount = 0
      this.totalCount = 0
    })
  }

  /** 十五轮 A2：宽高补齐失败的素材 id（进程内跳过集，防止启动回填循环空转） */
  private readonly dimBackfillSkipped = new Set<string>()

  /** 十五轮批6：主色板补齐完成/失败的素材 id（含缩略图缺失行，同防空转） */
  private readonly paletteBackfillDone = new Set<string>()

  /** 022：帧率探测失败/文件不可达的视频 id（同上，防回填空转） */
  private readonly fpsBackfillSkipped = new Set<string>()

  /** 入队一张图（幂等） */
  enqueue(photoId: string): void {
    if (this.queued.has(photoId)) return
    this.queued.add(photoId)
    this.totalCount += 1
    void this.queue
      .add(() => this.processOne(photoId))
      .finally(() => {
        this.queued.delete(photoId)
      })
  }

  /**
   * 启动恢复：把所有「未处理」的图重新入队。
   * 只扫 status=0——永久失败(2)的图（文件丢失/损坏）不在启动时反复重试，
   * 需要手动重跑时用 retryFailed()。
   */
  async recoverPending(): Promise<number> {
    const pending = this.deps.photos.getProcessingPending()
    for (const p of pending) this.enqueue(p.id)
    return pending.length
  }

  /** 手动重跑：把失败的图重新入队（渲染层「重新处理」入口） */
  async retryFailed(): Promise<number> {
    const failed = this.deps.photos
      .getProcessingPending(undefined, true)
      .filter((p) => p.thumbStatus === 2)
    for (const p of failed) {
      this.deps.photos.setThumbStatus(p.id, 0)
      this.enqueue(p.id)
    }
    return failed.length
  }

  /**
   * 十五轮 A2：补齐「处理已完成但宽高缺失」的存量图片（EXIF 无记录的旧数据）。
   * sharp 读原图 metadata 兜底；单张失败记入本进程内跳过集，避免回填循环空转。
   * 十五轮批6：同循环为「无主色板」的存量行从 1024 缩略图补提 5 色板。
   * 返回本批实际补齐的行数（0 = 没有可补的行，调用方可停止轮询）。
   */
  async backfillMissingDimensions(batch = 100): Promise<number> {
    const rows = this.deps.photos.getDimensionBackfillPending(batch)
    let filled = 0
    for (const row of rows) {
      if (this.dimBackfillSkipped.has(row.id)) continue
      try {
        const meta = await sharp(row.file_path).metadata()
        if (meta.width && meta.height) {
          this.deps.photos.updateBackfilledDimensions(row.id, meta.width, meta.height)
          filled += 1
        } else {
          this.dimBackfillSkipped.add(row.id)
        }
      } catch {
        // 原文件不可达/不可解：跳过；行内宽高仍为空会再次被查出来，靠跳过集终止循环
        this.dimBackfillSkipped.add(row.id)
      }
    }

    // 批6：存量行主色板补齐（优先读 1024 缩略图，避免重解原图）
    const paletteRows = this.deps.photos.getPaletteBackfillPending(batch)
    for (const row of paletteRows) {
      if (this.paletteBackfillDone.has(row.id)) continue
      const thumbPath = this.deps.thumbs.pathFor(row.id, 1024)
      if (!existsSync(thumbPath)) {
        this.paletteBackfillDone.add(row.id)
        continue
      }
      try {
        const palette = await extractPalette(thumbPath)
        this.deps.photos.updateBackfilledPalette(row.id, palette)
        this.paletteBackfillDone.add(row.id)
        filled += 1
      } catch {
        this.paletteBackfillDone.add(row.id)
      }
    }
    return filled
  }

  /**
   * 022：补齐「处理已完成但没有实测帧率」的存量视频（fps 列之前的旧数据）。
   * 每张一次 `ffmpeg -i`（不起解码，几十毫秒级），探不到的记入跳过集，
   * 否则回填循环会一直把这批行重挑出来空转。
   */
  async backfillMissingFps(batch = 50): Promise<number> {
    const rows = this.deps.photos.getFpsBackfillPending(batch)
    let filled = 0
    for (const row of rows) {
      if (this.fpsBackfillSkipped.has(row.id)) continue
      const { fps } = await probeMedia(row.file_path)
      if (fps !== null) {
        this.deps.photos.updateBackfilledFps(row.id, fps)
        filled += 1
      } else {
        this.fpsBackfillSkipped.add(row.id)
      }
    }
    return filled
  }

  get pendingCount(): number {
    return this.queue.size + this.queue.pending
  }

  /** 等待队列清空（测试/关机前同步用） */
  onIdle(): Promise<void> {
    return this.queue.onIdle()
  }

  private notify(photoId: string, status: 'done' | 'failed'): void {
    this.doneCount += 1
    this.deps.notify?.({
      photoId,
      status,
      done: this.doneCount,
      total: Math.max(this.totalCount, this.doneCount)
    })
  }

  private async processOne(photoId: string): Promise<void> {
    const { photos, thumbs } = this.deps
    try {
      const photo = photos.getPhotoById(photoId)
      if (!photo) {
        this.notify(photoId, 'failed')
        return
      }
      if (!existsSync(photo.filePath)) {
        console.warn(`[AssetProcessing] file missing, skip: ${photo.filePath}`)
        photos.setThumbStatus(photoId, 2)
        this.notify(photoId, 'failed')
        return
      }

      // 字体等非位图素材：跳过 sharp/EXIF/pHash 管线，直接视为就绪（三期 P3，
      // 由渲染层 FontFace 实时预览，不生成位图缩略图）
      if (isFontFile(photo.filePath)) {
        photos.setThumbStatus(photoId, 1)
        this.notify(photoId, 'done')
        return
      }

      const kind: AssetKind = photo.kind ?? kindOfExt(photo.fileName)

      // 文档正文抽取（D 轴「可检索」）：不依赖缩略图，且 kind 在这条链路上无意义
      // （pdf 归 image、docx 归 file），所以要放在各 kind 分支之前。
      // 钩子自兜底——单测/无全局库环境下读 pref 会抛错，不能影响管线成败。
      try {
        // docText 非 null 说明已经抽过：retryFailed/重新入队不该再跑一遍解析器
        // （officeparser 解一个大 PDF 是秒级，且会重写 20k 字符 + FTS 删插）
        if (isDocTextFile(photo.fileName) && photo.docText === undefined) {
          docTextService.enqueue(photoId)
        }
      } catch {
        /* 正文抽取不可用：静默跳过 */
      }

      // 音频：探测时长即可，无缩略图（网格用音频卡片）
      if (kind === 'audio') {
        const { durationMs } = await probeMedia(photo.filePath)
        photos.updateProcessingResult(photoId, { durationMs })
        photos.setThumbStatus(photoId, 1)
        this.notify(photoId, 'done')
        return
      }

      // 兜底文件/文本（F4）：无缩略图可生成，直接就绪。
      // G4 例外：RAW/Office/设计那批交给系统试一次代表图，成功就走下面的正常管线
      // （EXIF/主色/pHash/色板一并有了），失败仍回落到字母卡。
      if ((kind === 'file' && !isSystemPreviewFile(photo.fileName)) || kind === 'text') {
        photos.setThumbStatus(photoId, 1)
        this.notify(photoId, 'done')
        return
      }

      // 视频：ffmpeg 抽帧 → 复用缩略图管线；时长一并探测。
      // 抽帧与时长探测无数据依赖，并行执行（审查 P3-15）：坏视频最坏 ~80s 串行
      // 会占死 concurrency=2 的队列槽
      if (kind === 'video') {
        const tmpFrame = join(tmpdir(), `leaf-frame_${photoId}_${Date.now()}.png`)
        let videoWidth: number | undefined
        let videoHeight: number | undefined
        const mediaP = probeMedia(photo.filePath)
        try {
          await extractVideoFrame(photo.filePath, tmpFrame)
          // 十五轮 A2：视频宽高 = 抽帧图尺寸（Eagle 卡片/检查器显示视频分辨率）
          try {
            const frame = await sharp(tmpFrame).metadata()
            videoWidth = frame.width ?? undefined
            videoHeight = frame.height ?? undefined
          } catch {
            /* 抽帧图不可读时维持空值 */
          }
          await thumbs.rasterize(tmpFrame, thumbs.pathFor(photoId, 256), 256)
          await thumbs.rasterize(tmpFrame, thumbs.pathFor(photoId, 1024), 1024)
        } finally {
          rmSync(tmpFrame, { force: true })
        }
        const { durationMs, fps } = await mediaP
        photos.updateProcessingResult(photoId, {
          durationMs,
          fps,
          width: videoWidth,
          height: videoHeight
        })
        photos.setThumbStatus(photoId, 1)
        this.notify(photoId, 'done')
        return
      }

      // 1) 缩略图（HEIC 转换在内部处理；失败会抛出走 failed）
      // 六期实测：bundled libvips 解不了 PDF/AI（见 PdfRasterizer 头注），走 pdfjs 首页渲染
      // 阶段 4.3：PSD 无解码器，改提取文件内嵌缩略图资源（ID 1033/1036）；提取失败仍走 thumbStatus=2 兜底
      let preview: string
      let pdfSize: { width: number; height: number } | undefined
      if (isPdfLikeFile(photo.fileName)) {
        const tmpPng = join(tmpdir(), `leaf-pdf_${photoId}_${Date.now()}.png`)
        try {
          pdfSize = await renderPdfFirstPage(photo.filePath, tmpPng)
          await thumbs.rasterize(tmpPng, thumbs.pathFor(photoId, 256), 256)
          await thumbs.rasterize(tmpPng, thumbs.pathFor(photoId, 1024), 1024)
        } finally {
          rmSync(tmpPng, { force: true })
        }
        preview = thumbs.pathFor(photoId, 1024)
      } else if (isPsdFile(photo.fileName)) {
        const tmpPng = join(tmpdir(), `leaf-psd_${photoId}_${Date.now()}.png`)
        try {
          pdfSize = await extractPsdThumbnail(photo.filePath, tmpPng)
          await thumbs.rasterize(tmpPng, thumbs.pathFor(photoId, 256), 256)
          await thumbs.rasterize(tmpPng, thumbs.pathFor(photoId, 1024), 1024)
        } finally {
          rmSync(tmpPng, { force: true })
        }
        preview = thumbs.pathFor(photoId, 1024)
      } else if (isSystemPreviewFile(photo.fileName)) {
        // G4：sips(ImageIO) → qlmanage(QuickLook)。两个都是外部进程且都会挂
        // （实测 qlmanage 对 .hdr 不返回），超时与降级都在 renderSystemPreview 里
        const tmpPng = join(tmpdir(), `leaf-sys_${photoId}_${Date.now()}.png`)
        let ok = false
        try {
          ok = await renderSystemPreview(photo.filePath, tmpPng, 1024)
          if (ok) {
            await thumbs.rasterize(tmpPng, thumbs.pathFor(photoId, 256), 256)
            await thumbs.rasterize(tmpPng, thumbs.pathFor(photoId, 1024), 1024)
          }
        } finally {
          rmSync(tmpPng, { force: true })
        }
        if (!ok) {
          // 系统也 render 不出来：保持今天的扩展名字母卡形态，不标成"坏图"之外的状态
          photos.setThumbStatus(photoId, 2)
          this.notify(photoId, 'failed')
          return
        }
        preview = thumbs.pathFor(photoId, 1024)
      } else {
        ;({ preview } = await thumbs.ensure(photoId, photo.filePath))
      }

      // 2) EXIF（读原文件，exifr 支持 HEIC）
      let exif: ExifLike | undefined
      try {
        exif = (await exifr.parse(photo.filePath, true)) as ExifLike | undefined
      } catch (err) {
        console.warn(`[AssetProcessing] exif parse failed (non-fatal): ${photo.filePath}`, err)
      }

      // 3) pHash + 主色：对 1024 预览计算，跨格式确定性一致
      const phash = await pHash(preview)
      const dominant = (await sharp(preview).stats()).dominant
      // 十五轮 B4：多色板（Eagle 检查器色点行）；失败不阻断管线
      let palette: string[] | undefined
      try {
        palette = await extractPalette(preview)
      } catch {
        palette = undefined
      }

      // 4) 文件 md5（精确去重）——流式读取，常数内存（审查修复：整文件读入有内存尖峰）
      const fileHash = await hashFileStreaming(photo.filePath)

      // 5) 尺寸补缺：PDF 用渲染视口，其余优先 EXIF 记录的原始像素尺寸；
      //    十五轮 A2：EXIF 无记录（网络图等）时用 sharp 读原图兜底（Eagle 全部显示尺寸）
      let width = pdfSize?.width ?? photo.width ?? exif?.ExifImageWidth ?? undefined
      let height = pdfSize?.height ?? photo.height ?? exif?.ExifImageHeight ?? undefined
      if ((!width || !height) && existsSync(photo.filePath)) {
        try {
          const meta = await sharp(photo.filePath).metadata()
          width = width ?? meta.width ?? undefined
          height = height ?? meta.height ?? undefined
        } catch {
          /* sharp 解不了的格式维持现状（HEIC 已在 EXIF 拿到） */
        }
      }

      photos.updateProcessingResult(photoId, {
        takenAt: dateToMs(exif?.DateTimeOriginal) ?? dateToMs(exif?.CreateDate) ?? null,
        width,
        height,
        hash: fileHash,
        phash,
        colorDominant: toHexColor(dominant),
        palette,
        cameraModel: exif?.Model,
        lensModel: exif?.LensModel,
        iso: exif?.ISO,
        aperture: exif?.FNumber,
        shutter: formatShutter(exif?.ExposureTime),
        focalLength: exif?.FocalLength,
        latitude: exif?.latitude,
        longitude: exif?.longitude
      })
      this.notify(photoId, 'done')
      // F12：OCR 开启时，处理完成的图片低优先级入队识别（不阻塞管线；
      // 钩子自兜底——单测/无全局库环境下 pref 读取会抛错，不能影响管线成败）
      try {
        if (this.deps.photos.getPhotoById(photoId)?.kind === 'image') {
          ocrService.enqueue(photoId)
        }
      } catch {
        /* OCR 不可用：静默跳过 */
      }
      // G1：向量索引增量跟进。不接这一步，"全库建索引"跑完后新导入的素材
      // 会永久缺席向量档，用户只会觉得"以图搜图怎么找不到刚导的那张"。
      // 只在模型已就绪时做（没下载就静默跳过，不催用户下载）。
      try {
        if (clipEmbeddings.isReady()) {
          await clipEmbeddings.indexOne(photoId, photo.filePath)
        }
      } catch (err) {
        console.warn(`[AssetProcessing] vector index skipped: ${photoId}`, err)
      }
    } catch (err) {
      console.error(`[AssetProcessing] process failed: ${photoId}`, err)
      this.deps.photos.setThumbStatus(photoId, 2)
      this.notify(photoId, 'failed')
    }
  }
}
