// 临时探针 7：确认 UButton 的 @click 是否根本没挂到 DOM（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
for (let i = 0; i < 6; i++) {
  const dirty = await page.evaluate(() => !!document.querySelector('div.fixed.inset-0.z-\\[1000\\]') || !!document.querySelector('.photo-preview'))
  if (!dirty) break
  await page.keyboard.press('Escape')
  await page.waitForTimeout(450)
}
const cards = await page.$$eval('[data-photo-id]', (e) => e.map((x) => x.dataset.photoId))
await page.dblclick(`[data-photo-id="${cards[0]}"]`)
await page.waitForTimeout(700)
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
await page.click('div.z-\\[1300\\] >> text=重命名…')
await page.waitForTimeout(800)
const dump = await page.evaluate(() => {
  const m = document.querySelector('div.fixed.inset-0.z-\\[1000\\]')
  if (!m) return { err: 'no modal' }
  return [...m.querySelectorAll('button')].map((b) => ({
    text: (b.textContent.trim() || b.getAttribute('aria-label') || '?').slice(0, 8),
    cls: b.className.slice(0, 24),
    veiKeys: Object.keys(b._vei || {}),
    hasOnClickProp: typeof b.onclick === 'function'
  }))
})
log('modal-buttons', JSON.stringify(dump, null, 0))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.keyboard.press('Escape')
process.exit(0)
