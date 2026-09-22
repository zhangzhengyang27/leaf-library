/**
 * Leaf · VisionEmbeddingService（G1 图像向量塔·图像侧）
 *
 * 模型：jinaai/jina-clip-v1 的 **fp32** 视觉塔。两个实测出来的硬约束：
 *  - fp16 导出在 onnxruntime-node 1.24.3 上加载即崩（SimplifiedLayerNormFusion 撞
 *    InsertedPrecisionFreeCast_），所以只能 fp32（344MB）或 int8；
 *  - 直连 huggingface.co 不通，走 hf-mirror。
 *
 * 向量取自 **256 缩略图**而不是原文件：一是 sharp 解不了我们刚支持的那批
 * （HEIC/RAW/设计档原图），二是缩略图才是"用户看见的内容"。
 *
 * 可用性判定刻意做成"真跑一次才算可用"：D-017 那轮 `isAiAvailable()` 在 pnpm 布局下
 * 恒 false（探测本身是坏的），所以这里不探测文件存在就算好——必须
 * 建 session 成功 + 一次 warm-up 推理出有限非零向量，才写 .ready 标记并认它可用。
 */
import { app } from 'electron'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { get as httpsGet } from 'node:https'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import sharp from 'sharp'
import * as ort from 'onnxruntime-node'
import { cosine, l2Normalize, parseVector, vectorToBlob } from '@shared/vectors'
import type { VectorProgress, VectorStatus } from '@shared/vectorTypes'

export type { VectorProgress, VectorStatus }
import { PhotoVectorRepository } from '../db/repos/PhotoVectorRepository'
import { getThumbnailService } from './ThumbnailService'

/** 模型标识（同时是 photo_vectors.model 的取值；换模型即与旧向量隔离） */
export const VISION_MODEL_ID = 'jina-clip-v1-fp32-vision'
const MODEL_FILE = 'vision_model.onnx'
const READY_MARKER = '.ready'
const MODEL_URL = `https://hf-mirror.com/jinaai/jina-clip-v1/resolve/main/onnx/${MODEL_FILE}`
/** 仅用于设置页"要先下多大"的提示；不做硬校验（上游换文件只会让提示略偏，不该据此判下载失败） */
const APPROX_MODEL_BYTES = 344_000_000
const EMBED_DIM = 768
// preprocessor_config.json 实测值（抄 CLIP 常量会错：jina 的均值/方差与 OpenCLIP 默认不同）
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]
const SIDE = 224

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class VisionEmbeddingService {
  private session: ort.InferenceSession | null = null
  private sessionKey = ''
  running = false
  private cancelRequested = false
  private progress: VectorProgress | null = null
  private downloadGot = 0
  private downloadTotal = 0
  private lastError: string | null = null
  /** ready 标记的缓存：每张新素材入库都要问一次，不能每次都 stat + 数库 */
  private readyFlag: boolean | null = null

  /** 懒取：ThumbnailService 单例构造时要读 userData，构造期不能碰 */
  private get thumbs(): ReturnType<typeof getThumbnailService> {
    return getThumbnailService()
  }

  /** 测试注入点：真机测试要能指着已下载的模型跑通全路径，不依赖 userData 位置 */
  private dirOverride: string | null = null
  setModelDirForTests(dir: string | null): void {
    this.dirOverride = dir
    this.session = null
    this.sessionKey = ''
  }

  /** status() 要查库，测试里没有 production database 单例可拿 */
  private repo: PhotoVectorRepository = new PhotoVectorRepository()
  setRepoForTests(repo: PhotoVectorRepository): void {
    this.repo = repo
  }

  get dir(): string {
    return this.dirOverride ?? join(app.getPath('userData'), 'models', VISION_MODEL_ID)
  }

  get modelPath(): string {
    return join(this.dir, MODEL_FILE)
  }

  private get readyPath(): string {
    return join(this.dir, READY_MARKER)
  }

  /** 模型在位且 warm-up 过（.ready 存在）——给入库钩子用的廉价判定 */
  isReady(): boolean {
    if (this.readyFlag === null) {
      this.readyFlag = existsSync(this.modelPath) && existsSync(this.readyPath)
    }
    return this.readyFlag
  }

  status(): VectorStatus {
    const installed = existsSync(this.modelPath)
    return {
      installed,
      ready: installed && existsSync(this.readyPath),
      bytesOnDisk: installed ? statSync(this.modelPath).size : 0,
      indexed: this.repo.countByModel(VISION_MODEL_ID),
      pending: this.repo.countMissing(VISION_MODEL_ID),
      progress: this.progress,
      downloadGot: this.downloadGot,
      downloadTotal: this.downloadTotal,
      modelId: VISION_MODEL_ID,
      modelUrl: MODEL_URL,
      approxBytes: APPROX_MODEL_BYTES,
      lastError: this.lastError
    }
  }

  /** 下载模型（已存在且 ready 则跳过）。onBeforeSave 用于回传进度。 */
  async download(onProgress?: (got: number, total: number) => void): Promise<void> {
    if (this.status().ready) return
    mkdirSync(this.dir, { recursive: true })
    rmSync(this.readyPath, { force: true })
    this.session = null
    this.readyFlag = false
    this.downloadGot = 0
    this.downloadTotal = APPROX_MODEL_BYTES
    await this.fetchTo(this.modelPath, MODEL_URL, 6, (got, total) => {
      this.downloadGot = got
      if (total > 0) this.downloadTotal = total
      onProgress?.(got, this.downloadTotal)
    })
    // 下载完先证明它真能跑出像样的向量，再打 ready 标记
    await this.warmUp()
    writeFileSync(this.readyPath, JSON.stringify({ at: Date.now(), url: MODEL_URL }))
    this.readyFlag = true
  }

  private fetchTo(
    dest: string,
    url: string,
    redirectsLeft: number,
    onProgress?: (got: number, total: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      httpsGet(url, (res) => {
        const code = res.statusCode ?? 0
        if (code >= 300 && code < 400 && res.headers.location) {
          res.resume()
          if (redirectsLeft <= 0) return reject(new Error('重定向次数过多'))
          return resolve(this.fetchTo(dest, res.headers.location, redirectsLeft - 1, onProgress))
        }
        if (code !== 200) {
          res.resume()
          return reject(new Error(`下载失败 HTTP ${code}`))
        }
        const total = Number(res.headers['content-length'] ?? 0)
        let got = 0
        res.on('data', (chunk: Buffer) => {
          got += chunk.length
          onProgress?.(got, total)
        })
        void pipeline(res, createWriteStream(dest))
          .then(resolve)
          .catch((error: unknown) => {
            // 半截文件留着会被下次当成"已下载"，直接删掉
            rmSync(dest, { force: true })
            reject(error instanceof Error ? error : new Error(String(error)))
          })
      }).on('error', (error: Error) => {
        rmSync(dest, { force: true })
        reject(error)
      })
    })
  }

  removeModel(): void {
    this.session = null
    this.sessionKey = ''
    this.readyFlag = false
    rmSync(this.dir, { recursive: true, force: true })
  }

  clearVectors(): number {
    return this.repo.clearAll()
  }

  private async ensureSession(): Promise<ort.InferenceSession> {
    if (!existsSync(this.modelPath)) throw new Error('模型未下载')
    const key = `${this.modelPath}:${statSync(this.modelPath).size}`
    if (this.session && this.sessionKey === key) return this.session
    this.session = await ort.InferenceSession.create(this.modelPath, {
      logSeverityLevel: 3
    })
    this.sessionKey = key
    return this.session
  }

  /** 拿一张小图真跑一次：出不了有限非零向量就抛，绝不"看起来装好了" */
  private async warmUp(): Promise<void> {
    const px = new Uint8Array(SIDE * SIDE * 3).fill(128)
    const png = await sharp(Buffer.from(px), { raw: { width: SIDE, height: SIDE, channels: 3 } })
      .png()
      .toBuffer()
    const v = await this.embedBuffer(png)
    if (!v) throw new Error('warm-up 推理未得到有效向量')
  }

  /** 图像 buffer → 归一后的单位向量；任何一步不成立都返回 null（不存脏数据） */
  async embedBuffer(input: Buffer): Promise<Float32Array | null> {
    try {
      const session = await this.ensureSession()
      const raw = await sharp(input)
        .resize({ width: SIDE, height: SIDE, fit: 'cover', kernel: 'cubic' })
        .removeAlpha()
        .raw()
        .toBuffer()
      if (raw.length !== SIDE * SIDE * 3) return null
      const plane = SIDE * SIDE
      const data = new Float32Array(3 * plane)
      for (let i = 0; i < plane; i++) {
        data[i] = (raw[i * 3] / 255 - MEAN[0]) / STD[0]
        data[plane + i] = (raw[i * 3 + 1] / 255 - MEAN[1]) / STD[1]
        data[2 * plane + i] = (raw[i * 3 + 2] / 255 - MEAN[2]) / STD[2]
      }
      const inputName = session.inputNames[0]
      const out = await session.run({
        [inputName]: new ort.Tensor('float32', data, [1, 3, SIDE, SIDE])
      })
      const t = out[session.outputNames[0]] as unknown as { data?: unknown } | undefined
      const flat = t?.data ? Float32Array.from(t.data as ArrayLike<number>) : null
      if (!flat || flat.length < EMBED_DIM) return null
      return l2Normalize(flat.subarray(0, EMBED_DIM))
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      return null
    }
  }

  /** 素材向量：优先 256 缩略图（覆盖原图解不了的格式），退化到原文件 */
  async embedPhoto(photoId: string, filePath: string): Promise<Float32Array | null> {
    const thumb = this.thumbs.pathFor(photoId, 256)
    const source = existsSync(thumb) ? thumb : filePath
    if (!existsSync(source)) return null
    return this.embedBuffer(readFileSync(source))
  }

  async indexOne(photoId: string, filePath: string): Promise<boolean> {
    const v = await this.embedPhoto(photoId, filePath)
    if (!v) return false
    this.repo.upsert(photoId, VISION_MODEL_ID, v.length, vectorToBlob(v))
    return true
  }

  removeVector(photoId: string): void {
    this.repo.delete(photoId)
  }

  cancelIndexing(): void {
    this.cancelRequested = true
  }

  /**
   * 全库建索引。分批取待办清单（每批 200），边跑边回进度。
   * 串行而非并发：ORT 单次推理已吃满多核，并发只会让内存和 CPU 抢成一团。
   */
  async indexAll(
    onProgress?: (p: VectorProgress) => void,
    opts?: { onlyMissing?: boolean }
  ): Promise<VectorProgress> {
    if (this.running) throw new Error('已有索引任务在跑')
    const status = this.status()
    if (!status.ready) throw new Error('模型未就绪（先在设置页下载模型）')
    this.running = true
    this.cancelRequested = false
    let done = 0
    const report = (p: VectorProgress): void => {
      this.progress = p
      onProgress?.(p)
    }
    let failed = 0
    try {
      if (!opts?.onlyMissing) this.clearVectors()
      let total = this.repo.countMissing(VISION_MODEL_ID)
      // 进度先给个 0，让 UI 立刻有分母
      report({ done, total, failed })
      while (!this.cancelRequested) {
        const batch = this.repo.listMissing(VISION_MODEL_ID, 200)
        if (batch.length === 0) break
        total = done + batch.length + this.repo.countMissing(VISION_MODEL_ID)
        for (const row of batch) {
          if (this.cancelRequested) break
          const ok = await this.indexOne(row.id, row.filePath)
          if (ok) done++
          else failed++
          report({ done, total: Math.max(total, done + failed), failed })
          // 让出事件循环：否则 UI 在整个批次期间完全冻结
          await sleep(0)
        }
      }
      return { done, total: Math.max(total, done + failed), failed }
    } finally {
      this.running = false
      // progress 留最后一次结果供 UI 收尾显示，取消/报错时也不抹掉已完成的计数
      this.progress = { done, total: Math.max(done, done + failed), failed }
    }
  }

  /** 与全库向量比余弦，取前 topK（排除自身） */
  searchByVector(
    vec: Float32Array,
    topK = 24,
    excludeId?: string
  ): Array<{ id: string; score: number }> {
    const rows = this.repo.allByModel(VISION_MODEL_ID)
    const scored: Array<{ id: string; score: number }> = []
    for (const r of rows) {
      if (r.photo_id === excludeId) continue
      const v = parseVector(r.vec, r.dim)
      if (!v) continue
      const s = cosine(vec, v)
      if (s > 0) scored.push({ id: r.photo_id, score: s })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  async searchByPhoto(
    photoId: string,
    filePath: string,
    topK = 24
  ): Promise<Array<{ id: string; score: number }>> {
    const v = (await this.embedPhoto(photoId, filePath)) ?? null
    if (!v) return []
    return this.searchByVector(v, topK, photoId)
  }

  /** 外部图片（以图搜图）：只比已建索引的库内素材 */
  async searchByImageBuffer(buf: Buffer, topK = 24): Promise<Array<{ id: string; score: number }>> {
    const v = await this.embedBuffer(buf)
    if (!v) return []
    return this.searchByVector(v, topK)
  }
}

/** 生产单例（构造期不碰 electron app / userData，见各懒取注释） */
export const visionEmbeddings = new VisionEmbeddingService()
