// 临时探针：音频请求/响应逐条取证（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const seen = []
page.on('request', (r) => {
  if (/ding\.mp3|clip\.mp4/.test(r.url())) {
    seen.push({ dir: 'REQ', url: r.url.slice(0, 46), method: r.method(), range: r.headers().range ?? null })
  }
})
page.on('response', async (r) => {
  if (/ding\.mp3|clip\.mp4/.test(r.url())) {
    seen.push({ dir: 'RES', url: r.url.slice(0, 46), status: r.status(), headers: await r.allHeaders() })
  }
})
for (let i = 0; i < 8; i++) {
  if (!(await page.evaluate(() => !!document.querySelector('.photo-preview')))) break
  await page.keyboard.press('Escape')
  await page.waitForTimeout(450)
}
for (let i = 0; i < 8; i++) {
  if (!(await page.evaluate(() => !!document.querySelector('.photo-preview')))) break
  await page.keyboard.press('Escape')
  await page.waitForTimeout(450)
}
const id = await page.evaluate(() => [...document.querySelectorAll('[data-photo-id]')].find((c) => c.textContent.includes('ding.mp3'))?.dataset.photoId)
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(4000)
const el = await page.evaluate(() => {
  const a = document.querySelector('.photo-preview audio')
  return { src: a?.currentSrc, rs: a?.readyState, ns: a?.networkState, err: a?.error?.code, mt: a?.error?.message }
})
console.log('element:', JSON.stringify(el))
for (const s of seen) {
  if (s.dir === 'REQ') console.log('REQ ', s.method, s.url, 'range=', s.range)
  else console.log('RES ', s.status, s.url, JSON.stringify({ ct: s.headers['content-type'], cl: s.headers['content-length'], cr: s.headers['content-range'], ar: s.headers['accept-ranges'] }))
}
await page.keyboard.press('Escape')
process.exit(0)
