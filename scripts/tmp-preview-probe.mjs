// 临时探针：预览弹窗逐能力真跑（跑完删除）
import { chromium } from 'playwright'

const out = []
const log = (k, v) => {
  out.push(`${k}: ${v}`)
  console.log(`${k}: ${v}`)
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const ctx = browser.contexts()[0]
const pages = ctx.pages()
const page = pages.find((p) => /localhost:51\d\d/.test(p.url()))
if (!page) {
  console.log('NO PAGE', pages.map((p) => p.url()))
  process.exit(1)
}
const errs = []
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 200)}`)
})

const api = (fn, ...args) =>
  page.evaluate(
    async ([f, a]) => {
      // eslint-disable-next-line no-new-func
      const get = new Function('return window.api.' + f)
      return await get()(...a)
    },
    [fn, args]
  )

// 先关掉可能已开的预览
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

const cards = await page.$$eval('[data-photo-id]', (els) => els.map((e) => e.dataset.photoId))
log('cards-in-dom', cards.length)
if (!cards.length) {
  console.log(out.join('\n'))
  process.exit(1)
}
const id = cards[0]
const before = await api('photos.getById', id)
log('target', `${before.fileName} rating=${before.rating} fav=${before.isFavorite} tags=${JSON.stringify(before.tags)} desc="${before.description ?? ''}"`)

// 打开预览
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(700)
log('preview-open', String(await page.$('.photo-preview') !== null))

const starLit = () =>
  page.$$eval('div[title="评分"] button', (els) => els.filter((e) => e.className.includes('text-amber-400')).length)
const favOn = () =>
  page.$$eval('.photo-preview button[title]', (els) => els.some((e) => e.title === '取消收藏' && e.className.includes('text-amber-400')))

// —— 1 评分 ——
const want = before.rating === 4 ? 3 : 4
await page.click(`div[title="评分"] button[aria-label="评 ${want} 星"]`)
await page.waitForTimeout(500)
const afterRating = await api('photos.getById', id)
log('rating/db', afterRating.rating)
log('rating/dom-lit', await starLit())
log('rating/expected-lit', want)
// 移开鼠标再量（hover 会点亮）
await page.mouse.move(400, 700)
await page.waitForTimeout(200)
log('rating/dom-lit-after-mouseout', await starLit())

// —— 2 收藏 ——
await page.click('.photo-preview button[title="收藏"], .photo-preview button[title="取消收藏"]')
await page.waitForTimeout(500)
const afterFav = await api('photos.getById', id)
log('favorite/db', afterFav.isFavorite)
log('favorite/dom-shows-on', await favOn())

// —— 3 标签 ——
const chips = () => page.$$eval('.photo-preview span.flex.shrink-0.items-center.gap-1', (e) => e.length)
const tagCountBefore = (await api('photos.getById', id)).tags.length
await page.fill('.photo-preview input[list="photo-tag-suggestions"]', '探针临时标签')
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
const afterTags = (await api('photos.getById', id)).tags
log('tag/db-has', afterTags.includes('探针临时标签'))
log('tag/db-count', `${tagCountBefore} -> ${afterTags.length}`)
log('tag/dom-chips', `${await chips()}`)

// —— 4 注释 ——
await page.click('.photo-preview textarea.pv-note')
await page.fill('.photo-preview textarea.pv-note', '探针注释文本')
await page.locator('.photo-preview textarea.pv-note').blur()
await page.waitForTimeout(600)
log('description/db', JSON.stringify((await api('photos.getById', id)).description))

// —— 5 翻页 ——
await page.mouse.move(400, 700)
await page.waitForTimeout(200)
const nameShown = () => page.$eval('.photo-preview span.truncate', (e) => e.textContent.trim())
const n0 = await nameShown()
await page.click('.photo-preview button[title="下一张（→）"]')
await page.waitForTimeout(700)
const n1 = await nameShown()
log('next/changed', `${n0} -> ${n1} = ${n0 !== n1}`)
await page.click('.photo-preview button[title="上一张（←）"]')
await page.waitForTimeout(600)
log('prev/changed', `${n1} -> ${await nameShown()}`)

// —— 6 缩放 HUD ——
const pct = () => page.$eval('.photo-preview button[title="点击回到适应窗口"]', (e) => e.textContent.trim())
let pctBefore = ''
try {
  pctBefore = await pct()
  await page.click('.photo-preview button[title="放大（+）"]')
  await page.waitForTimeout(300)
  log('zoom', `${pctBefore} -> ${await pct()}`)
  await page.click('.photo-preview button[title="适应窗口（0）"]')
} catch (e) {
  log('zoom', 'no-hud ' + e.message.slice(0, 60))
}

// —— 7 详情面板 ——
await page.mouse.move(400, 700)
await page.waitForTimeout(200)
await page.click('.photo-preview button:has-text("详情")')
await page.waitForTimeout(300)
log('meta-panel-visible', String(await page.$$eval('.photo-preview .grid.grid-cols-2', (e) => e.length)))

// —— 8 ⋯ 菜单 ——
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
const menuItems = await page.$$eval('div.z-\\[1300\\] button, div.z-\\[1300\\] li', (els) =>
  els.map((e) => e.textContent.trim()).filter(Boolean)
)
log('more-menu-items', JSON.stringify(menuItems))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// —— 9 幻灯片 ——
await page.mouse.move(400, 700)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="幻灯片"]')
const s0 = await nameShown()
await page.waitForTimeout(3600)
const s1 = await nameShown()
log('slideshow/advanced', `${s0} -> ${s1} = ${s0 !== s1}`)
await page.click('.photo-preview button[title*="停止幻灯片"]').catch(() => {})
await page.waitForTimeout(300)

// —— 10 简报模式 F5 ——
await page.keyboard.press('F5')
await page.waitForTimeout(500)
log('brief-mode', String(await page.$$eval('.photo-preview', (e) => e.length)) + ' toolbar-hidden=' + String(await page.$('div[title="评分"]') === null))
await page.keyboard.press('F5')
await page.waitForTimeout(400)

// —— 还原 ——
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await api('photos.setRating', id, before.rating)
const cur = await api('photos.getById', id)
if (cur.isFavorite !== before.isFavorite) await api('photos.toggleFavorite', id)
if (cur.tags.includes('探针临时标签')) await api('photos.removeTag', id, '探针临时标签')
await api('photos.setDescription', id, before.description ?? '')
const restored = await api('photos.getById', id)
log(
  'restored',
  `rating=${restored.rating} fav=${restored.isFavorite} tags=${JSON.stringify(restored.tags)} desc="${restored.description ?? ''}"`
)
log('errors', errs.length ? JSON.stringify(errs.slice(0, 12)) : 'none')
process.exit(0)
