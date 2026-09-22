import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.evaluate(() => {
  location.hash = '#/photos'
})
await page.waitForTimeout(2000)
const cards = page.locator('img[src^="thumb://"]')
await cards.nth(0).click()
await cards.nth(1).click({ modifiers: ['Meta'] })
await cards.nth(0).click({ button: 'right' })
await page.waitForTimeout(600)
await page.getByText(/批量重命名/).first().click()
await page.waitForTimeout(800)
await page.locator('input[placeholder^="用一句话说规则"]').fill('前面加所在文件夹名，再接导入日期，最后 3 位序号')
await page.getByRole('button', { name: '✨ 生成' }).click()
await page.waitForTimeout(6000)
const out = await page.evaluate(() => ({
  pattern: document.querySelector('input[placeholder^="例如"]')?.value ?? null,
  error: document.querySelector('.text-danger')?.textContent?.trim() ?? '',
  preview: Array.from(document.querySelectorAll('p'))
    .find((p) => p.textContent?.startsWith('预览'))
    ?.parentElement?.innerText.replace(/\n+/g, ' | ') ?? ''
}))
console.log(JSON.stringify(out, null, 1))
// 主进程侧直接调一次，看原始返回
const raw = await page.evaluate(() =>
  window.api.ai.renamePattern('前面加所在文件夹名，再接导入日期，最后 3 位序号', ['a.png', 'b.jpg'])
)
console.log('主进程直调 →', JSON.stringify(raw))
await page.getByRole('button', { name: '取消' }).click()
await browser.close()
