#!/usr/bin/env node
/**
 * CLIP 向量化 + 语义检索基准（阶段 5.3，D-015 前置验证第 2 步）。
 *
 * 用 transformers.js 加载真实 CLIP，对 sharp 生成的随机图批量向量化计时，
 * 再跑一次文本→图像检索，输出每张耗时与检索延迟，供评估"全库打标/建索引"可行性。
 * 不依赖 Electron/数据库，纯 Node 可跑。
 *
 * 用法：node scripts/bench-embedding.mjs [张数]   （默认 100，千张用 1000）
 */
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const N = Math.min(Number(process.argv[2]) || 100, 2000)
const MODEL = 'Xenova/clip-vit-base-patch32'

function log(...args) {
  console.log(...args)
}

// 生成 N 张随机彩色图（尺寸 256×256，互不相同但内容随机）
async function genImages(dir, n) {
  const paths = []
  for (let i = 0; i < n; i++) {
    const p = join(dir, `img_${i}.png`)
    await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: {
          r: Math.floor(Math.random() * 255),
          g: Math.floor(Math.random() * 255),
          b: Math.floor(Math.random() * 255)
        }
      }
    })
      .png()
      .toFile(p)
    paths.push(p)
  }
  return paths
}

log(`CLIP 基准：${MODEL} · ${N} 张随机图（临时目录生成，跑完清理）`)

// 国内镜像端点（HF 直连被墙时使用）：HF_ENDPOINT=https://hf-mirror.com node scripts/bench-embedding.mjs
const { env } = await import('@huggingface/transformers')
if (process.env.HF_ENDPOINT) env.remoteHost = process.env.HF_ENDPOINT.replace(/\/$/, '')

log('—— 首次加载模型（含下载缓存，q8 量化） ——')
const t0 = Date.now()
const { AutoProcessor, CLIPVisionModelWithProjection, AutoTokenizer, CLIPTextModelWithProjection } =
  await import('@huggingface/transformers')
const [processor, vision, tokenizer, textModel] = await Promise.all([
  AutoProcessor.from_pretrained(MODEL),
  CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' }),
  AutoTokenizer.from_pretrained(MODEL),
  CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' })
])
log(`模型加载完成：${((Date.now() - t0) / 1000).toFixed(1)}s`)

const dir = mkdtempSync(join(tmpdir(), 'leaf-bench-'))
const vecs = []
try {
  log('—— 生成随机测试图 ——')
  const paths = await genImages(dir, N)
  if (paths.length !== N) throw new Error('图片生成不完整')

  log('—— 批量向量化 ——')
  const t1 = Date.now()
  const { readFile } = await import('node:fs/promises')
  const { RawImage } = await import('@huggingface/transformers')
  for (let i = 0; i < N; i++) {
    // node 端 RawImage.read/fromURL 的 getFile 不处理本地路径（404），须走 fromBlob
    const raw = await RawImage.fromBlob(new Blob([await readFile(join(dir, `img_${i}.png`))]))
    const inputs = await processor(raw)
    const out = await vision(inputs)
    vecs.push(Array.from(out.image_embeds.data))
  }
  const embedMs = Date.now() - t1
  log(`向量化 ${N} 张：${embedMs}ms，单张均值 ${(embedMs / N).toFixed(1)}ms`)
  log(`预估：全库 50000 张 ≈ ${(((embedMs / N) * 50000) / 1000).toFixed(0)}s（串行单核）`)

  log('—— 文本检索（1 次查询 × 全量余弦相似度） ——')
  const t2 = Date.now()
  const inputs = tokenizer('a photo of mountains landscape', { padding: true, truncation: true })
  const qOut = await textModel(inputs)
  // CLIP 输出未保证单位向量，点积前必须 L2 归一化（余弦相似度），否则阈值统计无意义；
  // 库向量归一化视为建索引步骤、查询向量随检索归一化，开销可忽略
  const l2normalize = (v) => {
    let norm = 0
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
    norm = Math.sqrt(norm) || 1
    for (let i = 0; i < v.length; i++) v[i] /= norm
    return v
  }
  for (const v of vecs) l2normalize(v)
  const qv = l2normalize(Array.from(qOut.text_embeds.data))
  let hits = 0
  for (const v of vecs) {
    let dot = 0
    for (let i = 0; i < qv.length; i++) dot += qv[i] * v[i]
    if (dot > 0.2) hits += 1
  }
  log(`检索 ${N} 条向量：${Date.now() - t2}ms（纯 JS 余弦相似度，命中阈值 0.2 共 ${hits} 条）`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

log('完成。评估标准参考：单张 <300ms 且检索 <50ms → 全库打标/建索引排期可行。')
