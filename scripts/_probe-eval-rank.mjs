/**
 * 端到端中文图搜评测：现用 Xenova/clip-vit-base-patch32 vs jinaai/jina-clip-v1。
 * 输入是刚从应用里导出的 23 张 256 缩略图（/tmp/leaf-eval），
 * 人工标注见 NATURE（植物/花卉/森林）与 UI（应用截图，多为近空白）。
 *
 * 指标：中文查询下「已知自然照片」的平均排名（越小越好）+ top5 明细。
 */
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { env, RawImage } = await import('@huggingface/transformers')
env.remoteHost = 'https://hf-mirror.com/'
env.cacheDir = '/tmp/leaf-eval-hf/'

const DIR = '/tmp/leaf-eval'
const NATURE = new Set([1, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20])
const files = readdirSync(DIR)
  .filter((f) => /^\d+\.png$/.test(f))
  .sort()
  .map((f) => ({ idx: Number(f.split('.')[0]), path: join(DIR, f) }))

const QUERIES = ['叶子 植物', '花', '森林 树', '软件界面 截图']

const l2 = (v) => {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

for (const model of ['Xenova/clip-vit-base-patch32', 'jinaai/jina-clip-v1']) {
  console.log(`\n===== ${model} =====`)
  const {
    AutoProcessor,
    ImageProcessor,
    CLIPVisionModelWithProjection,
    AutoTokenizer,
    CLIPTextModelWithProjection
  } = await import('@huggingface/transformers')
  try {
    // Xenova 走 AutoProcessor（应用同款）；jina-clip 的 AutoProcessor 不产出 pixel_values，
    // 只能用 ImageProcessor——换模型不是改一行 modelId 就完事，这里就是成本
    const Processor = model.startsWith('jinaai') ? ImageProcessor : AutoProcessor
    const [processor, vision, tokenizer, text] = await Promise.all([
      Processor.from_pretrained(model),
      CLIPVisionModelWithProjection.from_pretrained(model, { dtype: 'q8' }),
      AutoTokenizer.from_pretrained(model),
      CLIPTextModelWithProjection.from_pretrained(model, { dtype: 'q8' })
    ])

    const vecs = []
    for (const f of files) {
      const raw = await RawImage.read(f.path)
      const out = await vision(await processor(raw))
      vecs.push({ idx: f.idx, v: l2(Array.from(out.image_embeds.data)) })
    }

    for (const q of QUERIES) {
      const qv = l2(
        Array.from((await text(tokenizer(q, { padding: true, truncation: true }))).text_embeds.data)
      )
      const scored = vecs.map((e) => ({ idx: e.idx, s: cos(qv, e.v) })).sort((a, b) => b.s - a.s)
      const natureRanks = scored
        .map((e, i) => (NATURE.has(e.idx) ? i + 1 : null))
        .filter((x) => x !== null)
      const meanRank = natureRanks.reduce((a, b) => a + b, 0) / natureRanks.length
      const top = scored
        .slice(0, 5)
        .map((e) => `#${e.idx}${NATURE.has(e.idx) ? '·自然' : '·UI'}(${e.s.toFixed(3)})`)
        .join(' ')
      console.log(`  「${q}」 自然照片平均排名 ${meanRank.toFixed(1)}/23   top5: ${top}`)
    }
  } catch (err) {
    console.log('  失败：', err.message.split('\n')[0])
  }
}
