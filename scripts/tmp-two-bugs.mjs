// 临时探针：列表页预览取错素材 + 预览关闭图标无效（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const clean = async () => {
  for (let i = 0; i < 8; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('.photo-preview')))) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}
await clean()

// 1. 切到列表布局（⌘\ 循环布局）
const layoutName = () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /布局/.test(b.title || ''))
    return btn?.title ?? '(无布局按钮)'
  })
log('布局按钮初值', await layoutName())
let switched = false
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Meta+\\')
  await page.waitForTimeout(700)
  const t = await layoutName()
  if (/列表/.test(t)) {
    switched = true
    log('切到列表', t)
    break
  }
}
if (!switched) log('⚠ 未能切到列表', await layoutName())

const rowIds = await page.$$eval('[data-photo-id]', (els) => els.map((e) => e.dataset.photoId))
log('列表行数', rowIds.length)
const nameOf = (id) => page.evaluate((x) => window.api.photos.getById(x).then((p) => p.fileName), id)

// 2. 单击第 3 行 → 看选中的是谁；再按 Enter / 空格 → 预览的是谁
const third = rowIds[2]
log('目标行(第3)', await nameOf(third))
await page.click(`[data-photo-id="${third}"]`)
await page.waitForTimeout(600)
const sel = await page.evaluate(() => [...document.querySelectorAll('[data-photo-id]')].filter((e) => /ring|selected|border-brand/.test(e.className)).map((e) => e.dataset.photoId))
log('单击后被选中的行', JSON.stringify(sel.map((s) => s.slice(0, 8))))
await page.keyboard.press('Enter')
await page.waitForTimeout(1200)
let previewName = await page.evaluate(() => document.querySelector('.photo-preview span.truncate')?.textContent.trim() ?? '(预览未开)')
log('Enter 打开的预览', previewName)
await clean()

// 3. 双击第 5 行
const fifth = rowIds[4]
log('目标行(第5)', await nameOf(fifth))
await page.dblclick(`[data-photo-id="${fifth}"]`)
await page.waitForTimeout(1200)
previewName = await page.evaluate(() => document.querySelector('.photo-preview span.truncate')?.textContent.trim() ?? '(预览未开)')
log('双击打开的预览', previewName)

// 4. 关闭图标
const closeInfo = await page.evaluate(() => {
  const b = document.querySelector('.photo-preview button[title="关闭（Esc）"]')
  if (!b) return { found: false }
  const r = b.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return {
    found: true,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    hitTarget: top ? `${top.tagName}.${(top.className || '').toString().slice(0, 40)}` : null,
    hitsSelf: top === b || b.contains(top),
    barOpacity: getComputedStyle(b.closest('div.flex.shrink-0')).opacity,
    barPE: getComputedStyle(b.closest('div.flex.shrink-0')).pointerEvents
  }
})
log('关闭键命中测试', JSON.stringify(closeInfo))
await page.click('.photo-preview button[title="关闭（Esc）"]')
await page.waitForTimeout(900)
log('点关闭后预览是否还在', await page.evaluate(() => !!document.querySelector('.photo-preview')))
await clean()
process.exit(0)
