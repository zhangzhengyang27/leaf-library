import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const rows = []
const check = (n, ok, x = '') => rows.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? `  → ${x}` : ''}`)

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

// 选中两张，右键 → 批量重命名
const cards = page.locator('img[src^="thumb://"]')
await cards.nth(0).click()
await cards.nth(1).click({ modifiers: ['Meta'] })
await cards.nth(0).click({ button: 'right' })
await page.waitForTimeout(500)
await page.getByText(/批量重命名/).first().click()
await page.waitForTimeout(700)

const modalOpen = await page.getByText('命名模式（任意组合字面文本与变量').count()
check('批量重命名弹层可打开', modalOpen > 0)

const ASK = '前面加所在文件夹名，然后按导入日期，再跟 3 位序号'
await page.locator('input[placeholder^="用一句话说规则"]').fill(ASK)
const t0 = Date.now()
await page.getByRole('button', { name: '✨ 生成' }).click()
await page.waitForTimeout(4000)
const pattern = await page.locator('input[placeholder^="例如"]').inputValue()
const preview = await page.evaluate(() => {
  const box = Array.from(document.querySelectorAll('p')).find((p) =>
    p.textContent?.startsWith('预览（前 3 项）')
  )
  return box?.parentElement?.innerText.replace(/\n+/g, ' | ').slice(0, 220) ?? ''
})
rows.push(`INFO  生成耗时 ${Date.now() - t0}ms`)
check('AI 生成出了模板并填进模式框', pattern.includes('{') && pattern.includes('}'), pattern)
check('预览随之更新（未落盘）', /→/.test(preview) && !/undefined/.test(preview), preview)

const err = await page.evaluate(
  () => document.querySelector('.text-danger')?.textContent?.trim() ?? ''
)
check('没有报错', err === '', err)

// 取消，不改任何文件名
await page.getByRole('button', { name: '取消' }).click()
await page.waitForTimeout(500)
const names = await page.evaluate(async () => {
  const all = await window.api.photos.getAll()
  return all
    .slice(0, 3)
    .map((r) => r.fileName)
    .join(' | ')
})
rows.push(`INFO  前 3 个文件名未变：${names}`)

await page.evaluate((raw) => {
  if (raw === null) localStorage.removeItem('library.tab.v2')
  else localStorage.setItem('library.tab.v2', raw)
}, saved)
console.log(rows.join('\n'))
await browser.close()
