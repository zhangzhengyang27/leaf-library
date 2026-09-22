#!/usr/bin/env node
/**
 * CLIP 中文能力探针（AI 语义搜索调优用）。
 *
 * 判据：互不相关中文查询的文本向量两两余弦——英文 CLIP 的分词器没有 CJK，
 * 中文被 byte-fallback 拆碎后这些向量会塌成一团（实测 Xenova/clip-vit-base-patch32
 * 平均 0.925，多语言塔 0.708，英文查询对照 0.76–0.87）。
 * 换模型候选时先跑这个，再谈端到端图搜评测。
 *
 * 用法：node scripts/probe-clip-zh.mjs [modelId ...]
 *      默认对比 Xenova/clip-vit-base-patch32 与 jinaai/jina-clip-v1。
 * 国内网络直连 huggingface.co 不通时加 HF_ENDPOINT=https://hf-mirror.com。
 */

const MODELS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['Xenova/clip-vit-base-patch32', 'jinaai/jina-clip-v1']

const ZH = ['猫', '美食 食物', '叶子 植物', '城市 建筑']
const EN = ['a photo of a cat', 'a photo of food', 'a photo of green leaves', 'a photo of a city']

const cacheDir = process.env.CLIP_CACHE_DIR
const { env } = await import('@huggingface/transformers')
// 默认用库自身的缓存（本机通常已下好，可离线跑）；要隔离时传 CLIP_CACHE_DIR=临时目录
if (cacheDir) env.cacheDir = cacheDir.endsWith('/') ? cacheDir : `${cacheDir}/`
if (process.env.HF_ENDPOINT) env.remoteHost = process.env.HF_ENDPOINT.replace(/\/$/, '') + '/'

const l2 = (v) => {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

try {
  for (const model of MODELS) {
    console.log(`\n===== ${model} =====`)
    try {
      const { AutoTokenizer, CLIPTextModelWithProjection } = await import('@huggingface/transformers')
      const [tokenizer, textModel] = await Promise.all([
        AutoTokenizer.from_pretrained(model),
        CLIPTextModelWithProjection.from_pretrained(model, { dtype: 'q8' })
      ])
      const embed = async (t) =>
        l2(
          Array.from(
            (await textModel(tokenizer(t, { padding: true, truncation: true }))).text_embeds.data
          )
        )

      console.log(`tokenize「${ZH[0]}」→ ${tokenizer(ZH[0]).input_ids.tolist()[0].length} tokens`)
      const zv = []
      for (const q of ZH) zv.push(await embed(q))
      const ev = []
      for (const q of EN) ev.push(await embed(q))

      let sum = 0
      let n = 0
      for (let i = 0; i < zv.length; i++)
        for (let j = i + 1; j < zv.length; j++) {
          sum += cos(zv[i], zv[j])
          n += 1
        }
      let pair = 0
      for (let i = 0; i < ZH.length; i++) pair += cos(zv[i], ev[i])
      let en = 0
      let enN = 0
      for (let i = 0; i < ev.length; i++)
        for (let j = i + 1; j < ev.length; j++) {
          en += cos(ev[i], ev[j])
          enN += 1
        }
      console.log(`  互不相关中文查询平均余弦 ${(sum / n).toFixed(4)}  ← 越低越有区分度`)
      console.log(`  英文查询同口径         ${(en / enN).toFixed(4)}  ← 参照系`)
      console.log(`  中文×同义英文 平均      ${(pair / ZH.length).toFixed(4)}  ← 跨语对齐`)
    } catch (err) {
      console.log('  失败：', err.message.split('\n')[0])
    }
  }
} finally {
  rmSync(cacheDir, { recursive: true, force: true })
}
