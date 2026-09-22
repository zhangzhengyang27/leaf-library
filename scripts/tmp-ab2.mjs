// 临时探针：预览元素 vs 合成元素，同一 URL 的请求/响应逐条对比（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const URL_RE = /ding3\.mp3/
const log = []
page.on('request', (r) => {
  if (URL_RE.test(r.url())) log.push(`REQ  range=${r.headers()['range'] ?? '-'} | all=${JSON.stringify(Object.fromEntries(Object.entries(r.headers()).filter(([k]) => /range|media|fetch|purpose|sec-ch|accept|origin/i.test(k))))}`)
})
page.on('response', async (r) => {
  if (URL_RE.test(r.url())) {
    const h = await r.allHeaders()
    log.push(`RES  ${r.status()} ct=${h['content-type']} cl=${h['content-length']} cr=${h['content-range'] ?? '-'} cc=${h['cache-control'] ?? '-'} ar=${h['accept-ranges'] ?? '-'}`)
  }
})
const clean = async () => {
  for (let i = 0; i < 8; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('.photo-preview')))) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}
await clean()
console.log('=== 第一步：预览元素（先碰这个 URL）===')
const id = await page.evaluate(() => [...document.querySelectorAll('[data-photo-id]')].find((c) => c.textContent.includes('ding3.mp3'))?.dataset.photoId)
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(5000)
console.log('预览元素:', JSON.stringify(await page.evaluate(() => {
  const a = document.querySelector('.photo-preview audio')
  return { rs: a.readyState, code: a.error?.code, preload: a.preload, src: a.getAttribute('src') }
})))
await clean()
console.log('\n=== 第二步：同 URL 合成元素（游离 / 挂 DOM × controls）===')
const r2 = await page.evaluate(async () => {
  const mk = async (attach, controls) => {
    const a = document.createElement('audio')
    a.preload = 'auto'
    if (controls) a.controls = true
    if (attach) { a.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(a) }
    const p = new Promise((res) => {
      a.addEventListener('loadedmetadata', () => res({ ok: true, dur: +a.duration.toFixed(2) }), { once: true })
      a.addEventListener('error', () => res({ code: a.error?.code }), { once: true })
      setTimeout(() => res({ timeout: true, rs: a.readyState }), 5000)
    })
    a.src = 'video:///tmp/leaf-fmt-test/ding3.mp3'
    if (!attach) a.load()
    return p
  }
  return { 游离无controls: await mk(false, false), 挂DOM有controls: await mk(true, true) }
})
console.log(JSON.stringify(r2))
console.log('\n轨迹:\n' + log.join('\n'))
process.exit(0)
