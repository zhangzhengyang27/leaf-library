/**
 * Leaf · ClipEmbeddingService（G1 向量档：中文文搜图 + 视觉找相似，同一座模型）
 *
 * 模型：Xenova/chinese-clip-vit-base-patch16 的 **fp32 融合图**（model.onnx 754MB，
 * 一次导出含文本塔与图像塔，按请求的输出裁剪）。为什么不是先上线的 jina-clip-v1：
 *  48 张真图池实测（见《二十九轮》§7）——
 *   中文 top-1：chinese-clip 18/18，jina-clip-v1 2/18（平均名次 15.83，等于瞎猜）；
 *   根因在词表：jina 的文本塔是 30,528 条英文 BERT 词表、只含 244 个汉字，
 *   中文 UNK 率 70%，这是分词层面的死路，调阈值/换预处理都救不回来。
 *  近似重复判别力两者同级（0.996 vs 0.994），所以一档模型够用，不必并存两套索引。
 *
 * 三个实测出来的硬约束：
 *  - fp16 导出在 onnxruntime-node 1.24.3 上加载即崩（SimplifiedLayerNormFusion 撞
 *    InsertedPrecisionFreeCast_），只能 fp32；
 *  - 直连 huggingface.co 不通，走 hf-mirror；
 *  - 融合图要求一次喂齐 input_ids/attention_mask/pixel_values（ORT 不按请求的输出
 *    裁剪输入），所以取单塔输出时另一侧要塞哑输入。
 *
 * 图像向量取自 **256 缩略图**而不是原文件：一是 sharp 解不了我们刚支持的那批
 * （HEIC/RAW/设计档原图），二是缩略图才是"用户看见的内容"。
 *
 * 可用性判定刻意做成"真跑一次才算可用"：D-017 那轮 `isAiAvailable()` 恒 false
 * （探测本身是坏的），所以这里不探测文件存在就算好——必须建 session 成功 +
 * 图像塔出有限非零单位向量 + 文本塔对两条不同中文查询给出不同向量，才写 .ready。
 */
import { app } from 'electron'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
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
import { WordPieceTokenizer, type TokenizerJson } from './WordPieceTokenizer'
import { getThumbnailService } from './ThumbnailService'

/** 模型标识（同时是 photo_vectors.model 的取值；换模型即与旧向量隔离） */
export const CLIP_MODEL_ID = 'chinese-clip-vit-b-16'
const MODEL_FILE = 'model.onnx'
const TOKENIZER_FILE = 'tokenizer.json'
const READY_MARKER = '.ready'
const REPO = 'Xenova/chinese-clip-vit-base-patch16'
const MODEL_URL = `https://hf-mirror.com/${REPO}/resolve/main/onnx/${MODEL_FILE}`
const TOKENIZER_URL = `https://hf-mirror.com/${REPO}/resolve/main/${TOKENIZER_FILE}`
/** 仅用于设置页"要先下多大"的提示；不做硬校验（上游换文件只会让提示略偏，不该据此判下载失败） */
const APPROX_MODEL_BYTES = 754_000_000
const EMBED_DIM = 512
/** chinese-clip 词表条数（vocab.txt 实测 21,128）：拿它挡"词表与模型不配套" */
const EXPECT_VOCAB_SIZE = 21_128
// preprocessor_config.json 实测值：chinese-clip 与 CLIP 同均值方差，resample=3（bicubic）
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]
const SIDE = 224
/**
 * 文本窗口。此前写 77 是照 CLIP 惯例抄的，实测这个导出的 position_embeddings
 * 权重是 [512, 768]，所以窗口本可以放到 512。留 77 是刻意收紧：
 * 中文一字一 token，粘一整段描述进来时截断比"什么都能塞但结果不可解释"更好，
 * 但截断必须能被察觉——semanticRules 那侧已把查询钳在 200 字符内。
 */
const MAX_TEXT_TOKENS = 77
/**
 * 文搜图的最低余弦。48 张池实测：命中的 top-1 分数区间 0.404–0.522，
 * 而"池子里确实没有"的 8 条查询最高只到 0.386 —— 0.40 卡在两者之间。
 * 没有这道闸，搜"钢琴"会返回一张不相干的图并假装它是答案。
 */
export const SEMANTIC_MIN_SCORE = 0.4
/**
 * 图像档的下限。**它是"挡脏数据"的闸，不是相似度判据**——别再拿它当文本档那个 0.40 用。
 *
 * 为什么不能设成有意义的相似度阈值（185 张 Oxford-IIIT Pets 实测，197 对同品种不同照
 * vs 6943 对跨品种）：同品种 p50=0.858，跨品种 p50=0.743 且 max=0.958，
 * 两个分布大面积重叠。任何落在 0.7–0.9 的绝对线都会同时砍掉真相似、放进不相似，
 * 而且随库的同质程度整体漂移（全是猫狗的库和五颜六色的库不是一个量纲）。
 * 所以图像档靠"排序 + 取前 K"表达相似，绝对分数只用来剔除正交/零向量那类退化结果。
 */
export const IMAGE_MIN_SCORE = 0.6

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class ClipEmbeddingService {
  private session: ort.InferenceSession | null = null
  private sessionKey = ''
  private tokenizer: WordPieceTokenizer | null = null
  private tokenizerKey = ''
  running = false
  private cancelRequested = false
  private progress: VectorProgress | null = null
  private downloadGot = 0
  private downloadTotal = 0
  /** 模型级错误（下载/加载/warm-up）。设置页拿它判"要不要停止轮询"，
   *  所以**不能**让单张素材解码失败也写进来——一张坏缩略图会让进度条永远停摆 */
  private lastError: string | null = null
  /** 单张素材/单次推理的失败，只作排查用，不参与 UI 的收尾判定 */
  private lastEmbedError: string | null = null
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
    this.tokenizer = null
    this.tokenizerKey = ''
  }

  /** status() 要查库，测试里没有 production database 单例可拿 */
  private repo: PhotoVectorRepository = new PhotoVectorRepository()
  setRepoForTests(repo: PhotoVectorRepository): void {
    this.repo = repo
  }

  get dir(): string {
    return this.dirOverride ?? join(app.getPath('userData'), 'models', CLIP_MODEL_ID)
  }

  get modelPath(): string {
    return join(this.dir, MODEL_FILE)
  }

  get tokenizerPath(): string {
    return join(this.dir, TOKENIZER_FILE)
  }

  private get readyPath(): string {
    return join(this.dir, READY_MARKER)
  }

  /** 模型在位且 warm-up 过（.ready 存在）——给入库钩子用的廉价判定 */
  isReady(): boolean {
    if (this.readyFlag === null) {
      this.readyFlag = this.installedOnDisk() && existsSync(this.readyPath)
    }
    return this.readyFlag
  }

  private installedOnDisk(): boolean {
    return existsSync(this.modelPath) && existsSync(this.tokenizerPath)
  }

  private bytesOnDisk(): number {
    let n = 0
    for (const p of [this.modelPath, this.tokenizerPath]) {
      if (existsSync(p)) n += statSync(p).size
    }
    return n
  }

  status(): VectorStatus {
    const installed = this.installedOnDisk()
    return {
      installed,
      ready: installed && existsSync(this.readyPath),
      bytesOnDisk: this.bytesOnDisk(),
      indexed: this.repo.countByModel(CLIP_MODEL_ID),
      pending: this.repo.countMissing(CLIP_MODEL_ID),
      progress: this.progress,
      downloadGot: this.downloadGot,
      downloadTotal: this.downloadTotal,
      modelId: CLIP_MODEL_ID,
      modelUrl: MODEL_URL,
      approxBytes: APPROX_MODEL_BYTES,
      lastError: this.lastError ?? this.lastEmbedError,
      minScore: { text: SEMANTIC_MIN_SCORE, image: IMAGE_MIN_SCORE }
    }
  }

  /**
   * 在飞下载。没有这道闸的话，离开设置页再进来点第二次会开第二条流，
   * 两条流写同一个终态文件名 → 落盘成交错垃圾，且要用户手动重下才能恢复。
   */
  private downloadPromise: Promise<void> | null = null

  /** 下载模型（已存在且 ready 则跳过）。分词表先下：它 400KB，失败得更早。 */
  async download(onProgress?: (got: number, total: number) => void): Promise<void> {
    if (this.status().ready) return
    if (this.downloadPromise) return this.downloadPromise
    this.downloadPromise = this.doDownload(onProgress).finally(() => {
      this.downloadPromise = null
    })
    return this.downloadPromise
  }

  private async doDownload(onProgress?: (got: number, total: number) => void): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    rmSync(this.readyPath, { force: true })
    this.session = null
    this.tokenizer = null
    this.readyFlag = false
    this.downloadGot = 0
    this.downloadTotal = APPROX_MODEL_BYTES
    await this.fetchTo(this.tokenizerPath, TOKENIZER_URL, 6)
    await this.fetchTo(this.modelPath, MODEL_URL, 6, (got, total) => {
      this.downloadGot = got
      if (total > 0) this.downloadTotal = total
      onProgress?.(got, this.downloadTotal)
    })
    // 下载完先证明两座塔真能跑出像样的向量，再打 ready 标记
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
        // 先写 .part 再 rename：进程被 kill 时不会留下一个"看着已下载完"的终态文件
        const part = `${dest}.part`
        void pipeline(res, createWriteStream(part))
          .then(() => {
            renameSync(part, dest)
            resolve()
          })
          .catch((error: unknown) => {
            rmSync(part, { force: true })
            reject(error instanceof Error ? error : new Error(String(error)))
          })
      }).on('error', (error: Error) => {
        rmSync(`${dest}.part`, { force: true })
        reject(error)
      })
    })
  }

  removeModel(): void {
    this.session = null
    this.sessionKey = ''
    this.tokenizer = null
    this.tokenizerKey = ''
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
    const next = await ort.InferenceSession.create(this.modelPath, { logSeverityLevel: 3 })
    const old = this.session
    this.session = next
    this.sessionKey = key
    // 旧会话不释放会和新会话并存：一个 754MB 的 fp32 图，8GB 机器上就是 OOM。
    // 先换引用再 release，避免并发 run 拿到已释放的会话
    if (old) void old.release().catch(() => undefined)
    return next
  }

  private loadTokenizer(): WordPieceTokenizer {
    if (!existsSync(this.tokenizerPath)) throw new Error('模型未下载')
    const key = `${this.tokenizerPath}:${statSync(this.tokenizerPath).size}`
    if (this.tokenizer && this.tokenizerKey === key) return this.tokenizer
    const parsed = JSON.parse(readFileSync(this.tokenizerPath, 'utf8')) as TokenizerJson
    this.tokenizer = new WordPieceTokenizer(parsed)
    this.tokenizerKey = key
    return this.tokenizer
  }

  /**
   * 拿真图与真中文各跑一次：出不了有限非零向量、分词表配错、或两条不同中文查询
   * 给出同一向量，都算不可用。
   *
   * 词表这两条闸是被实测逼出来的：把 jina-clip-v1 的 tokenizer.json（30,528 条英文词表）
   * 错放进同一目录，模型照样加载、向量照样是单位向量，只是中文全变 [UNK]——
   * 检索结果看着"有分数"但完全是糊的（实测正确图从 0.4177 掉到 0.3829 还被别的图超过）。
   * 所以"文件在位"不够，必须验证这份词表能读中文。
   */
  private async warmUp(): Promise<void> {
    const tok = this.loadTokenizer()
    if (tok.size !== EXPECT_VOCAB_SIZE) {
      throw new Error(`分词表条数 ${tok.size}，期望 ${EXPECT_VOCAB_SIZE}（词表与模型不配套）`)
    }
    const probe = '一只猫在沙发上'
    if (tok.unkRatio(tok.tokenize(probe)) > 0) {
      throw new Error('分词表读不出中文（全是 [UNK]），判定为不可用')
    }
    const px = new Uint8Array(SIDE * SIDE * 3).fill(128)
    const png = await sharp(Buffer.from(px), { raw: { width: SIDE, height: SIDE, channels: 3 } })
      .png()
      .toBuffer()
    const v = await this.embedBuffer(png)
    if (!v) throw new Error('warm-up 图像塔未得到有效向量')
    const a = await this.embedText('一只猫')
    const b = await this.embedText('一辆汽车')
    if (!a || !b) throw new Error('warm-up 文本塔未得到有效向量')
    if (cosine(a, b) > 0.999) throw new Error('文本塔对不同中文给出同一向量，判定为不可用')
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
      // 通道数必须是 3：按 3 下标读一份 4 通道的数据不会报错，只会让向量整体塌缩
      if (raw.length !== SIDE * SIDE * 3) return null
      const plane = SIDE * SIDE
      const data = new Float32Array(3 * plane)
      for (let i = 0; i < plane; i++) {
        data[i] = (raw[i * 3] / 255 - MEAN[0]) / STD[0]
        data[plane + i] = (raw[i * 3 + 1] / 255 - MEAN[1]) / STD[1]
        data[2 * plane + i] = (raw[i * 3 + 2] / 255 - MEAN[2]) / STD[2]
      }
      const out = await this.run(session, { pixelValues: data, ids: null })
      const t = out[session.outputNames.includes('image_embeds') ? 'image_embeds' : 'output']
      const flat = t?.data ? Float32Array.from(t.data as ArrayLike<number>) : null
      // 维度必须正好等于 EMBED_DIM：多出来说明取错了输出张量，静默截断前 512 维
      // 会得出"看着能用其实是错的"向量，与 shared/vectors 的口径保持一致
      if (!flat || flat.length !== EMBED_DIM) {
        this.lastEmbedError = `图像塔输出维度 ${flat?.length ?? 'null'} ≠ ${EMBED_DIM}`
        return null
      }
      return l2Normalize(flat.subarray(0, EMBED_DIM))
    } catch (error) {
      this.lastEmbedError = error instanceof Error ? error.message : String(error)
      return null
    }
  }

  /** 文本 → 单位向量；模型没下或分词表缺失返回 null（调用方按"这一档不存在"处理） */
  async embedText(text: string): Promise<Float32Array | null> {
    try {
      const session = await this.ensureSession()
      const ids = this.loadTokenizer().encode(text, MAX_TEXT_TOKENS)
      const out = await this.run(session, { pixelValues: null, ids })
      const key = session.outputNames.includes('text_embeds') ? 'text_embeds' : 'output'
      const t = out[key]
      const flat = t?.data ? Float32Array.from(t.data as ArrayLike<number>) : null
      if (!flat || flat.length !== EMBED_DIM) {
        this.lastEmbedError = `文本塔输出维度 ${flat?.length ?? 'null'} ≠ ${EMBED_DIM}`
        return null
      }
      return l2Normalize(flat.subarray(0, EMBED_DIM))
    } catch (error) {
      this.lastEmbedError = error instanceof Error ? error.message : String(error)
      return null
    }
  }

  /**
   * 融合图要求一次喂齐三个输入，另一侧给哑值（哑像素用零张量：它不参与请求的输出）。
   * 用 run(feeds, outputNames) 只要那一侧的输出，ORT 会裁掉用不上的分支。
   */
  private async run(
    session: ort.InferenceSession,
    part: { pixelValues: Float32Array | null; ids: number[] | null }
  ): Promise<Record<string, ort.Tensor>> {
    const ids = part.ids ?? [101, 102]
    const px = part.pixelValues ?? new Float32Array(3 * SIDE * SIDE)
    const i64 = (a: number[], dims: number[]): ort.Tensor =>
      new ort.Tensor('int64', BigInt64Array.from(a.map((x) => BigInt(x))), dims)
    const feeds: Record<string, ort.Tensor> = {
      input_ids: i64(ids, [1, ids.length]),
      attention_mask: i64(ids.map(() => 1), [1, ids.length]),
      pixel_values: new ort.Tensor('float32', px, [1, 3, SIDE, SIDE])
    }
    if (session.inputNames.includes('token_type_ids')) {
      feeds.token_type_ids = i64(ids.map(() => 0), [1, ids.length])
    }
    const want = part.ids
      ? session.outputNames.filter((n) => /text/.test(n))
      : session.outputNames.filter((n) => /image|vision/.test(n))
    if (want.length === 0) return session.run(feeds)
    // FetchesType 是 { 输出名: boolean }，不是名字数组
    return session.run(feeds, Object.fromEntries(want.map((n) => [n, true])))
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
    this.repo.upsert(photoId, CLIP_MODEL_ID, v.length, vectorToBlob(v))
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
    /**
     * 本轮已经试过的 id。失败的行**不会写库**，于是下一轮 listMissing 又会把它捞回来
     * ——一张解不了的素材就能让这个循环永远转不完，`running` 也永不复位，
     * 之后所有"建索引"都返回"已有索引任务在跑"。所以试过的一律跳过。
     */
    const tried = new Set<string>()
    try {
      if (!opts?.onlyMissing) this.clearVectors()
      let total = this.repo.countMissing(CLIP_MODEL_ID)
      // 进度先给个 0，让 UI 立刻有分母
      report({ done, total, failed })
      while (!this.cancelRequested) {
        const batch = this.repo
          .listMissing(CLIP_MODEL_ID, 200)
          .filter((row) => !tried.has(row.id))
        if (batch.length === 0) break
        total = done + batch.length + this.repo.countMissing(CLIP_MODEL_ID)
        for (const row of batch) {
          if (this.cancelRequested) break
          tried.add(row.id)
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

  /** 与全库向量比余弦，取前 topK（排除自身）；minScore 用来挡"池子里确实没有" */
  searchByVector(
    vec: Float32Array,
    topK = 24,
    excludeId?: string,
    minScore = IMAGE_MIN_SCORE
  ): Array<{ id: string; score: number }> {
    const rows = this.repo.allByModel(CLIP_MODEL_ID)
    const scored: Array<{ id: string; score: number }> = []
    for (const r of rows) {
      if (r.photo_id === excludeId) continue
      const v = parseVector(r.vec, r.dim)
      if (!v) continue
      const s = cosine(vec, v)
      if (s > minScore) scored.push({ id: r.photo_id, score: s })
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

  /** 文搜图：低于实测阈值的命中一律不返回（宁可空结果，不要假装找到了） */
  async searchText(
    text: string,
    topK = 60,
    minScore = SEMANTIC_MIN_SCORE
  ): Promise<Array<{ id: string; score: number }>> {
    if (!this.isReady()) return []
    const v = await this.embedText(text)
    if (!v) return []
    return this.searchByVector(v, topK, undefined, minScore)
  }
}

/** 生产单例（构造期不碰 electron app / userData，见各懒取注释） */
export const clipEmbeddings = new ClipEmbeddingService()
