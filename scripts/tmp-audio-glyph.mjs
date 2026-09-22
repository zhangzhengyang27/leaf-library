// 临时探针：预览内 audio 为何仍失败 + 字形表检测是否被逐字回退吃掉（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const clean = async () => {
  for (let i = 0; i < 8; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('.photo-preview')))) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}
await clean()

// ── A. 预览里的 audio ──
const mp3Id = await page.evaluate(() => [...document.querySelectorAll('[data-photo-id]')].find((c) => c.textContent.includes('ding.mp3'))?.dataset.photoId)
await page.dblclick(`[data-photo-id="${mp3Id}"]`)
await page.waitForTimeout(2500)
const a1 = await page.evaluate(() => {
  const a = document.querySelector('.photo-preview audio')
  return { attr: a.getAttribute('src'), cur: a.currentSrc, rs: a.readyState, ns: a.networkState, code: a.error?.code, msg: a.error?.message, preload: a.preload }
})
console.log('A1 预览 audio 初态:', JSON.stringify(a1))
const a2 = await page.evaluate(async () => {
  const a = document.querySelector('.photo-preview audio')
  a.load()
  return new Promise((res) => {
    a.addEventListener('loadedmetadata', () => res({ recovered: true, dur: a.duration }), { once: true })
    setTimeout(() => res({ recovered: false, rs: a.readyState, code: a.error?.code, msg: a.error?.message }), 4000)
  })
})
console.log('A2 显式 load() 后:', JSON.stringify(a2))
const a3 = await page.evaluate(async () => {
  const src = document.querySelector('.photo-preview audio').currentSrc
  const b = document.createElement('audio')
  b.preload = 'auto'
  b.src = src
  return new Promise((res) => {
    b.addEventListener('loadedmetadata', () => res({ ok: true, dur: b.duration }), { once: true })
    b.addEventListener('error', () => res({ err: b.error?.code, msg: b.error?.message }), { once: true })
    setTimeout(() => res({ timeout: true, rs: b.readyState }), 4000)
  })
})
console.log('A3 同 URL 新元素:', JSON.stringify(a3))
await clean()

// ── B. 字形表检测的可信度 ──
const fontId = await page.evaluate(() => [...document.querySelectorAll('[data-photo-id]')].find((c) => c.textContent.includes('Arial.ttf'))?.dataset.photoId)
await page.dblclick(`[data-photo-id="${fontId}"]`)
await page.waitForTimeout(2500)
const g = await page.evaluate(async () => {
  const face = [...document.fonts].find((f) => f.family.startsWith('leaf-font-'))
  if (!face) return { noFace: true }
  const fam = `"${face.family}"`
  const probe = (font, ch) => {
    const cv = document.createElement('canvas')
    cv.width = 40
    cv.height = 40
    const c = cv.getContext('2d', { willReadFrequently: true })
    c.clearRect(0, 0, 40, 40)
    c.font = font
    c.fillStyle = '#000'
    c.textBaseline = 'middle'
    c.fillText(ch, 4, 20)
    const d = c.getImageData(0, 0, 40, 40).data
    let ink = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink++
    return { ink, w: c.measureText(ch).width }
  }
  const bogus = probe('"no-such-font-zzz"', '中')
  const leaf = probe(fam, '中')
  const leafA = probe(fam, 'A')
  return {
    family: face.family,
    checkCJK: document.fonts.check(`${20}px ${fam}`, '中'),
    checkLatin: document.fonts.check(`20px ${fam}`, 'A'),
    bogusCJK: bogus,
    leafCJK: leaf,
    leafLatin: leafA,
    // 与系统里确定含 CJK 的字体比一比，看「中」的墨迹是否同源（=回退）
    pingfang: probe('"PingFang SC"', '中')
  }
})
console.log('B 字形检测取证:', JSON.stringify(g, null, 1))
await clean()
process.exit(0)
