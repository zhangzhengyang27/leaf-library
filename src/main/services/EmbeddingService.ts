/**
 * Leaf · EmbeddingService（三期 P0：AI 语义搜索 + 自动打标）
 *
 * - 模型：transformers.js v3 加载 ONNX 量化 CLIP（q8 约 90–150MB），首次使用按需下载到
 *   <userData>/models，环境变量 HF_HOME 引导缓存目录；不打包进安装包。
 * - 图像向量：对 1024 缩略图（thumb:// 管线产物）推理，512 维 float32 存 photo_embeddings。
 * - 检索：全量载入 + 暴力余弦——万级库毫秒级；5 万+ 再迁 sqlite-vec，本表可沿用。
 * - 打标：CLIP zero-shot 对候选标签打分，Top-N 作为「建议标签」，人审后入 tag_tags。
 * - embedder 可注入（测试用 hash-embedder 等价替身），核心检索/存储逻辑与模型解耦。
 */

import { join } from 'path'
import { app } from 'electron'
import PQueue from 'p-queue'
import type Database from 'better-sqlite3'
import { database } from '../db/database'
import { now } from '../db/repo'
import { photoRepository } from '../db/repos/PhotoRepository'
import { getThumbnailService } from './ThumbnailService'
import { extensionOf } from '@shared/assetTypes'

/** 与主进程类型解耦的最小 Photo 形状 */
export interface EmbeddablePhoto {
  id: string
  filePath: string
  thumbStatus: number
}

export interface Embedder {
  readonly modelId: string
  readonly dim: number
  /** 图像 → 归一化向量 */
  embedImage(imagePath: string): Promise<Float32Array>
  /** 文本 → 归一化向量 */
  embedText(text: string): Promise<Float32Array>
}

export interface SemanticSearchResult {
  photoId: string
  score: number
}

export interface TagSuggestion {
  tag: string
  score: number
}

export interface EmbeddingProgress {
  done: number
  total: number
  phase: 'indexing' | 'idle' | 'failed'
}

const CANDIDATE_TAGS = [
  '截图 screenshot of computer interface',
  '风景照 mountains or landscape scenery',
  '人物照片 person portrait people',
  '文档 document text page',
  '代码 screenshot of code editor',
  '美食 photo of food',
  '动物宠物 cat dog animal pet',
  '城市建筑 buildings city street',
  '海报设计 poster design graphic',
  '壁纸 wallpaper dark background',
  '手机应用界面 mobile app ui',
  '图表 chart diagram data'
]

class ClipEmbedder implements Embedder {
  readonly modelId = 'Xenova/clip-vit-base-patch32'
  readonly dim = 512

  // 模型/分词器缓存（审查修复：原每次推理都 from_pretrained，索引万级图会做万次 session 初始化）
  private processor: Awaited<
    ReturnType<typeof import('@huggingface/transformers').AutoProcessor.from_pretrained>
  > | null = null
  private vision: Awaited<
    ReturnType<
      typeof import('@huggingface/transformers').CLIPVisionModelWithProjection.from_pretrained
    >
  > | null = null
  private tokenizer: Awaited<
    ReturnType<typeof import('@huggingface/transformers').AutoTokenizer.from_pretrained>
  > | null = null
  private textModel: Awaited<
    ReturnType<
      typeof import('@huggingface/transformers').CLIPTextModelWithProjection.from_pretrained
    >
  > | null = null

  private async getProcessor() {
    if (!this.processor) {
      const { AutoProcessor } = await import('@huggingface/transformers')
      this.processor = await AutoProcessor.from_pretrained(this.modelId)
    }
    return this.processor
  }

  private async getVision() {
    if (!this.vision) {
      const { CLIPVisionModelWithProjection } = await import('@huggingface/transformers')
      this.vision = await CLIPVisionModelWithProjection.from_pretrained(this.modelId, {
        dtype: 'q8'
      })
    }
    return this.vision
  }

  private async getTokenizer() {
    if (!this.tokenizer) {
      const { AutoTokenizer } = await import('@huggingface/transformers')
      this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId)
    }
    return this.tokenizer
  }

  private async getTextModel() {
    if (!this.textModel) {
      const { CLIPTextModelWithProjection } = await import('@huggingface/transformers')
      this.textModel = await CLIPTextModelWithProjection.from_pretrained(this.modelId, {
        dtype: 'q8'
      })
    }
    return this.textModel
  }

  async embedImage(imagePath: string): Promise<Float32Array> {
    const [processor, vision, { RawImage }] = await Promise.all([
      this.getProcessor(),
      this.getVision(),
      import('@huggingface/transformers')
    ])
    const image = await RawImage.read(imagePath)
    const inputs = await processor(image)
    const output = await vision(inputs)
    return normalize(Float32Array.from(output.image_embeds.data))
  }

  async embedText(text: string): Promise<Float32Array> {
    const [tokenizer, textModel] = await Promise.all([this.getTokenizer(), this.getTextModel()])
    const inputs = tokenizer(text, { padding: true, truncation: true })
    const output = await textModel(inputs)
    return normalize(Float32Array.from(output.text_embeds.data))
  }
}

function normalize(v: Float32Array): Float32Array {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm)
  if (norm === 0) return v
  for (let i = 0; i < v.length; i++) v[i] /= norm
  return v
}

export class EmbeddingService {
  private readonly db: Database.Database
  private queue = new PQueue({ concurrency: 1 })
  private clip: Embedder | null = null
  private embedderOverride: Embedder | null = null
  /** 候选标签文本向量缓存（随 embedder 切换失效） */
  private textVecCache = new Map<string, Float32Array>()
  /** 进度监听（主进程转发给渲染层 photos:embedding） */
  notify: ((p: EmbeddingProgress) => void) | null = null
  private progress = { done: 0, total: 0, phase: 'idle' as EmbeddingProgress['phase'] }

  constructor(db?: Database.Database) {
    this.db = db ?? database.handle
  }

  /** 测试注入替身 embedder */
  setEmbedder(e: Embedder | null): void {
    this.embedderOverride = e
    this.clip = null // 重置已加载模型
    this.textVecCache.clear()
  }

  private async getEmbedder(): Promise<Embedder> {
    if (this.embedderOverride) return this.embedderOverride
    if (!this.clip) {
      this.clip = new ClipEmbedder()
    }
    return this.clip
  }

  private get activeModelId(): string {
    return this.embedderOverride?.modelId ?? new ClipEmbedder().modelId
  }

  private setPhase(phase: EmbeddingProgress['phase'], done = 0, total = 0): void {
    this.progress = { done, total, phase }
    this.notify?.(this.progress)
  }

  // —— 存储 ——

  private upsert(photoId: string, vec: Float32Array, modelId: string): void {
    this.db
      .prepare(
        `INSERT INTO photo_embeddings (photo_id, model, dim, embedding, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(photo_id) DO UPDATE SET model = excluded.model, dim = excluded.dim,
           embedding = excluded.embedding, created_at = excluded.created_at`
      )
      .run(
        photoId,
        modelId,
        vec.length,
        Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength),
        now()
      )
  }

  hasEmbedding(photoId: string): boolean {
    return (
      this.db
        .prepare(`SELECT 1 FROM photo_embeddings WHERE photo_id = ? AND model = ?`)
        .get(photoId, this.activeModelId) !== undefined
    )
  }

  /** 已建向量数量（当前模型） */
  indexedCount(): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM photo_embeddings WHERE model = ?`)
      .get(this.activeModelId) as { n: number }
    return r.n
  }

  /** 全部向量（检索用），按 model 过滤 */
  private loadAllVectors(): Array<{ photoId: string; vec: Float32Array }> {
    const rows = this.db
      .prepare(`SELECT photo_id, embedding FROM photo_embeddings WHERE model = ?`)
      .all(this.activeModelId) as Array<{ photo_id: string; embedding: Buffer }>
    return rows.map((r) => ({
      photoId: r.photo_id,
      vec: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)
    }))
  }

  // —— 建索引 ——

  /** 为单张图建向量（处理管线或手动补齐时调用）。向量来源为 1024 预览缩略图。 */
  async embedPhoto(photoId: string): Promise<boolean> {
    const embedder = await this.getEmbedder()
    const preview = getThumbnailService().getCachedPath(photoId, 1024)
    if (!preview) return false
    const vec = await embedder.embedImage(preview)
    this.upsert(photoId, vec, embedder.modelId)
    return true
  }

  /** indexMissingPhotos 在飞标记（审查 P3-17）：IPC 可重复触发，重入会让共享
   *  progress 的 done/total 串扰、提前广播 idle */
  private indexing = false

  /** 全库补齐缺失向量（后台队列串行），返回本次入队数量 */
  async indexMissingPhotos(getPhotos: () => EmbeddablePhoto[]): Promise<number> {
    if (this.indexing) return 0
    const missing = getPhotos().filter((p) => p.thumbStatus === 1 && !this.hasEmbedding(p.id))
    if (missing.length === 0) return 0
    this.indexing = true
    try {
      this.setPhase('indexing', 0, missing.length)
      for (const p of missing) {
        void this.queue.add(async () => {
          try {
            await this.embedPhoto(p.id)
          } catch (err) {
            console.error(`[Embedding] index failed: ${p.id}`, err)
          } finally {
            this.setPhase(
              this.progress.done + 1 >= missing.length ? 'idle' : 'indexing',
              this.progress.done + 1,
              missing.length
            )
          }
        })
      }
      await this.queue.onIdle()
      return missing.length
    } finally {
      this.indexing = false
    }
  }

  // —— 语义搜索 ——

  /** 自然语言搜图：文本向量 × 图像向量余弦（两者已归一化，点积即余弦） */
  async semanticSearch(
    query: string,
    limit = 100,
    minScore = 0.2
  ): Promise<SemanticSearchResult[]> {
    const queryNorm = query.trim()
    if (!queryNorm) return []
    const embedder = await this.getEmbedder()
    const qv = await embedder.embedText(queryNorm)
    const all = this.loadAllVectors()
    const scored: SemanticSearchResult[] = []
    for (const { photoId, vec } of all) {
      if (vec.length !== qv.length) continue
      let dot = 0
      for (let i = 0; i < qv.length; i++) dot += qv[i] * vec[i]
      if (dot >= minScore) scored.push({ photoId, score: dot })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  /** 读取已存向量（无则 undefined） */
  getVector(photoId: string): Float32Array | undefined {
    const row = this.db
      .prepare(
        `SELECT embedding FROM photo_embeddings WHERE photo_id = ? AND model = ?`
      )
      .get(photoId, this.activeModelId) as { embedding: Buffer } | undefined
    if (!row) return undefined
    return new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    )
  }

  /**
   * F15：CLIP 以图找图（视觉相似，Eagle 4.0「Pinterest 以图找图」的应用内对齐）。
   * 查询向量优先取已存向量（快），缺失时现场推理 1024 缩略图；
   * 与全库图像向量算余弦（已归一化，点积即余弦），排除自身。
   * minScore 默认 0.6——图像-图像相似度远高于文本-图像，0.2 的文本阈值不适用。
   */
  async findSimilarVisual(
    photoId: string,
    limit = 40,
    minScore = 0.6
  ): Promise<SemanticSearchResult[]> {
    let qv = this.getVector(photoId)
    if (!qv) {
      const preview = getThumbnailService().getCachedPath(photoId, 1024)
      if (!preview) return []
      const embedder = await this.getEmbedder()
      qv = await embedder.embedImage(preview)
    }
    const all = this.loadAllVectors()
    const scored: SemanticSearchResult[] = []
    for (const { photoId: pid, vec } of all) {
      if (pid === photoId || vec.length !== qv.length) continue
      let dot = 0
      for (let i = 0; i < qv.length; i++) dot += qv[i] * vec[i]
      if (dot >= minScore) scored.push({ photoId: pid, score: dot })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  // —— 自动打标（CLIP zero-shot） ——

  /** 对单张图给出候选标签建议（分数降序） */
  async suggestTags(photoId: string, topN = 3): Promise<TagSuggestion[]> {
    const embedder = await this.getEmbedder()
    const preview = getThumbnailService().getCachedPath(photoId, 1024)
    if (!preview) return []
    const iv = await embedder.embedImage(preview)
    const out: TagSuggestion[] = []
    for (const candidate of CANDIDATE_TAGS) {
      // 候选文本向量只算一次（审查修复：原每次点击 12 次文本推理）
      let tv = this.textVecCache.get(candidate)
      if (!tv) {
        tv = await embedder.embedText(candidate)
        this.textVecCache.set(candidate, tv)
      }
      let dot = 0
      for (let i = 0; i < iv.length; i++) dot += iv[i] * tv[i]
      out.push({ tag: candidate, score: dot })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, topN)
  }

  /** 全库自动打标（阶段 5.3）：对缺标签且已有向量的素材批量建议并落库（分数阈值过滤） */
  async autoTagLibrary(
    photos: Array<{ id: string; tags: string[] }>,
    opts: {
      topN?: number
      minScore?: number
      /** 落库回调（默认走 PhotoRepository.addTag；测试可注入替身） */
      applyTag?: (photoId: string, tag: string) => boolean | undefined
    } = {}
  ): Promise<{ tagged: number; scanned: number }> {
    const { topN = 2, minScore = 0.24 } = opts
    const applyTag = opts.applyTag ?? ((photoId, tag) => !!photoRepository.addTag(photoId, tag))
    const candidates = photos.filter((p) => p.tags.length === 0 && this.hasEmbedding(p.id))
    if (candidates.length === 0) return { tagged: 0, scanned: 0 }
    this.setPhase('indexing', 0, candidates.length)
    let tagged = 0
    await this.queue.onIdle()
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i]
      try {
        const suggestions = await this.suggestTags(p.id, topN)
        for (const s of suggestions) {
          // 候选文本形如「截图 screenshot of ...」，取第一个中文词作为标签
          if (s.score >= minScore) {
            const tag = s.tag.split(' ')[0]
            if (tag && applyTag(p.id, tag)) tagged += 1
          }
        }
      } catch (err) {
        console.error(`[Embedding] autoTag failed: ${p.id}`, err)
      }
      this.setPhase(i + 1 >= candidates.length ? 'idle' : 'indexing', i + 1, candidates.length)
    }
    return { tagged, scanned: candidates.length }
  }

  /** 描述建议（阶段 5.3 最小版）：把得分最高的候选标签拼成一句描述文案 */
  async suggestDescription(photoId: string): Promise<string | null> {
    const suggestions = await this.suggestTags(photoId, 3)
    if (suggestions.length === 0) return null
    const names = suggestions.map((s) => s.tag.split(' ')[0]).filter(Boolean)
    if (names.length === 0) return null
    return `这张素材的内容偏向：${names.join('、')}。`
  }

  /** 命名建议（AI 动作扩展）：top 候选标签 + 原文件名 → `${标签}-${原名}.ext` */
  async suggestName(photoId: string): Promise<string | null> {
    const photo = photoRepository.getPhotoById(photoId)
    if (!photo) return null
    const suggestions = await this.suggestTags(photoId, 1)
    if (suggestions.length === 0) return null
    const tag = suggestions[0].tag.split(' ')[0]
    if (!tag) return null
    const base = photo.fileName.replace(/\.[^.]+$/, '')
    const ext = extensionOf(photo.fileName)
    return `${tag}-${base}${ext ? `.${ext}` : ''}`
  }

  get pendingCount(): number {
    return this.queue.size + this.queue.pending
  }

  onIdle(): Promise<void> {
    return this.queue.onIdle()
  }
}

let singleton: EmbeddingService | null = null

export function getEmbeddingService(): EmbeddingService {
  if (!singleton) singleton = new EmbeddingService()
  return singleton
}

/** 引导 transformers.js 模型缓存到 userData（主进程启动时调用一次） */
export function setupModelCacheDir(): void {
  process.env.HF_HOME = join(app.getPath('userData'), 'models')
}

/**
 * 探测本机 AI 推理可用性：onnxruntime-node 原生二进制是否可加载。
 * 注意：ORT 1.24.x 无 darwin/x64 二进制——x64 Mac 上返回 false，UI 需优雅降级。
 */
export function isAiAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 运行时探测，可选依赖
    require('onnxruntime-node')
    return true
  } catch {
    return false
  }
}
