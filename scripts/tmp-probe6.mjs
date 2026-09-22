// 临时探针 6：UButton @click 是否真的落空（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const modal = () =>
  page.evaluate(() => {
    const m = document.querySelector('div.fixed.inset-0.z-\\[1000\\]')
    return m ? { title: m.querySelector('h3')?.textContent?.trim(), n: document.querySelectorAll('div.fixed.inset-0.z-\\[1000\\]').length } : { n: 0 }
  })
const clean = async () => {
  for (let i = 0; i < 6; i++) {
    const dirty = await page.evaluate(() => !!document.querySelector('div.fixed.inset-0.z-\\[1000\\]') || !!document.querySelector('.photo-preview'))
    if (!dirty) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(450)
  }
}
await clean()
const cards = await page.$$eval('[data-photo-id]', (e) => e.map((x) => x.dataset.photoId))
await page.dblclick(`[data-photo-id="${cards[0]}"]`)
await page.waitForTimeout(700)
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
await page.click('div.z-\\[1300\\] >> text=重命名…')
await page.waitForTimeout(800)
log('modal-open', JSON.stringify(await modal()))

// A. 点「确定」（同名提交是 no-op，但 submit() 一定会关窗）
await page.locator('div.fixed.inset-0.z-\\[1000\\] button', { hasText: '确定' }).first().click()
await page.waitForTimeout(800)
log('after-确定', JSON.stringify(await modal()))

// B. 点面板右上角 ✕（原生 button，aria-label=关闭）
await page
  .locator('div.fixed.inset-0.z-\\[1000\\] button[aria-label="关闭"]')
  .click({ timeout: 4000 })
  .catch((e) => log('after-✕-skipped', e.message.slice(0, 50)))
await page.waitForTimeout(800)
log('after-✕', JSON.stringify(await modal()))
if ((await modal()).n) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}
await clean()

// C. 全局普查：UButton 上的 @click 到底有多少处
const ubuttonAudit = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button.inline-flex.select-none')]
  return { sample: btns.slice(0, 3).map((b) => b.textContent.trim().slice(0, 12)), count: btns.length }
})
log('ubutton-in-dom', JSON.stringify(ubuttonAudit))

// D. 直接看 DOM 节点上有没有挂到原生 click 监听（Vue 把 v-on 存在 el._vei）
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
await page.click('div.z-\\[1300\\] >> text=重命名…')
await page.waitForTimeout(800)
log('modal-reopened', JSON.stringify(await modal()))
const listeners = await page.evaluate(() => {
  const pick = (txt) =>
    [...document.querySelectorAll('button.inline-flex.select-none')].find((b) =>
      b.textContent.trim().includes(txt)
    )
  const dump = (el) => (el ? { text: el.textContent.trim(), vei: Object.keys(el._vei || {}) } : null)
  return { ubuttons: [...document.querySelectorAll('button.inline-flex.select-none')].map((b) => ({ text: b.textContent.trim().slice(0, 10), vei: Object.keys(b._vei || {}) })).slice(0, 8) }
})
log('ubutton-listeners', JSON.stringify(listeners.ubuttons))
process.exit(0)
