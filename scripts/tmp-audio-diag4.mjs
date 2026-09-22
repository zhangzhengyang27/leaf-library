// 临时探针：audio 元素在四种来源下的 2x2 判别（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const msgs = []
page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text().slice(0, 160)}`))
const r = await page.evaluate(async () => {
  const tryLoad = (url) =>
    new Promise((res) => {
      const a = document.createElement('audio')
      a.preload = 'auto'
      const done = (v) => res(v)
      a.addEventListener('loadedmetadata', () => done({ ok: true, dur: +a.duration.toFixed(2) }))
      a.addEventListener('error', () => done({ err: a.error?.code, msg: a.error?.message }))
      setTimeout(() => done({ timeout: true, rs: a.readyState, ns: a.networkState }), 5000)
      a.src = url
      a.load()
    })
  const out = {}
  out['video:// mp3'] = await tryLoad('video:///tmp/leaf-fmt-test/ding.mp3')
  out['rawfile:// mp3'] = await tryLoad('rawfile:///tmp/leaf-fmt-test/ding.mp3')
  out['video:// wav'] = await tryLoad('video:///Users/xiaoye/Documents/Playground/output/smoke/real-flow-smoke.wav')
  out['video:// mp4'] = await tryLoad('video:///tmp/leaf-fmt-test/clip.mp4')
  out['csp'] = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content?.match(/media-src[^;]+/)?.[0] ?? '(无 media-src)'
  return out
})
console.log(JSON.stringify(r, null, 1))
console.log('console:', msgs.slice(-8).join('\n'))
process.exit(0)
