// 临时探针：预览里的 <audio> 与合成 <audio> 请求差异逐条对比（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const log = []
page.on('request', (r) => {
  if (/ding2?\.mp3/.test(r.url())) log.push(`REQ  ${r.url().split('/').slice(-1)} ${r.method()} range=${r.headers().range ?? '-'}`)
})
page.on('response', async (r) => {
  if (/ding2?\.mp3/.test(r.url())) {
    const h = await r.allHeaders()
    log.push(`RES  ${r.url().split('/').slice(-1)} ${r.status()} ct=${h['content-type']} cl=${h['content-length']} cr=${h['content-range'] ?? '-'} cc=${h['cache-control'] ?? '-'}`)
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
const id = await page.evaluate(() => [...document.querySelectorAll('[data-photo-id]')].find((c) => c.textContent.includes('ding.mp3'))?.dataset.photoId)
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(3000)
const previewEl = await page.evaluate(() => {
  const a = document.querySelector('.photo-preview audio')
  return { src: a.getAttribute('src'), cur: a.currentSrc, rs: a.readyState, code: a.error?.code, msg: a.error?.message, preload: a.preload, crossOrigin: a.crossOrigin }
})
console.log('预览元素:', JSON.stringify(previewEl))

// 同一个元素：改 preload 再 load
const retry = await page.evaluate(async () => {
  const a = document.querySelector('.photo-preview audio')
  a.preload = 'auto'
  a.load()
  return new Promise((res) => {
    a.addEventListener('loadedmetadata', () => res({ recovered: true, dur: a.duration }), { once: true })
    setTimeout(() => res({ recovered: false, code: a.error?.code, msg: a.error?.message }), 4000)
  })
})
console.log('同一元素改 preload=auto 后:', JSON.stringify(retry))

// 合成元素（对照）
const synth = await page.evaluate(async () => {
  const a = document.createElement('audio')
  a.preload = 'metadata'
  a.src = 'video:///tmp/leaf-fmt-test/ding.mp3'
  return new Promise((res) => {
    a.addEventListener('loadedmetadata', () => res({ ok: true, dur: a.duration }), { once: true })
    a.addEventListener('error', () => res({ code: a.error?.code, msg: a.error?.message }), { once: true })
    setTimeout(() => res({ timeout: true, rs: a.readyState }), 4000)
    a.load()
  })
})
console.log('合成元素 preload=metadata:', JSON.stringify(synth))
console.log('\n网络轨迹:\n' + log.join('\n'))
await clean()
process.exit(0)
