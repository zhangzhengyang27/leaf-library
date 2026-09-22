/* 临时探针：预览改版后的真机结构与截图（跑完删除） */
import { chromium } from 'playwright'

const b = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = b.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
if (!page) {
  console.log('FATAL no renderer')
  process.exit(1)
}
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.locator('[data-photo-id]').first().dblclick({ force: true })
await page.waitForTimeout(500)

const geom = await page.evaluate(() => {
  const root = document.querySelector('.photo-preview')
  if (!root) return { error: '预览未打开' }
  const text = (el) => (el && el.textContent ? el.textContent : '').trim().replace(/\s+/g, ' ')
  const btns = [...root.querySelectorAll('button.pv-icon')]
  const hint = root.querySelector('.pv-hint')
  const ta = root.querySelector('.pv-note')
  return {
    iconButtons: btns.length,
    iconBtnHeights: [...new Set(btns.map((x) => Math.round(x.getBoundingClientRect().height)))],
    wrapped: btns.filter((x) => x.getBoundingClientRect().height > 34).map((x) => x.title),
    hintOpacityAtOpen: hint ? getComputedStyle(hint).opacity : null,
    noteBg: ta ? getComputedStyle(ta).backgroundColor : null,
    noteHeight: ta ? Math.round(ta.getBoundingClientRect().height) : null,
    topBarHeight: Math.round(root.querySelector('div > div:first-child').getBoundingClientRect().height),
    bottomHeight: Math.round(root.querySelector('div > div:last-of-type').getBoundingClientRect().height),
    metaLine: text([...root.querySelectorAll('span')].at(-2))
  }
})
console.log('几何:', JSON.stringify(geom))
await page.screenshot({ path: '/tmp/pv-1-default.png' })

const more = page.locator('.photo-preview button.pv-icon[title*="找相似"]').first()
await more.click({ force: true })
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/pv-2-more-menu.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(250)

const detail = page.locator('.photo-preview button[title*="完整信息与 EXIF"]').first()
await detail.click({ force: true })
await page.waitForTimeout(400)
const opened = await page.evaluate(() => {
  const t = document.querySelector('.photo-preview').textContent || ''
  return { exif: t.includes('EXIF'), fileName: t.includes('文件名') }
})
console.log('详情展开:', JSON.stringify(opened))
await page.screenshot({ path: '/tmp/pv-3-meta-open.png' })
await page.locator('.photo-preview button[title*="收起完整信息与"]').first().click({ force: true })
await page.waitForTimeout(250)

const noteGrow = await page.evaluate(async () => {
  const ta = document.querySelector('.pv-note')
  const original = ta.value
  const before = Math.round(ta.getBoundingClientRect().height)
  ta.value = '一二三四五'.repeat(30)
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 250))
  const after = Math.round(ta.getBoundingClientRect().height)
  ta.value = original
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  return { before, after, grew: after > before, max: getComputedStyle(ta).maxHeight }
})
console.log('注释框:', JSON.stringify(noteGrow))

// 键盘与翻页未回归：→ 换图、Esc 关闭
const firstName = await page.evaluate(
  () => document.querySelector('.photo-preview .truncate').textContent.trim()
)
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(500)
const afterNext = await page.evaluate(
  () => document.querySelector('.photo-preview .truncate').textContent.trim()
)
console.log('→ 翻页:', firstName, '→', afterNext, 'changed=', firstName !== afterNext)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
console.log('预览已关:', await page.evaluate(() => !document.querySelector('.photo-preview')))
process.exit(0)
