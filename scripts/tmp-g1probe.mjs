import * as ort from 'onnxruntime-node'
import sharp from 'sharp'

const MODEL = '/tmp/jina-probe/vision_model_fp16.onnx'
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]

// 造三张图：纯红、纯蓝、红底加低频条纹（与红同源，应比蓝更近）
async function makePng(bg, stripes) {
  const size = 448
  const px = Buffer.alloc(size * size * 3)
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const [r, g, b] = hex(bg)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size * 3; x += 3) {
      px[y * size * 3 + x] = r
      px[y * size * 3 + x + 1] = g
      px[y * size * 3 + x + 2] = b
    }
  }
  if (stripes) {
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3
        px[i] = Math.min(255, px[i] + 60)
      }
    }
  }
  return sharp(px, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer()
}

// preprocessor_config: bicubic resize(shortest=224) → center crop 224 → /255 → (x-mean)/std
async function preprocess(png) {
  const raw = await sharp(png)
    .resize({ width: 224, height: 224, fit: 'cover', kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer()
  const out = new Float32Array(3 * 224 * 224)
  const plane = 224 * 224
  for (let i = 0; i < plane; i++) {
    out[i] = (raw[i * 3] / 255 - MEAN[0]) / STD[0]
    out[plane + i] = (raw[i * 3 + 1] / 255 - MEAN[1]) / STD[1]
    out[2 * plane + i] = (raw[i * 3 + 2] / 255 - MEAN[2]) / STD[2]
  }
  return new ort.Tensor('float32', out, [1, 3, 224, 224])
}

const session = await ort.InferenceSession.create(MODEL, { logSeverityLevel: 3 })
console.log('inputs:', [...session.inputNames], 'outputs:', [...session.outputNames])

const imgs = {
  red: await makePng('#c0392b', false),
  redStripes: await makePng('#c0392b', true),
  blue: await makePng('#2b4bc0', false)
}
const vecs = {}
for (const [k, png] of Object.entries(imgs)) {
  const feeds = { [session.inputNames[0]]: await preprocess(png) }
  const res = await session.run(feeds)
  const t = res[session.outputNames[0]]
  const v = Float32Array.from(t.data)
  const norm = Math.hypot(...v)
  vecs[k] = v.map((x) => x / norm)
  console.log(k, 'dim', v.length, 'norm', norm.toFixed(3), 'first3', v.slice(0, 3).join(','))
}
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)
console.log('cos(red, redStripes) =', cos(vecs.red, vecs.redStripes).toFixed(4))
console.log('cos(red, blue)       =', cos(vecs.red, vecs.blue).toFixed(4))
console.log('cos(redStripes, blue)=', cos(vecs.redStripes, vecs.blue).toFixed(4))
