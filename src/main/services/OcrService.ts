/**
 * Leaf · OcrService（F12：图片文字识别，对齐 Eagle 图片内文字搜索）
 *
 * - 开关存 pref_preferences（key `ocr:enabled`，默认关）
 * - tesseract.js（chi_sim+eng）在 node 环境自管 worker 线程；单并发 + 间隙让出，
 *   语言包首次使用时下载并缓存 userData/tessdata（失败静默，不影响导入主流程）
 * - 识别前 sharp 预处理：长边 ≤1600、灰度、白底（PDF/AI 等透明底避免黑块）
 * - 识别结果写 photo_photos.ocr_text：NULL=未识别（待处理），''=已识别但无文字
 */
import { app } from 'electron'
import { join } from 'path'
import { prefRepository } from '../db/repos/PrefRepository'
import type { PrefRepository } from '../db/repos/PrefRepository'
import { photoRepository } from '../db/repos/PhotoRepository'

const PREF_KEY = 'ocr:enabled'
const IDLE_YIELD_MS = 0

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>

export class OcrService {
  private worker: TesseractWorker | null = null
  private workerLang = ''
  private queue: string[] = []
  private draining = false

  constructor(
    private readonly prefs: Pick<PrefRepository, 'get' | 'set'> = prefRepository
  ) {}

  isEnabled(): boolean {
    return this.prefs.get(PREF_KEY) === '1'
  }

  setEnabled(on: boolean): void {
    this.prefs.set(PREF_KEY, on ? '1' : '0')
    if (!on) {
      this.queue = []
      void this.terminate()
    }
  }

  status(): { enabled: boolean; pending: number; ready: boolean } {
    return {
      enabled: this.isEnabled(),
      pending: this.queue.length,
      ready: this.worker !== null
    }
  }

  /** 缩略图完成的图片入队（未开启时忽略） */
  enqueue(photoId: string): void {
    if (!this.isEnabled() || this.queue.includes(photoId)) return
    this.queue.push(photoId)
    void this.drain()
  }

  /** 手动批量识别：把当前所有待识别图片入队，返回入队数 */
  runPending(limit = 500): number {
    if (!this.isEnabled()) return 0
    const items = photoRepository.listOcrPending(limit)
    for (const it of items) this.enqueue(it.id)
    return items.length
  }

  async terminate(): Promise<void> {
    const w = this.worker
    this.worker = null
    this.workerLang = ''
    try {
      await w?.terminate()
    } catch {
      /* ignore */
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift()
        if (id === undefined) break
        await this.recognize(id)
        // 让出事件循环：缩略图/导入永远优先
        await new Promise((res) => setTimeout(res, IDLE_YIELD_MS))
      }
    } finally {
      this.draining = false
    }
  }

  private async recognize(photoId: string): Promise<void> {
    const photo = photoRepository.getPhotoById(photoId)
    if (!photo) return
    let workerReady = false
    try {
      const sharp = (await import('sharp')).default
      const buf = await sharp(photo.filePath)
        .flatten({ background: '#ffffff' })
        .greyscale()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
      await this.ensureWorker()
      workerReady = true
      const { data } = await this.worker!.recognize(buf)
      photoRepository.updateOcrText(photoId, (data.text ?? '').trim())
    } catch (err) {
      console.warn('[Ocr] recognize failed:', photoId, err)
      // 区分错误类别（审查 P2-26）：worker 创建/语言包下载失败是瞬时错误（离线首次启用），
      // 保留 ocr_text IS NULL 让下次重试；仅识别执行失败才落 '' 防止反复重试
      if (workerReady) {
        photoRepository.updateOcrText(photoId, '')
      } else {
        console.warn('[Ocr] worker 初始化失败，保留待识别状态以便重试')
      }
    }
  }

  private async ensureWorker(): Promise<TesseractWorker> {
    const lang = 'chi_sim+eng'
    if (this.worker && this.workerLang === lang) return this.worker
    await this.terminate()
    const { createWorker } = await import('tesseract.js')
    this.worker = await createWorker(lang, 1, {
      cachePath: join(app.getPath('userData'), 'tessdata'),
      logger: () => {}
    })
    this.workerLang = lang
    return this.worker
  }
}

export const ocrService = new OcrService()
