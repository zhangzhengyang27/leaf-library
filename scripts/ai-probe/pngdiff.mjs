import { cos, l2n, makeTokenizer } from './probe-lib.mjs'
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'

const SIDE = 224
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]
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
async function embedRaw(buf) {
  const { data } = await sharp(buf)
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
import { readFileSync } from 'node:fs'
const f = '/tmp/ai-probe/img/cats.jpg'
const orig = readFileSync(f)
const asPng = await sharp(orig).png().toBuffer()
const vOrig = await embedRaw(orig)
const vPng = await embedRaw(asPng)
const q = await txt('一只猫')
console.log('cos(原jpg向量, png回环向量) =', cos(vOrig, vPng).toFixed(4))
console.log('cos(一只猫, 原jpg) =', cos(q, vOrig).toFixed(4))
console.log('cos(一只猫, png回环) =', cos(q, vPng).toFixed(4))
const pk = await embedRaw(readFileSync('/tmp/ai-probe/img/pikachu.png'))
console.log('cos(一只猫, pikachu) =', cos(q, pk).toFixed(4))
