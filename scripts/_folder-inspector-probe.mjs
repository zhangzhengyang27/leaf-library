/* 临时探针 2：设法导航进文件夹视图，量 FolderInspector 宽度（跑完删除） */
import { chromium } from 'playwright'

const b = await chromium.connectOverCDP('http://127.0.0.1:9223')
const ctx = b.contexts()[0]
const page = ctx.pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(800)

const apiKeys = await page.evaluate(() => Object.keys(window.api || {}))
console.log('window.api keys:', apiKeys.join(','))

for (const ns of ['folders', 'folder']) {
  const methods = await page.evaluate(
    (k) => (window.api && window.api[k] ? Object.keys(window.api[k]).join(',') : null),
    ns
  )
  if (methods) console.log(`api.${ns} methods:`, methods)
}

const activeRowText = () =>
  page.evaluate(() => {
    const el = document.querySelector('button[class*="group/row"].bg-surface-active')
    return el ? el.textContent.trim() : null
  })
const originalRow = await activeRowText()
console.log('原高亮行:', JSON.stringify(originalRow))

const sidebarText = await page.evaluate(() => {
  const left = document.querySelector('aside')
  return left ? left.innerText.replace(/\n+/g, ' | ').slice(0, 600) : null
})
console.log('侧栏文本:', sidebarText)

const snap = () =>
  page.evaluate(() => {
    const asides = [...document.querySelectorAll('aside')]
      .filter((a) => a.getBoundingClientRect().height > window.innerHeight * 0.7)
      .map((a) => ({
        kind: a.getAttribute('aria-label') || a.querySelector('h3')?.textContent || 'aside',
        width: Math.round(a.getBoundingClientRect().width)
      }))
    return { asides, rightHasFolderHeader: !!document.querySelector('aside h3') }
  })

// 点侧栏里含「资料/周」等字样的行：逐个尝试，直到右栏出现「文件夹」标题
const tried = []
const rowCount = await page.locator('button[class*="group/row"]').count()
for (let i = 0; i < rowCount; i++) {
  const name = (await page.locator('button[class*="group/row"]').nth(i).innerText()).trim()
  if (name === originalRow) continue
  await page.locator('button[class*="group/row"]').nth(i).click({ force: true })
  await page.waitForTimeout(500)
  const s = await snap()
  const right = s.asides.at(-1)
  tried.push(`${name}→${right.kind}/${right.width}`)
  if (right.kind.includes('文件夹')) {
    console.log('命中 FolderInspector:', JSON.stringify(s))
    break
  }
}
console.log('尝试轨迹:', tried.join('  '))

if (originalRow) {
  const row = page
    .locator('button[class*="group/row"]')
    .filter({ hasText: originalRow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') })
  if (await row.count()) {
    await row.first().click({ force: true })
    await page.waitForTimeout(500)
  }
}
await page.keyboard.press('Escape')
console.log('还原后:', JSON.stringify(await snap()), '高亮行:', JSON.stringify(await activeRowText()))
process.exit(0)
