// 临时探针：音频为何 readyState=0 —— 用预览元素自己的 currentSrc 取证（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const clean = async () => {
  for (let i = 0; i < 8; i++) {
    const dirty = await page.evaluate(() => !!document.querySelector('.photo-preview'))
    if (!dirty) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}
await clean()
const id = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-photo-id]')]
  return cards.find((c) => c.textContent.includes('ding.mp3'))?.dataset.photoId ?? null
})
log('card', id ?? '(未找到)')
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(2500)
const r = await page.evaluate(async () => {
  const a = document.querySelector('.photo-preview audio')
  if (!a) return { noAudio: true, text: document.querySelector('.photo-preview')?.innerText.slice(0, 80) }
  const src = a.currentSrc || a.src
  const err = await new Promise((res) => {
    if (a.readyState >= 1) return res({ already: a.readyState, dur: a.duration })
    a.addEventListener('error', () => res({ code: a.error?.code, message: a.error?.message }), { once: true })
    a.addEventListener('loadedmetadata', () => res({ ok: true, dur: a.duration }), { once: true })
    a.load()
    setTimeout(() => res({ timeout: true, readyState: a.readyState, networkState: a.networkState, currentSrc: a.currentSrc }), 5000)
  })
  const plain = await fetch(src).then((x) => ({
    status: x.status,
    ct: x.headers.get('content-type'),
    cl: x.headers.get('content-length'),
    ar: x.headers.get('accept-ranges')
  }))
  const ranged = await fetch(src, { headers: { Range: 'bytes=0-1' } }).then((x) => ({
    status: x.status,
    ct: x.headers.get('content-type'),
    cl: x.headers.get('content-length')
  }))
  return { src: src.slice(0, 60), err, plain, ranged }
})
log('diag', JSON.stringify(r, null, 1))
await clean()
process.exit(0)
