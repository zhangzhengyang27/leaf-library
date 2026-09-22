// 临时探针：复现「预览关闭图标无效」与「列表页预览总是第一个」（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const clean = async () => {
  for (let i = 0; i < 10; i++) {
    const dirty = await page.evaluate(
      () => !!document.querySelector('div.fixed.inset-0.z-\\[1000\\]') || !!document.querySelector('.photo-preview')
    )
    if (!dirty) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}
await clean()
log('起始态', JSON.stringify(await page.evaluate(() => ({ cards: document.querySelectorAll('[data-photo-id]').length, preview: !!document.querySelector('.photo-preview') }))))

const previewName = () =>
  page.evaluate(() => document.querySelector('.photo-preview span.truncate')?.textContent?.trim() ?? '(预览未开)')
const rowName = (id) => page.evaluate((x) => window.api.photos.getById(x).then((p) => p.fileName), id)

// ── A. 关闭图标（当前布局）──
const ids = await page.$$eval('[data-photo-id]', (e) => e.map((x) => x.dataset.photoId))
const target = ids[7]
log('A 目标素材', await rowName(target))
await page.dblclick(`[data-photo-id="${target}"]`)
await page.waitForTimeout(1500)
log('A 预览已开，显示', await previewName())
const hit = await page.evaluate(() => {
  const b = document.querySelector('.photo-preview button[title="关闭（Esc）"]')
  if (!b) return { found: false }
  const r = b.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  const bar = b.closest('div[class*="shrink-0"]')
  return {
    found: true,
    rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    hitIsButton: !!top && (top === b || b.contains(top)),
    hitTag: top ? `${top.tagName} ${top.className?.toString().slice(0, 46)}` : null,
    barOpacity: bar ? getComputedStyle(bar).opacity : null,
    barPointerEvents: bar ? getComputedStyle(bar).pointerEvents : null,
    appRegion: getComputedStyle(b).webkitAppRegion ?? getComputedStyle(b).getPropertyValue('-webkit-app-region'),
    appRegionOfRoot: getComputedStyle(document.querySelector('.photo-preview')).getPropertyValue('-webkit-app-region')
  }
})
log('A 关闭键命中', JSON.stringify(hit))
// 用真实鼠标点一次（Playwright 的 click 会做 actionability 检查，先看裸事件）
await page.click('.photo-preview button[title="关闭（Esc）"]').catch((e) => log('A click 报错', e.message.slice(0, 90)))
await page.waitForTimeout(900)
log('A 点关闭后预览是否还在', await page.evaluate(() => !!document.querySelector('.photo-preview')))
await clean()

// 再用纯 DOM 派发一次，绕开 Playwright 的命中判定
await page.dblclick(`[data-photo-id="${ids[9]}"]`)
await page.waitForTimeout(1200)
const dispatched = await page.evaluate(() => {
  const b = document.querySelector('.photo-preview button[title="关闭（Esc）"]')
  b.click()
  return true
})
await page.waitForTimeout(900)
log('B 直接 el.click() 后预览是否还在', await page.evaluate(() => !!document.querySelector('.photo-preview')))
await clean()

// ── C. 列表布局：单击 / 双击 各是哪一条 ──
const layoutTitle = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('span,button,div')].find((x) => x.children.length === 0 && /^布局：/.test(x.textContent.trim()))
    return el ? el.textContent.trim() : null
  })
log('C 布局初值', await layoutTitle())
// 点布局按钮展开弹层，选「列表」
await page.evaluate(() => {
  const el = [...document.querySelectorAll('span,button,div')].find((x) => x.children.length === 0 && /^布局：/.test(x.textContent.trim()))
  el?.closest('button')?.click()
})
await page.waitForTimeout(700)
const listOpt = await page.evaluate(() => {
  const opts = [...document.querySelectorAll('button,[role=menuitem],label')].filter((x) => /列表/.test(x.textContent))
  return opts.map((o) => o.tagName + ':' + o.textContent.trim().slice(0, 20))
})
log('C 布局弹层里的「列表」项', JSON.stringify(listOpt))
if (listOpt.length) {
  await page.evaluate(() => {
    const o = [...document.querySelectorAll('button,[role=menuitem],label')].find((x) => /列表/.test(x.textContent))
    o.click()
  })
  await page.waitForTimeout(1200)
}
log('C 布局现值', await layoutTitle())
const inList = await page.evaluate(() => !!document.querySelector('.list-row'))
log('C 是否已是列表', inList)

if (inList) {
  const rows = await page.$$eval('.list-row', (els) => els.slice(0, 12).map((e) => e.dataset.photoId))
  for (const [i, rid] of rows.slice(0, 4).entries()) {
    const name = await rowName(rid)
    // 单击
    await page.click(`.list-row[data-photo-id="${rid}"]`)
    await page.waitForTimeout(500)
    const afterClick = await previewName()
    // 双击
    await page.dblclick(`.list-row[data-photo-id="${rid}"]`)
    await page.waitForTimeout(1400)
    const afterDbl = await previewName()
    log(`C 行${i + 1} ${name}`, `单击后预览=${afterClick} | 双击后预览=${afterDbl}`)
    await clean()
  }
}
await clean()
process.exit(0)
