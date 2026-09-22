/**
 * 一次性探针（跑完删）：实测「文本塔能不能中文搜图」。
 * 用法：node scripts/ai-probe/probe.mjs jina|cc
 * 判据：22 张真图池，18 条中英对照查询，看 top-1 / top-3 / 平均名次，
 *      以及 cos(命中图) 与 cos(池均值) 的间隔——间隔为 0 说明模型根本没读进语义。
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import * as ort from 'onnxruntime-node'

const IMG = '/tmp/ai-probe/img'
const JINA = {
  vision: '/tmp/jina-probe/vision_fp32.onnx',
  text: '/tmp/jina-text-probe/text_model.onnx',
  tokenizer: '/tmp/jina-text-probe/tokenizer.json',
  fused: false
}
const CC = {
  fused: '/tmp/jina-text-probe/cc-model.onnx',
  tokenizer: '/tmp/cc-tokenizer.json'
}
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]
const SIDE = 224

/** 人工看联系表后标的目标下标（文件名会骗人：beetle.png 是甲壳虫汽车） */
const PAIRS = [
  ['一只打呼噜的虎斑猫', 'a sleeping tabby cat', 6],
  ['草地上奔跑的柯基犬', 'a corgi running on grass', 8],
  ['老虎的近景肖像', 'a close-up portrait of a tiger', 19],
  ['草原上的长颈鹿和斑马', 'giraffes and zebras on the savanna', 18],
  ['帝王蝶翅膀的微距特写', 'macro shot of a monarch butterfly wing', 5],
  ['雪山倒映在湖水里', 'snow mountains reflected in a lake', 12],
  ['自由女神像与城市天际线', 'statue of liberty and a city skyline', 13],
  ['沙滩上的条纹毛巾和草帽', 'a striped towel and a straw hat on the beach', 2],
  ['面包房木架上的长条面包', 'loaves of bread on bakery shelves', 4],
  ['停机坪上的客机与摆渡车', 'airliners and shuttle buses on the apron', 0],
  ['一辆复古的青绿色小汽车', 'a vintage teal compact car', 3],
  ['红墙前停着的白色皮卡', 'a white pickup truck in front of a red wall', 17],
  ['黑色卷发女性的侧脸肖像', 'profile portrait of a woman with afro hair', 20],
  ['穿牛仔夹克走在街上的男人', 'a man in a denim jacket walking on the street', 16],
  ['绿茵场上拼抢的足球运动员', 'football players contesting on the pitch', 9],
  ['白纸上黑色的手写字迹', 'black handwritten cursive ink on white paper', 10],
  ['黄色的宝可梦卡通形象', 'a yellow cartoon pokemon character', 14],
  ['带砖砌烟囱的老石头房子', 'an old stone house with a brick chimney', 11]
]

const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
const isCJK = (cp) =>
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x3000 && cp <= 0x303f) ||
  (cp >= 0xff00 && cp <= 0xffef)

function makeTokenizer(file) {
  const t = JSON.parse(readFileSync(file, 'utf8'))
  const vocab = t.model.vocab
  const unkToken = t.model.unk_token ?? '[UNK]'
  const unkId = vocab[unkToken]
  function basic(raw) {
    let s = raw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    const out = []
    for (const ch of s) {
      const cp = ch.codePointAt(0)
      if (cp === 0 || (cp > 0 && cp < 0x20) || cp === 0x200b) continue
      if (isCJK(cp) || PUNCT.includes(ch)) out.push(' ', ch, ' ')
      else out.push(ch)
    }
    return out.join('').split(/\s+/).filter(Boolean)
  }
  function wordpiece(word) {
    if (word.length > 100) return [unkToken]
    const pieces = []
    let i = 0
    while (i < word.length) {
      let j = word.length - i
      let best = null
      while (j > 0) {
        const sub = word.slice(i, i + j)
        const cand = i === 0 ? sub : `##${sub}`
        if (cand in vocab) {
          best = cand
          break
        }
        j--
      }
      if (best === null) return [unkToken]
      pieces.push(i === 0 ? best : best.slice(2))
      i += j
    }
    return pieces
  }
  return {
    vocabSize: Object.keys(vocab).length,
    unkId,
    encode(text, maxLen = 77) {
      const ids = []
      const toks = []
      for (const w of basic(text)) {
        for (const p of wordpiece(w)) {
          ids.push(vocab[p] ?? unkId)
          toks.push(p)
        }
      }
      const trimmed = ids.slice(0, maxLen - 2)
      return {
        ids: [vocab['[CLS]'], ...trimmed, vocab['[SEP]']],
        tokens: ['[CLS]', ...trimmed, '[SEP]'].map(
          (x, k) => (k === 0 || k === trimmed.length + 1 ? x : toks[k - 1] ?? '?')
        ),
        unkRate: trimmed.length ? trimmed.filter((v) => v === unkId).length / trimmed.length : 0
      }
    }
  }
}

async function embedImages(sessions, files) {
  const vecs = []
  for (const f of files) {
    const { data, info } = await sharp(path.join(IMG, f))
      .ensureAlpha()
      .removeAlpha()
      .resize({ width: SIDE, height: SIDE, fit: 'cover', kernel: 'cubic' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const plane = SIDE * SIDE
    const arr = new Float32Array(3 * plane)
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < plane; i++) arr[c * plane + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c]
    }
    void info
    vecs.push(await sessions.image(arr))
  }
  return vecs
}

function l2n(v) {
  let s = 0
  for (const x of v) s += x * x
  s = Math.sqrt(s) || 1
  return v.map((x) => x / s)
}
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

async function main() {
  const which = process.argv[2] ?? 'jina'
  const cfg = which === 'jina' ? JINA : CC
  const files = readdirSync(IMG).sort()
  const tok = makeTokenizer(cfg.tokenizer)
  console.log(`[${which}] tokenizer=${tok.vocabSize} tokens`)

  const sessions = {}
  if (cfg.fused) {
    const s = await ort.InferenceSession.create(cfg.fused)
    console.log('  fused inputs :', s.inputNames.join(','), '| outputs:', s.outputNames.join(','))
    // 融合图要求一次喂齐三个输入（ORT 不按请求的输出裁剪 initializers），
    // 所以取 image_embeds 时也要塞一条哑文本，反之亦然。
    const dummyIds = [101, 102]
    const feed = (ids, px) => {
      const f = {
        input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map((x) => BigInt(x))), [
          1,
          ids.length
        ]),
        attention_mask: new ort.Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [
          1,
          ids.length
        ]),
        pixel_values: new ort.Tensor('float32', px, [1, 3, SIDE, SIDE])
      }
      if (s.inputNames.includes('token_type_ids'))
        f.token_type_ids = new ort.Tensor('int64', BigInt64Array.from(ids.map(() => 0n)), [
          1,
          ids.length
        ])
      return f
    }
    const zeroPx = new Float32Array(3 * SIDE * SIDE)
    sessions.image = async (arr) => {
      const out = await s.run(feed(dummyIds, arr), ['image_embeds'])
      return l2n(Array.from(out.image_embeds.data))
    }
    sessions.text = async (ids) => {
      const out = await s.run(feed(ids, zeroPx), ['text_embeds'])
      return l2n(Array.from(out.text_embeds.data))
    }
  } else {
    const vs = await ort.InferenceSession.create(cfg.vision)
    const ts = await ort.InferenceSession.create(cfg.text)
    console.log('  vision inputs:', vs.inputNames.join(','), '| outputs:', vs.outputNames.join(','))
    console.log('  text   inputs:', ts.inputNames.join(','), '| outputs:', ts.outputNames.join(','))
    sessions.image = async (arr) => {
      const out = await vs.run({
        [vs.inputNames[0]]: new ort.Tensor('float32', arr, [1, 3, SIDE, SIDE])
      })
      return l2n(Array.from(out[vs.outputNames[0]].data))
    }
    sessions.text = async (ids) => {
      const out = await ts.run({
        [ts.inputNames[0]]: new ort.Tensor(
          'int64',
          BigInt64Array.from(ids.map((x) => BigInt(x))),
          [1, ids.length]
        )
      })
      return l2n(Array.from(out[ts.outputNames[0]].data))
    }
  }

  const t0 = Date.now()
  const imgVecs = await embedImages(sessions, files)
  console.log(`  ${imgVecs.length} images embedded in ${((Date.now() - t0) / 1000).toFixed(1)}s, dim=${imgVecs[0].length}`)

  for (const [lang, pick] of [
    ['zh', 0],
    ['en', 1]
  ]) {
    let top1 = 0,
      top3 = 0,
      rankSum = 0,
      hitCos = 0,
      missCos = 0,
      unkSum = 0
    const lines = []
    for (const pair of PAIRS) {
      const q = pair[pick]
      const target = pair[2]
      const enc = tok.encode(q)
      unkSum += enc.unkRate
      const v = await sessions.text(enc.ids)
      const scored = imgVecs
        .map((iv, i) => ({ i, s: cos(v, iv), f: files[i] }))
        .sort((a, b) => b.s - a.s)
      const rank = scored.findIndex((x) => x.i === target)
      if (rank === 0) top1++
      if (rank < 3) top3++
      rankSum += rank + 1
      hitCos += scored.find((x) => x.i === target).s
      missCos += (scored.reduce((s, x) => s + x.s, 0) - scored.find((x) => x.i === target).s) / (scored.length - 1)
      lines.push(
        `    ${rank === 0 ? 'OK ' : rank < 3 ? 't3 ' : '   '} rank=${String(rank + 1).padStart(2)} hit=${scored.find((x) => x.i === target).s.toFixed(3)} top1=${scored[0].s.toFixed(3)} ${scored[0].f}`
      )
    }
    console.log(
      `  [${lang}] top1=${top1}/${PAIRS.length} top3=${top3} 平均名次=${(rankSum / PAIRS.length).toFixed(1)} 命中cos=${(hitCos / PAIRS.length).toFixed(3)} 非命中均值cos=${(missCos / PAIRS.length).toFixed(3)} 平均UNK率=${((unkSum / PAIRS.length) * 100).toFixed(0)}%`
    )
    console.log(lines.join('\n'))
  }
}
main().catch((e) => {
  console.error('PROBE FAIL', e)
  process.exit(1)
})
