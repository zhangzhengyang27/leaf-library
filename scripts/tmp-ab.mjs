// 临时探针：同一实例内先合成元素、后预览元素，逐条记录请求/响应头（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const trace = []
page.on('request', (r) => {
  if (/ding2\.mp3/.test(r.url())) {
    trace.push({ ev: 'REQ', range: r.headers()['range'] ?? null, extra: Object.keys(r.headers()).filter((k) => /range|media|sec-|purpose|fetch/i.test(k)).map((k) => `${k}:${r.headers()[k]}`) })
  }
})
page.on('response', async (r) => {
  if (/ding2\.mp3/.test(r.url())) {
    const h = await r.allHeaders()
    trace.push({ ev: 'RES', status: r.status(), ct: h['content-type'], cl: h['content-length'], cr: h['content-range'] ?? null, cc: h['cache-control'] ?? null, ar: h['accept-ranges'] ?? null })
  }
})
const r = await page.evaluate(async () => {
  const out = {}
  const url = 'video:///tmp/leaf-fmt-test/ding2.mp3'
  out['1 合成 preload=auto'] = await new Promise((res) => {
    const a = document.createElement('audio')
    a.preload = 'auto'
    a.addEventListener('loadedmetadata', () => res({ ok: true, dur: +a.duration.toFixed(2) }), { once: true })
    a.addEventListener('error', () => res({ code: a.error?.code }), { once: true })
    setTimeout(() => res({ timeout: true, rs: a.readyState }), 5000)
    a.src = url
    a.load()
  })
  return out
})
console.log('第一步:', JSON.stringify(r))
// 第二步：打开这张素材的预览
const id = await page.evaluate(() => [...document.querySelectorAll('[data-photo-id]')].find((c) => c.textContent.includes('ding2.mp3'))?.dataset.photoId ?? null)
if (id) {
  await page.dblclick(`[data-photo-id="${id}"]`)
  await page.waitForTimeout(3000)
  const p = await page.evaluate(() => {
    const a = document.querySelector('.photo-preview audio')
    return a ? { rs: a.readyState, code: a.error?.code, msg: a.error?.message, preload: a.preload, dur: a.duration } : { none: true }
  })
  console.log('第二步 预览元素:', JSON.stringify(p))
  await page.keyboard.press('Escape')
} else console.log('第二步: ding2.mp3 卡片不在视图')
console.log('轨迹:', JSON.stringify(trace, null, 1))
process.exit(0)
