/**
 * 中文 vs 英文查询向量对比（判 CLIP 文本端是否对中文退化）。
 * 与 bench-embedding 同源：直接加载 Xenova/clip-vit-base-patch32 的文本塔。
 */
import { env } from '@huggingface/transformers'
if (process.env.HF_ENDPOINT) env.remoteHost = process.env.HF_ENDPOINT.replace(/\/$/, '')

const MODEL = 'Xenova/clip-vit-base-patch32'
const { AutoTokenizer, CLIPTextModelWithProjection } = await import('@huggingface/transformers')
const tokenizer = await AutoTokenizer.from_pretrained(MODEL)
const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' })

const l2 = (v) => {
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

async function embed(text) {
  const inputs = tokenizer(text, { padding: true, truncation: true })
  const out = await textModel(inputs)
  return l2(Array.from(out.text_embeds.data))
}

const QUERIES = [
  '猫',
  '美食 食物',
  '叶子 植物',
  '城市 建筑',
  'a photo of a cat',
  'a photo of food',
  'a photo of green leaves',
  'a photo of a city'
]

console.log('—— token 化（中文若被拆成 byte-fallback 碎片即坐实英文分词器不认）——')
for (const q of QUERIES.slice(0, 4)) {
  const ids = tokenizer(q).input_ids.tolist()[0]
  console.log(`  ${q}  → ${ids.length} tokens  [${ids.slice(0, 8).join(',')}, …]`)
}

const vecs = {}
for (const q of QUERIES) vecs[q] = await embed(q)

console.log('\n—— 中文查询两两余弦（≈1 表示查询向量塌成同一个）——')
const zh = QUERIES.slice(0, 4)
for (let i = 0; i < zh.length; i++)
  for (let j = i + 1; j < zh.length; j++)
    console.log(`  ${zh[i]} × ${zh[j]} = ${cos(vecs[zh[i]], vecs[zh[j]]).toFixed(4)}`)

console.log('\n—— 中文 vs 对应英文（低则说明中文语义根本没进向量）——')
const PAIRS = [
  ['猫', 'a photo of a cat'],
  ['美食 食物', 'a photo of food'],
  ['叶子 植物', 'a photo of green leaves'],
  ['城市 建筑', 'a photo of a city']
]
for (const [a, b] of PAIRS) console.log(`  ${a} × ${b} = ${cos(vecs[a], vecs[b]).toFixed(4)}`)

console.log('\n—— 英文两两（对照组：正常应有明显区分）——')
const en = QUERIES.slice(4)
for (let i = 0; i < en.length; i++)
  for (let j = i + 1; j < en.length; j++)
    console.log(`  ${en[i]} × ${en[j]} = ${cos(vecs[en[i]], vecs[en[j]]).toFixed(4)}`)
