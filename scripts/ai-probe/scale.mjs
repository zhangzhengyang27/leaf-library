/**
 * 一次性：阈值随池子变大的漂移实测（跑完删）
 * 池 A = 48 张已知内容图（上轮量的基线）
 * 池 B = 185 张 Oxford-IIIT Pets（肉眼验过全是猫狗，是最狠的同类干扰）
 * 池 C = A ∪ B = 233
 * 量三件事：① 18 条查询的目标名次会不会被干扰集挤掉；
 *          ② 命中分数下界 vs "池里确实没有"的分数上界，0.40 还分不分得开；
 *          ③ 无匹配最高分随池子规模的增长。
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import * as ort from 'onnxruntime-node'
import { cos, l2n, makeTokenizer } from './probe-lib.mjs'

const SIDE = 224
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]
const A = '/tmp/ai-probe/img2'
const B = '/tmp/pets/pool'
const THR = 0.4

const s = await ort.InferenceSession.create('/tmp/jina-text-probe/model.onnx')
const tok = makeTokenizer('/tmp/cc-tokenizer.json')
const i64 = (a, d) => new ort.Tensor('int64', BigInt64Array.from(a.map((x) => BigInt(x))), d)
const zero = new Float32Array(3 * SIDE * SIDE)

async function txt(q) {
  const ids = tok.encode(q).ids
  const o = await s.run(
    {
      input_ids: i64(ids, [1, ids.length]),
      attention_mask: i64(ids.map(() => 1), [1, ids.length]),
      pixel_values: new ort.Tensor('float32', zero, [1, 3, SIDE, SIDE])
    },
    ['text_embeds']
  )
  return l2n(Array.from(o.text_embeds.data))
}
async function img(file) {
  const { data } = await sharp(file)
    .resize({ width: SIDE, height: SIDE, fit: 'cover', kernel: 'cubic' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pl = SIDE * SIDE
  const a = new Float32Array(3 * pl)
  for (let c = 0; c < 3; c++)
    for (let i = 0; i < pl; i++) a[c * pl + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c]
  const o = await s.run(
    {
      input_ids: i64([101, 102], [1, 2]),
      attention_mask: i64([1, 1], [1, 2]),
      pixel_values: new ort.Tensor('float32', a, [1, 3, SIDE, SIDE])
    },
    ['image_embeds']
  )
  return l2n(Array.from(o.image_embeds.data))
}

const PAIRS = [
  ['一只打呼噜的虎斑猫', 'cats.jpg'],
  ['草地上奔跑的柯基犬', 'corgi.jpg'],
  ['老虎的近景肖像', 'tiger.jpg'],
  ['草原上的长颈鹿和斑马', 'savanna.jpg'],
  ['帝王蝶翅膀的微距特写', 'butterfly.jpg'],
  ['雪山倒映在湖水里', 'moraine-lake.png'],
  ['自由女神像与城市天际线', 'new-york.jpg'],
  ['沙滩上的条纹毛巾和草帽', 'beach.png'],
  ['面包房木架上的长条面包', 'bread.png'],
  ['停机坪上的客机与摆渡车', 'airport.jpg'],
  ['一辆复古的青绿色小汽车', 'beetle.png'],
  ['红墙前停着的白色皮卡', 'sam-car.png'],
  ['黑色卷发女性的侧脸肖像', 'woman-with-afro.jpg'],
  ['穿牛仔夹克走在街上的男人', 'ryan-gosling.jpg'],
  ['绿茵场上拼抢的足球运动员', 'football-match.jpg'],
  ['白纸上黑色的手写字迹', 'handwriting.jpg'],
  ['黄色的宝可梦卡通形象', 'pikachu.png'],
  ['带砖砌烟囱的老石头房子', 'house.jpg']
]
const NOMATCH = [
  '一架黑色三角钢琴',
  '一盘寿司拼盘',
  '一群热气球飘在天空',
  '水下珊瑚礁与热带鱼',
  '地铁车厢内部',
  '外科医生在手术室里',
  '老式蒸汽火车头',
  '游乐园里的摩天轮'
]

const filesA = readdirSync(A).sort().map((f) => path.join(A, f))
const filesB = readdirSync(B).sort().map((f) => path.join(B, f))
const nameOf = Object.fromEntries(filesA.map((p) => [p, path.basename(p)]))

async function embedAll(files) {
  const out = []
  for (const f of files) out.push(await img(f))
  return out
}
const vA = await embedAll(filesA)
const vB = await embedAll(filesB)
console.log(`池 A=${vA.length}  B=${vB.length}  C=${vA.length + vB.length}`)

for (const [label, pool] of [['A(48)', vA], ['C(233)', vA.concat(vB)]]) {
  let top1 = 0,
    top3 = 0
  const hitScores = []
  const squeezed = []
  for (const [q, target] of PAIRS) {
    const v = await txt(q)
    const scored = pool.map((x, i) => ({ i, s: cos(v, x) })).sort((a2, b2) => b2.s - a2.s)
    const ti = filesA.findIndex((p) => path.basename(p) === target)
    const rank = scored.findIndex((x) => x.i === ti)
    const hit = pool[ti]
    const sc = cos(v, hit)
    hitScores.push(sc)
    if (rank === 0) top1++
    if (rank < 3) top3++
    if (rank > 0) squeezed.push(`      ${q} → 目标 ${target} 掉到第 ${rank + 1}，首位得分 ${scored[0].s.toFixed(3)}`)
  }
  const miss = []
  for (const q of NOMATCH) {
    const v = await txt(q)
    miss.push(Math.max(...pool.map((x) => cos(v, x))))
  }
  const sorted = [...hitScores].sort((a2, b2) => a2 - b2)
  const ms = [...miss].sort((a2, b2) => a2 - b2)
  console.log(
    `  [${label}] 目标 top1=${top1}/18 top3=${top3}｜命中分数 min=${sorted[0].toFixed(3)} 中位=${sorted[9].toFixed(3)}` +
      `｜无匹配 max=${ms[ms.length - 1].toFixed(3)} 中位=${ms[4].toFixed(3)}` +
      `｜0.40 阈值下：误放 ${(miss.filter((x) => x >= THR).length / miss.length) * 100}% 漏放 ${(hitScores.filter((x) => x < THR).length / hitScores.length) * 100}%`
  )
  if (squeezed.length) console.log(squeezed.join('\n'))
}
