// 临时探针 5：重命名弹窗生命周期与焦点（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))

const modalState = () =>
  page.evaluate(() => {
    const m = document.querySelector('div.fixed.inset-0.z-\\[1000\\]')
    if (!m) return { present: false, active: String(document.activeElement?.tagName) }
    const input = m.querySelector('input')
    return {
      present: true,
      title: m.querySelector('h3')?.textContent?.trim(),
      active: String(document.activeElement?.tagName) + '.' + String(document.activeElement?.className).slice(0, 30),
      inputFocused: document.activeElement === input,
      buttons: [...m.querySelectorAll('button')].map((b) => b.textContent.trim() || b.getAttribute('aria-label'))
    }
  })

await page.keyboard.press('Escape')
await page.waitForTimeout(400)
// 收敛到干净态：弹窗与预览全部关掉
for (let i = 0; i < 5; i++) {
  const dirty = await page.evaluate(
    () =>
      !!document.querySelector('div.fixed.inset-0.z-\\[1000\\]') ||
      !!document.querySelector('.photo-preview')
  )
  if (!dirty) break
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}
log('clean-state', JSON.stringify(await modalState()))
const cards = await page.$$eval('[data-photo-id]', (e) => e.map((x) => x.dataset.photoId))
await page.dblclick(`[data-photo-id="${cards[0]}"]`)
await page.waitForTimeout(700)
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
await page.click('div.z-\\[1300\\] >> text=重命名…')
await page.waitForTimeout(120)
log('t+120ms', JSON.stringify(await modalState()))
await page.waitForTimeout(700)
log('t+820ms', JSON.stringify(await modalState()))

// 直接回车提交空改（值未变时 promptRename 会 return，不落库）——先确认 Enter 是否被吃掉
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
log('after-enter(同名应无副作用)', JSON.stringify(await modalState()))

// Esc 关
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
log('after-esc', JSON.stringify(await modalState()))
log('preview-after-esc', String(await page.$('.photo-preview') !== null))

// 再开一次，点「取消」
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
await page.click('div.z-\\[1300\\] >> text=重命名…')
await page.waitForTimeout(800)
log('reopened', JSON.stringify(await modalState()))
const cancelBtn = page.locator('div.fixed.inset-0.z-\\[1000\\] button', { hasText: '取消' })
log('cancel-count', String(await cancelBtn.count()))
await cancelBtn.first().click()
await page.waitForTimeout(600)
log('after-cancel-click', JSON.stringify(await modalState()))
await page.waitForTimeout(1000)
log('after-cancel+1s', JSON.stringify(await modalState()))
log('preview-open', String(await page.$('.photo-preview') !== null))
await page.keyboard.press('Escape')
process.exit(0)
