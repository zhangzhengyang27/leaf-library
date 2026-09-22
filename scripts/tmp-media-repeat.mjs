// 临时探针：整文件区间回 200 + no-store 下，音频/视频反复开关预览（跑完删除）
import { chromium } from 'playwright'
const ok = (n, p, d) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  · ' + d : ''}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const clean = async () => {
  for (let i = 0; i < 8; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('.photo-preview')))) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}
const openByName = async (name) => {
  await clean()
  const id = await page.evaluate((n) => [...document.querySelectorAll('[data-photo-id]')].find((c) => c.textContent.includes(n))?.dataset.photoId ?? null, name)
  if (!id) return false
  await page.dblclick(`[data-photo-id="${id}"]`)
  await page.waitForTimeout(2200)
  return true
}
const mediaState = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(`.photo-preview ${s}`)
    if (!el) return { none: true }
    return { rs: el.readyState, dur: Number.isFinite(el.duration) ? +el.duration.toFixed(2) : null, code: el.error?.code ?? null, msg: el.error?.message ?? null }
  }, sel)

await page.waitForTimeout(1200)
await clean()

for (const [tag, name, sel] of [['mp3', 'ding.mp3', 'audio'], ['wav', 'ding.wav', 'audio'], ['mp4', 'clip.mp4', 'video']]) {
  for (const round of [1, 2, 3]) {
    const opened = await openByName(name)
    if (!opened) {
      ok(`${tag} 第${round}次开预览`, false, '卡片未找到')
      continue
    }
    const st = await mediaState(sel)
    ok(`${tag} 第${round}次开预览`, st.rs >= 1 && st.code === null && st.dur > 0, JSON.stringify(st))
  }
}

// 视频 seek / 逐帧 / 倍速在 200+206 混合响应下仍要可用
await openByName('clip.mp4')
const seek = await page.evaluate(async () => {
  const v = document.querySelector('.photo-preview video')
  v.pause()
  v.currentTime = 2.4
  await new Promise((r) => {
    v.addEventListener('seeked', r, { once: true })
    setTimeout(r, 3000)
  })
  return +v.currentTime.toFixed(2)
})
ok('视频拖到 2.4s', Math.abs(seek - 2.4) < 0.15, `currentTime=${seek}`)
const t0 = await page.evaluate(() => document.querySelector('.photo-preview video').currentTime)
await page.click('.photo-preview button:has-text("帧+")')
await page.waitForTimeout(400)
const t1 = await page.evaluate(() => document.querySelector('.photo-preview video').currentTime)
ok('逐帧步进', Math.abs(t1 - t0 - 1 / 30) < 0.02, `${t0.toFixed(3)} -> ${t1.toFixed(3)}`)
await clean()
process.exit(0)
