// 临时探针：预览音频反复开关 8 次 + 合成元素 8 次，统计失败率（跑完删除）
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
const src = readFileSync('/tmp/leaf-fmt-test/ding.mp3')
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const clean = async () => {
  for (let i = 0; i < 8; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('.photo-preview')))) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
  }
}
await clean()
const id = await page.evaluate(() => [...document.querySelectorAll('[data-photo-id]')].find((c) => c.textContent.includes('ding4.mp3'))?.dataset.photoId)
const preview = []
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(250)
for (let i = 0; i < 8; i++) {
  const r = await page.evaluate(async () => {
    const a = document.querySelector('.photo-preview audio')
    if (!a) return { none: true }
    return new Promise((res) => {
      if (a.readyState >= 1) return res({ ok: true, rs: a.readyState })
      a.addEventListener('loadedmetadata', () => res({ ok: true, rs: a.readyState }), { once: true })
      a.addEventListener('error', () => res({ ok: false, code: a.error?.code }), { once: true })
      setTimeout(() => res({ ok: false, timeout: true, rs: a.readyState }), 6000)
    })
  })
  preview.push(r.ok ? '.' : 'X')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.dblclick(`[data-photo-id="${id}"]`)
  await page.waitForTimeout(250)
}
console.log('预览 8 次:', preview.join(''))

// 合成元素：8 个各不相同的新 URL（排除任何缓存因素）
const names = []
for (let i = 0; i < 8; i++) {
  const n = `/tmp/leaf-fmt-test/var${i}.mp3`
  writeFileSync(n, src)
  names.push(n)
}
await page.evaluate((list) => window.api.photos.addMultiple(list), names)
await page.waitForTimeout(1500)
const synth = await page.evaluate(async (list) => {
  const out = []
  for (const p of list) {
    const r = await new Promise((res) => {
      const a = document.createElement('audio')
      a.preload = 'auto'
      a.addEventListener('loadedmetadata', () => res('.'), { once: true })
      a.addEventListener('error', () => res('X'), { once: true })
      setTimeout(() => res('T'), 6000)
      a.src = 'video://' + p
      a.load()
    })
    out.push(r)
  }
  return out.join('')
}, names)
console.log('合成 8 个新 URL:', synth)
await clean()
process.exit(0)
