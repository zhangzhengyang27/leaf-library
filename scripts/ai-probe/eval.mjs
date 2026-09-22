/**
 * 一次性评测（跑完删）：48 张真图池上量三件事
 * ① 文搜图 top-1/top-5（中/英各 18 条）；
 * ② 无匹配查询的分数分布 —— 决定线上阈值能不能说"没找到"；
 * ③ 近似重复判别 cos(原图,变体) vs cos(原图,别的图) —— 决定它能不能兼做视觉找相似。
 * 用法：node scripts/ai-probe/eval.mjs jina|cc
 */
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import * as ort from 'onnxruntime-node'
import { cos, l2n, makeTokenizer } from './probe-lib.mjs'

const IMG = '/tmp/ai-probe/img2'
const DUP = '/tmp/ai-probe/dup'
const SIDE = 224
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]
const which = process.argv[2] ?? 'cc'

const tok = makeTokenizer(
  which === 'jina' ? '/tmp/jina-text-probe/tokenizer.json' : '/tmp/cc-tokenizer.json'
)

const PAIRS = [
  ['一只打呼噜的虎斑猫', 'a tabby cat sleeping', 'cats.jpg'],
  ['草地上奔跑的柯基犬', 'a corgi running on grass', 'corgi.jpg'],
  ['老虎的近景肖像', 'close-up portrait of a tiger', 'tiger.jpg'],
  ['草原上的长颈鹿和斑马', 'giraffes and zebras on the savanna', 'savanna.jpg'],
  ['帝王蝶翅膀的微距特写', 'macro shot of a monarch butterfly wing', 'butterfly.jpg'],
  ['雪山倒映在湖水里', 'snow mountains reflected in a lake', 'moraine-lake.png'],
  ['自由女神像与城市天际线', 'statue of liberty and a city skyline', 'new-york.jpg'],
  ['沙滩上的条纹毛巾和草帽', 'a striped towel and a straw hat on the beach', 'beach.png'],
  ['面包房木架上的长条面包', 'loaves of bread on bakery shelves', 'bread.png'],
  ['停机坪上的客机与摆渡车', 'airliners and shuttle buses on the apron', 'airport.jpg'],
  ['一辆复古的青绿色小汽车', 'a vintage teal compact car', 'beetle.png'],
  ['红墙前停着的白色皮卡', 'a white pickup truck in front of a red wall', 'sam-car.png'],
  ['黑色卷发女性的侧脸肖像', 'profile portrait of a woman with afro hair', 'woman-with-afro.jpg'],
  ['穿牛仔夹克走在街上的男人', 'a man in a denim jacket walking on the street', 'ryan-gosling.jpg'],
  ['绿茵场上拼抢的足球运动员', 'football players contesting on the pitch', 'football-match.jpg'],
  ['白纸上黑色的手写字迹', 'black handwritten cursive ink on white paper', 'handwriting.jpg'],
  ['黄色的宝可梦卡通形象', 'a yellow cartoon pokemon character', 'pikachu.png'],
  ['带砖砌烟囱的老石头房子', 'an old stone house with a brick chimney', 'house.jpg']
]
/** 池子里确实没有的东西：线上要能靠分数把"没找到"判出来 */
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

async function main() {
  const files = readdirSync(IMG).sort()
  let s, imgKey, txtKey
  const mk = (name, data, dims) => new ort.Tensor(name === 'int64' ? 'int64' : 'float32', data, dims)
  if (which === 'cc') {
    s = await ort.InferenceSession.create('/tmp/jina-text-probe/cc-model.onnx')
    imgKey = 'image_embeds'
    txtKey = 'text_embeds'
  } else {
    s = await ort.InferenceSession.create('/tmp/jina-probe/vision_fp32.onnx')
    imgKey = s.outputNames[0]
  }
  const ts = which === 'jina' ? await ort.InferenceSession.create('/tmp/jina-text-probe/text_model.onnx') : null

  const i64 = (a, d) => new ort.Tensor('int64', BigInt64Array.from(a.map((x) => BigInt(x))), d)
  const zeroPx = new Float32Array(3 * SIDE * SIDE)
  async function imageVec(file) {
    const { data, info } = await sharp(file.startsWith('/') ? file : path.join(IMG, file))
      .resize({ width: SIDE, height: SIDE, fit: 'cover', kernel: 'cubic' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (data.length !== SIDE * SIDE * 3) throw new Error(`${file}: ${info.channels} 通道`)
    const plane = SIDE * SIDE
    const arr = new Float32Array(3 * plane)
    for (let c = 0; c < 3; c++)
      for (let i = 0; i < plane; i++) arr[c * plane + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c]
    if (which === 'jina') {
      const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', arr, [1, 3, SIDE, SIDE]) })
      return l2n(Array.from(out[imgKey].data))
    }
    const out = await s.run(
      {
        input_ids: i64([101, 102], [1, 2]),
        attention_mask: i64([1, 1], [1, 2]),
        pixel_values: new ort.Tensor('float32', arr, [1, 3, SIDE, SIDE])
      },
      [imgKey]
    )
    return l2n(Array.from(out[imgKey].data))
  }
  async function textVec(q) {
    const ids = tok.encode(q).ids
    if (which === 'jina') {
      const out = await ts.run({ [ts.inputNames[0]]: i64(ids, [1, ids.length]) })
      return l2n(Array.from(out[ts.outputNames[0]].data))
    }
    const out = await s.run(
      {
        input_ids: i64(ids, [1, ids.length]),
        attention_mask: i64(ids.map(() => 1), [1, ids.length]),
        pixel_values: new ort.Tensor('float32', zeroPx, [1, 3, SIDE, SIDE])
      },
      [txtKey]
    )
    return l2n(Array.from(out[txtKey].data))
  }
  void mk

  const t0 = Date.now()
  const iv = []
  for (const f of files) iv.push(await imageVec(f))
  const idx = Object.fromEntries(files.map((f, i) => [f, i]))
  console.log(`[${which}] 池 ${files.length} 张，${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // ① 检索
  for (const [lang, pick] of [['zh', 0], ['en', 1]]) {
    let top1 = 0,
      top5 = 0,
      rankSum = 0
    const bad = []
    for (const p of PAIRS) {
      const v = await textVec(p[pick])
      const scored = iv.map((x, i) => ({ i, s: cos(v, x) })).sort((a, b) => b.s - a.s)
      const r = scored.findIndex((x) => x.i === idx[p[2]])
      top1 += r === 0 ? 1 : 0
      top5 += r < 5 ? 1 : 0
      rankSum += r + 1
      if (r > 0) bad.push(`      ${p[pick]} → 目标 ${p[2]} 名次 ${r + 1}，首位 ${files[scored[0].i]}`)
    }
    console.log(`  [${lang}] top1=${top1}/${PAIRS.length} top5=${top5} 平均名次=${(rankSum / PAIRS.length).toFixed(2)}`)
    if (bad.length) console.log(bad.join('\n'))
  }

  // ② 无匹配分布
  const hitDist = [],
    missDist = []
  for (const p of PAIRS) {
    const v = await textVec(p[0])
    hitDist.push(Math.max(...iv.map((x) => cos(v, x))))
  }
  for (const q of NOMATCH) {
    const v = await textVec(q)
    missDist.push(Math.max(...iv.map((x) => cos(v, x))))
  }
  const st = (a) => {
    const s2 = [...a].sort((x, y) => x - y)
    return `min=${s2[0].toFixed(3)} p25=${s2[Math.floor(s2.length / 4)].toFixed(3)} 中位=${s2[Math.floor(s2.length / 2)].toFixed(3)} max=${s2[s2.length - 1].toFixed(3)}`
  }
  console.log(`  [命中] top1 分数 ${st(hitDist)}`)
  console.log(`  [无匹配] 最高分 ${st(missDist)}`)
  const gap = hitDist.map((h, i) => ({ t: PAIRS[i][0], h, m: Math.max(...missDist) }))
  void gap

  // ③ 近似重复判别
  if (!existsSync(DUP)) mkdirSync(DUP)
  const src = ['cats.jpg', 'moraine-lake.png', 'pikachu.png', 'bread.png', 'corgi.jpg']
  let near = [],
    far = []
  for (const f of src) {
    const v = path.join(DUP, f)
    await sharp(path.join(IMG, f))
      .resize({ width: 640, height: 640, fit: 'cover' })
      .jpeg({ quality: 72 })
      .toFile(v)
    const a = await imageVec(f)
    const b = await imageVec(v)
    near.push(cos(a, b))
    far.push(Math.max(...files.filter((x) => x !== f).map((x) => cos(a, iv[idx[x]]))))
  }
  console.log(
    `  [近似重复] cos(原图,变体)=${(near.reduce((s, x) => s + x) / near.length).toFixed(3)} vs cos(原图,全池最像的别的图)=${(far.reduce((s, x) => s + x) / far.length).toFixed(3)}`
  )
}
main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})
