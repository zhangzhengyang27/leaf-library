/**
 * 中文检索对照：现用 Xenova/clip-vit-base-patch32（英文文本塔）
 *  vs jinaai/jina-clip-v1（多语言文本塔）。
 *
 * 指标：4 个互不相关中文查询向量两两余弦（越低越有区分度）、
 *      中文与其英文对应查询的余弦（越高说明中文真的进了语义空间）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cacheDir = mkdtempSync(join(tmpdir(), 'leaf-clip-cmp-'))
const { env, AutoTokenizer, CLIPTextModelWithProjection } = await import('@huggingface/transformers')
env.cacheDir = `${cacheDir}/`
env.remoteHost = 'https://hf-mirror.com/'

const l2 = (v) => {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

const ZH = ['猫', '美食 食物', '叶子 植物', '城市 建筑']
const EN = ['a photo of a cat', 'a photo of food', 'a photo of green leaves', 'a photo of a city']

for (const model of ['Xenova/clip-vit-base-patch32', 'jinaai/jina-clip-v1']) {
  console.log(`\n===== ${model} =====`)
  try {
    const t0 = Date.now()
    const tokenizer = await AutoTokenizer.from_pretrained(model)
    const textModel = await CLIPTextModelWithProjection.from_pretrained(model, { dtype: 'q8' })
    console.log(`加载 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    const ids = tokenizer(ZH[0]).input_ids.tolist()[0]
    console.log(`tokenize「${ZH[0]}」→ ${ids.length} tokens`)

    const embed = async (t) => {
      const out = await textModel(tokenizer(t, { padding: true, truncation: true }))
      return l2(Array.from(out.text_embeds.data))
    }
    const zv = []
    for (const q of ZH) zv.push(await embed(q))
    const ev = []
    for (const q of EN) ev.push(await embed(q))

    let sum = 0
    let n = 0
    for (let i = 0; i < zv.length; i++)
      for (let j = i + 1; j < zv.length; j++) {
        const c = cos(zv[i], zv[j])
        sum += c
        n += 1
        console.log(`  中文对 ${ZH[i]} × ${ZH[j]} = ${c.toFixed(4)}`)
      }
    console.log(`  → 互不相关中文查询平均余弦 ${(sum / n).toFixed(4)}（越低区分度越高）`)
    let p = 0
    for (let i = 0; i < 4; i++) {
      const c = cos(zv[i], ev[i])
      p += c
      console.log(`  中英同义 ${ZH[i]} × ${EN[i]} = ${c.toFixed(4)}`)
    }
    console.log(`  → 平均 ${(p / 4).toFixed(4)}（越高说明中文进了语义空间）`)
  } catch (err) {
    console.log('  失败：', err.message.split('\n')[0])
  }
}

rmSync(cacheDir, { recursive: true, force: true })
