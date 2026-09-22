/**
 * 一次性诊断（跑完删）：判断"文搜图不判别"是模型问题还是我的接法问题。
 * 用法：node scripts/ai-probe/diag.mjs jina|cc
 * ① 零样本分类：cats.jpg 在 [猫/狗/汽车/面包] 里必须选猫；
 * ② 图-图 cos 矩阵：如果两两都 >0.95 说明图像向量塌缩（预处理或输出取错）；
 * ③ 文-文 cos 矩阵：同理看文本侧；
 * ④ 直接看输出张量形状/范数。
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import * as ort from 'onnxruntime-node'

const IMG = '/tmp/ai-probe/img'
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]
const SIDE = 224
const which = process.argv[2] ?? 'cc'

const { makeTokenizer, l2n, cos, feeders } = await import('./probe-lib.mjs')
const tok = makeTokenizer(
  which === 'jina' ? '/tmp/jina-text-probe/tokenizer.json' : '/tmp/cc-tokenizer.json'
)

let imgEmbed, txtEmbed, rawShapes
if (which === 'cc') {
  const s = await ort.InferenceSession.create('/tmp/jina-text-probe/cc-model.onnx')
  const zeroPx = new Float32Array(3 * SIDE * SIDE)
  imgEmbed = async (arr) => {
    const out = await s.run(
      {
        input_ids: i64([101, 102], [1, 2]),
        attention_mask: i64([1, 1], [1, 2]),
        pixel_values: new ort.Tensor('float32', arr, [1, 3, SIDE, SIDE])
      },
      ['image_embeds']
    )
    return out.image_embeds
  }
  txtEmbed = async (ids) => {
    const out = await s.run(
      {
        input_ids: i64(ids, [1, ids.length]),
        attention_mask: i64(ids.map(() => 1), [1, ids.length]),
        pixel_values: new ort.Tensor('float32', zeroPx, [1, 3, SIDE, SIDE])
      },
      ['text_embeds']
    )
    return out.text_embeds
  }
} else {
  const vs = await ort.InferenceSession.create('/tmp/jina-probe/vision_fp32.onnx')
  const ts = await ort.InferenceSession.create('/tmp/jina-text-probe/text_model.onnx')
  imgEmbed = async (arr) =>
    (await vs.run({ [vs.inputNames[0]]: new ort.Tensor('float32', arr, [1, 3, SIDE, SIDE]) }))[
      vs.outputNames[0]
    ]
  txtEmbed = async (ids) =>
    (await ts.run({ [ts.inputNames[0]]: i64(ids, [1, ids.length]) }))[ts.outputNames[0]]
}

function i64(arr, dims) {
  return new ort.Tensor('int64', BigInt64Array.from(arr.map((x) => BigInt(x))), dims)
}

async function imageVec(file) {
  const { data } = await sharp(path.join(IMG, file))
    .resize({ width: SIDE, height: SIDE, fit: 'cover', kernel: 'cubic' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const plane = SIDE * SIDE
  const arr = new Float32Array(3 * plane)
  for (let c = 0; c < 3; c++)
    for (let i = 0; i < plane; i++) arr[c * plane + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c]
  const t = await imgEmbed(arr)
  rawShapes ??= { img: `${t.dims}/${t.type}`, }
  return l2n(Array.from(t.data))
}
async function textVec(q) {
  const t = await txtEmbed(tok.encode(q).ids)
  rawShapes ??= {}
  rawShapes.txt = `${t.dims}/${t.type}`
  return l2n(Array.from(t.data))
}

const files = readdirSync(IMG).sort()
console.log(`[${which}] shapes`, (await imageVec(files[0]), rawShapes))

// ① 零样本分类
const CAND = ['a photo of a cat', 'a photo of a dog', 'a photo of a car', 'a photo of bread']
const CANDZH = ['一张猫的照片', '一张狗的照片', '一张汽车的照片', '一张面包的照片']
for (const [label, cands, probe] of [
  ['en', CAND, 'cats.jpg'],
  ['zh', CANDZH, 'cats.jpg'],
  ['en', CAND, 'bread.png'],
  ['zh', CANDZH, 'bread.png']
]) {
  const iv = await imageVec(probe)
  const scored = []
  for (const c of cands) scored.push([c, cos(iv, await textVec(c))])
  scored.sort((a, b) => b[1] - a[1])
  console.log(`  零样本 ${label} ${probe}: ` + scored.map(([c, s]) => `${c}=${s.toFixed(3)}`).join('  '))
}

// ② 图-图 / 文-文 塌缩检查
const subset = ['cats.jpg', 'corgi.jpg', 'bread.png', 'beach.png', 'pikachu.png', 'tiger.jpg']
const iv = []
for (const f of subset) iv.push(await imageVec(f))
let hi = 1e9,
  lo = -1
for (let a = 0; a < iv.length; a++)
  for (let b = a + 1; b < iv.length; b++) {
    const c = cos(iv[a], iv[b])
    hi = Math.min(hi, c)
    lo = Math.max(lo, c)
  }
console.log(`  图-图 cos 区间 [${hi.toFixed(3)}, ${lo.toFixed(3)}]（不同内容应 <0.6）`)
const tv = []
for (const q of ['a photo of a cat', 'a photo of bread', 'beach', 'pikachu']) tv.push(await textVec(q))
let ht = 1e9,
  lt = -1
for (let a = 0; a < tv.length; a++)
  for (let b = a + 1; b < tv.length; b++) {
    const c = cos(tv[a], tv[b])
    ht = Math.min(ht, c)
    lt = Math.max(lt, c)
  }
console.log(`  文-文 cos 区间 [${ht.toFixed(3)}, ${lt.toFixed(3)}]`)
void feeders
