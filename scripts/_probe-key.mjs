import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const rows = []
const check = (n, ok, x = '') => rows.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? `  → ${x}` : ''}`)
let page
for (let i = 0; i < 80; i++) {
  page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
  if (page) break
  await new Promise((r) => setTimeout(r, 500))
}

async function main() {
  if (!page) throw new Error('渲染层页面未出现')
  await page.waitForTimeout(3500)

  // Key 经系统密钥环加密落盘，重启进程后应仍可用（且只回末 4 位）
  const cfg = await page.evaluate(() => window.api.ai.config())
  check('Key 跨进程重启仍在（且不明文外泄）', cfg.configured && cfg.hint === '…caad', JSON.stringify(cfg))

  const ocr = await page.evaluate(() => window.api.photos.ocrStatus())
  rows.push(`INFO  OCR 状态 = ${JSON.stringify(ocr)}`)

  await page.evaluate(() => {
    location.hash = '#/photos'
  })
  await page.waitForTimeout(1500)
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('library.tab.v2')
    if (!raw) return null
    const p = JSON.parse(raw)
    p.tab.view = 'all'
    p.tab.title = '全部'
    localStorage.setItem('library.tab.v2', JSON.stringify(p))
    return raw
  })
  await page.reload()
  await page.waitForTimeout(2500)

  async function openByName(name) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    await page.waitForTimeout(300)
    await page.locator(`text=${name}`).first().dblclick({ timeout: 8000 })
    await page.waitForTimeout(1200)
  }
  async function btnCount() {
    return page.getByRole('button', { name: /AI 摘要与标签/ }).count()
  }

  await openByName('未命名.txt')
  check('Eagle 导入的文本（kind=file）现在出现 AI 按钮', (await btnCount()) === 1)

  await openByName('pexels-photo-886521.jpg')
  check('无文字信号的图片仍不出现按钮', (await btnCount()) === 0)

  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  await page.evaluate((raw) => {
    if (raw === null) localStorage.removeItem('library.tab.v2')
    else localStorage.setItem('library.tab.v2', raw)
  }, saved)
  await page.reload()
}

try {
  await main()
} catch (e) {
  rows.push(`THREW  ${String(e.message).split('\n')[0]}`)
}
console.log(rows.join('\n'))
await browser.close()
