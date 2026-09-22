/* 临时探针：右栏三面板宽度固定 + F8 高级模式只改内容不改宽度（跑完删除） */
import { chromium } from 'playwright'

const out = []
const log = (...a) => {
  out.push(a.join(' '))
  process.stdout.write(a.join(' ') + '\n')
}

const b = await chromium.connectOverCDP('http://127.0.0.1:9223')
const ctx = b.contexts()[0]
const page = ctx.pages().find((p) => /localhost:51\d\d/.test(p.url()))
if (!page) {
  log('FATAL no renderer page; pages=', ctx.pages().map((p) => p.url()).join(','))
  process.exit(1)
}
await page.waitForTimeout(1500)

/** 页面里所有「全高右栏 aside」的实测宽度 + 左栏宽度 */
const snap = () =>
  page.evaluate(() => {
    const rectW = (el) => Math.round(el.getBoundingClientRect().width)
    const asides = [...document.querySelectorAll('aside')]
      .filter((a) => {
        const r = a.getBoundingClientRect()
        return r.height > window.innerHeight * 0.7 && r.width > 0
      })
      .map((a) => ({
        kind: a.getAttribute('aria-label') || a.querySelector('h3')?.textContent || 'aside',
        width: rectW(a),
        cssWidth: getComputedStyle(a).width
      }))
    const left = document.querySelector('[style*="--shell-library-panel-w"]')
    return {
      leftPanelWidth: left ? rectW(left) : null,
      leftPanelCss: left ? getComputedStyle(left).width : null,
      tokenInspector: getComputedStyle(document.documentElement)
        .getPropertyValue('--shell-inspector-w')
        .trim(),
      asides,
      advancedRows: document.querySelectorAll('[data-inspector-advanced-row]').length,
      dateSample: (() => {
        const dts = [...document.querySelectorAll('dt')]
        const hit = dts.find((d) => d.textContent.trim() === '添加日期')
        return hit ? hit.nextElementSibling?.textContent.trim() : null
      })()
    }
  })

const clickCard = async (n = 0) => {
  const cards = page.locator('[data-photo-id]')
  await cards.nth(n).click({ force: true })
  await page.waitForTimeout(400)
}

/** 当前高亮的侧栏行文案（用于跑完还原导航态） */
const activeRowText = () =>
  page.evaluate(() => {
    const el = document.querySelector('button[class*="group/row"].bg-surface-active')
    return el ? el.textContent.trim() : null
  })

log('== 0. 记录原导航态 ==')
const originalRow = await activeRowText()
log('原侧栏高亮行:', JSON.stringify(originalRow))

log('== 1. 静止态（无选中） ==')
log(JSON.stringify(await snap()))

log('== 2. 选中一张卡片 → PhotoInspector ==')
await clickCard(0)
const s2 = await snap()
log(JSON.stringify(s2))

log('== 3. F8 进入高级模式 ==')
await page.keyboard.press('F8')
await page.waitForTimeout(400)
const s3 = await snap()
log(JSON.stringify(s3))

log('== 3b. 高级模式的排障字段内容 ==')
log(
  JSON.stringify(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-inspector-advanced-row]')].map((el) => ({
        label: el.previousElementSibling?.textContent.trim(),
        value: el.textContent.trim().slice(0, 60)
      }))
    )
  )
)

log('== 4. F8 退出高级模式（宽度必须不变、行必须消失） ==')
await page.keyboard.press('F8')
await page.waitForTimeout(400)
const s4 = await snap()
log(JSON.stringify(s4))

log('== 6. 文件夹检查器（点侧栏「文件夹」组的第一行导航进去） ==')
const openedFolder = await page.evaluate(() => {
  const header = [...document.querySelectorAll('span')].find(
    (s) => s.textContent.trim() === '文件夹' && /text-fg-muted/.test(s.className)
  )
  if (!header) return 'NO-GROUP'
  const group = header.closest('div.mb-1') || header.parentElement.parentElement
  const row = group.querySelector('button[class*="group/row"]')
  if (!row) return 'NO-ROW'
  const name = row.textContent.trim()
  row.click()
  return name
})
log('进入的文件夹行:', JSON.stringify(openedFolder))
await page.waitForTimeout(900)
const s6 = await snap()
log(JSON.stringify(s6))

log('== 7. 还原：回到原侧栏入口 + 清选中 ==')
if (originalRow) {
  const row = page
    .locator('button[class*="group/row"]')
    .filter({ hasText: new RegExp(`^\\s*${originalRow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
  log('还原目标行命中:', await row.count())
  if (await row.count()) {
    await row.first().click({ force: true })
    await page.waitForTimeout(500)
  }
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
log('还原后高亮行:', JSON.stringify(await activeRowText()))
log(JSON.stringify(await snap()))

process.exit(0)
