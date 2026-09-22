/* 临时探针：外框静止淡出 + 边缘悬停翻页键（跑完删除） */
import { chromium } from 'playwright'

const b = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = b.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
if (!page) {
  console.log('FATAL no renderer')
  process.exit(1)
}
const size = page.viewportSize() || { width: 1450, height: 900 }

await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.locator('[data-photo-id]').first().dblclick({ force: true })
await page.waitForTimeout(400)

const chromeOpacity = () =>
  page.evaluate(() => {
    const root = document.querySelector('.photo-preview')
    const bar = root.querySelector('div > div:first-child')
    const strip = [...root.querySelectorAll('div')].filter(
      (d) => (d.getAttribute('class') || '').includes('shrink-0 pt-2')
    )[0]
    const op = (el) => (el ? getComputedStyle(el).opacity : null)
    return { bar: op(bar), strip: op(strip) }
  })

console.log('刚打开:', JSON.stringify(await chromeOpacity()))
await page.waitForTimeout(2900)
console.log('静止 2.9s 后:', JSON.stringify(await chromeOpacity()))

// 淡出后顶栏不该还能点（pointer-events 关掉的判据）
const barHit = await page.evaluate(() => {
  const root = document.querySelector('.photo-preview')
  const bar = root.querySelector('div > div:first-child')
  return { pe: getComputedStyle(bar).pointerEvents, op: getComputedStyle(bar).opacity }
})
console.log('淡出后顶栏:', JSON.stringify(barHit))

// 鼠标一动就回来
await page.mouse.move(size.width * 0.5, size.height * 0.4)
await page.waitForTimeout(120)
console.log('移动后:', JSON.stringify(await chromeOpacity()))

// 指针停在顶栏上不收
await page.mouse.move(size.width * 0.5, 40)
await page.waitForTimeout(3000)
console.log('停在顶栏 3s 后:', JSON.stringify(await chromeOpacity()))

// 正在打字时不收
await page.mouse.move(size.width * 0.5, size.height * 0.4)
await page.waitForTimeout(150)
const ta = page.locator('.pv-note')
await ta.click({ force: true })
await page.keyboard.type('测试')
await page.waitForTimeout(3000)
console.log('输入后静止 3s:', JSON.stringify(await chromeOpacity()))
await page.evaluate(() => {
  const t = document.querySelector('.pv-note')
  t.value = ''
  t.dispatchEvent(new Event('input', { bubbles: true }))
  t.blur()
})
await page.mouse.move(size.width * 0.5, size.height * 0.4)
await page.waitForTimeout(2900)
console.log('失焦后静止:', JSON.stringify(await chromeOpacity()))

// 边缘箭头：hover 左带 → 浮现 → 点它翻页
const nameOf = () =>
  page.evaluate(() => document.querySelector('.photo-preview .truncate').textContent.trim())
const before = await nameOf()
const leftBtn = page.locator('.group:has(.pv-edge)').first()
console.log('左带命中:', await leftBtn.count())
await leftBtn.hover({ force: true })
await page.waitForTimeout(350)
const hovered = await page.evaluate(() => {
  const el = document.querySelector('.pv-edge')
  return { op: getComputedStyle(el).opacity, w: Math.round(el.getBoundingClientRect().width) }
})
console.log('hover 左带 → 箭头:', JSON.stringify(hovered))
await page.screenshot({ path: '/tmp/pv-5-edge.png' })
await leftBtn.locator('.pv-edge').click({ force: true })
await page.waitForTimeout(600)
const after = await nameOf()
console.log('边缘翻页:', before, '→', after, 'changed=', before !== after)

// 带内空白处点击仍然关框
await page.waitForTimeout(2600)
await page.mouse.click(6, size.height * 0.5)
await page.waitForTimeout(500)
console.log('点带内空白后预览还在吗:', await page.evaluate(() => !!document.querySelector('.photo-preview')))
process.exit(0)
