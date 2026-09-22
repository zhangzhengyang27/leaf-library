// 临时探针：音频是响应体坏了还是文件本身 Chromium 解不了（跑完删除）
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))

const disk = readFileSync('/tmp/leaf-fmt-test/ding.mp3')
const viaRange = await page.evaluate(async () => {
  const r = await fetch('video:///tmp/leaf-fmt-test/ding.mp3', { headers: { Range: 'bytes=0-' } })
  const b = new Uint8Array(await r.arrayBuffer())
  return { len: b.length, head: [...b.slice(0, 6)], tail: [...b.slice(-4)] }
})
const viaFull = await page.evaluate(async () => {
  const r = await fetch('video:///tmp/leaf-fmt-test/ding.mp3')
  const b = new Uint8Array(await r.arrayBuffer())
  return { len: b.length, head: [...b.slice(0, 6)], tail: [...b.slice(-4)] }
})
console.log('disk     ', JSON.stringify({ len: disk.length, head: [...disk.subarray(0, 6)], tail: [...disk.subarray(-4)] }))
console.log('viaRange ', JSON.stringify(viaRange))
console.log('viaFull  ', JSON.stringify(viaFull))

// A/B：同一批字节走 data: URL 给 <audio>，绕开协议
const dataUrlResult = await page.evaluate(async (b64) => {
  const a = document.createElement('audio')
  a.preload = 'auto'
  a.src = 'data:audio/mpeg;base64,' + b64
  return new Promise((res) => {
    a.addEventListener('loadedmetadata', () => res({ ok: true, dur: a.duration }))
    a.addEventListener('error', () => res({ err: a.error?.code, msg: a.error?.message }))
    setTimeout(() => res({ timeout: true, rs: a.readyState }), 5000)
    a.load()
  })
}, disk.toString('base64'))
console.log('data: URL 喂给 <audio>:', JSON.stringify(dataUrlResult))

// 对照：一个已知能播的 wav（Chromium 对 PCM wav 支持最稳）
const wav = readFileSync('/Users/xiaoye/Documents/Playground/output/smoke/real-flow-smoke.wav')
const wavResult = await page.evaluate(async (b64) => {
  const a = document.createElement('audio')
  a.preload = 'auto'
  a.src = 'data:audio/wav;base64,' + b64
  return new Promise((res) => {
    a.addEventListener('loadedmetadata', () => res({ ok: true, dur: a.duration }))
    a.addEventListener('error', () => res({ err: a.error?.code, msg: a.error?.message }))
    setTimeout(() => res({ timeout: true, rs: a.readyState }), 5000)
    a.load()
  })
}, wav.subarray(0, 400000).toString('base64'))
console.log('wav 片段 data: URL:', JSON.stringify(wavResult))
process.exit(0)
