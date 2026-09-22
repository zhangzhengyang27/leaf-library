// 临时探针：no-store 变体下，音频重复加载与视频拖动是否都稳（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const r = await page.evaluate(async () => {
  const tryLoad = (url, tag) =>
    new Promise((res) => {
      const el = tag.includes('v') ? document.createElement('video') : document.createElement('audio')
      el.preload = 'auto'
      el.addEventListener('loadedmetadata', () => res({ ok: true, dur: +el.duration.toFixed(2) }), { once: true })
      el.addEventListener('error', () => res({ err: el.error?.code }), { once: true })
      setTimeout(() => res({ timeout: true, rs: el.readyState }), 6000)
      el.src = url
      el.load()
    })
  const out = {}
  const mp3 = 'video:///tmp/leaf-fmt-test/ding.mp3'
  const wav = 'video:///tmp/leaf-fmt-test/ding.wav'
  const mp4 = 'video:///tmp/leaf-fmt-test/clip.mp4'
  out['mp3 第1次'] = await tryLoad(mp3, 'a1')
  out['mp3 第2次'] = await tryLoad(mp3, 'a2')
  out['mp3 第3次'] = await tryLoad(mp3, 'a3')
  out['wav 第1次'] = await tryLoad(wav, 'b1')
  out['wav 第2次'] = await tryLoad(wav, 'b2')
  out['mp4 第1次'] = await tryLoad(mp4, 'v1')
  out['mp4 第2次'] = await tryLoad(mp4, 'v2')
  // 视频拖动：设 currentTime 看能否 seek
  const v = document.createElement('video')
  v.preload = 'auto'
  v.src = mp4
  await new Promise((res) => {
    v.addEventListener('loadedmetadata', res, { once: true })
    v.addEventListener('error', res, { once: true })
    setTimeout(res, 4000)
  })
  const seeked = await new Promise((res) => {
    v.addEventListener('seeked', () => res(+v.currentTime.toFixed(2)), { once: true })
    v.currentTime = 2.2
    setTimeout(() => res('timeout'), 3000)
  })
  out['mp4 seek'] = seeked
  out['mp4 第3次'] = await tryLoad(mp4, 'v3')
  return out
})
console.log(JSON.stringify(r, null, 1))
process.exit(0)
