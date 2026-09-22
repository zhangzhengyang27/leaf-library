// 临时探针 2：预览外框的样式优先级 + 收藏态真机计算值（跑完删除）
import { chromium } from 'playwright'

const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const api = (fn, ...args) =>
  page.evaluate(
    async ([f, a]) => await new Function('return window.api.' + f)()(...a),
    [fn, args]
  )

await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const cards = await page.$$eval('[data-photo-id]', (e) => e.map((x) => x.dataset.photoId))
const id = cards[0]
const before = await api('photos.getById', id)
log('target', `${before.fileName} fav=${before.isFavorite}`)

// 先把库里置为已收藏，再打开预览（快照即真值，排除上一轮发现的陈旧问题干扰）
if (!before.isFavorite) await api('photos.toggleFavorite', id)
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(800)

const probe = await page.evaluate(() => {
  const q = (sel) => document.querySelector(sel)
  const pick = (el, props) => {
    if (!el) return null
    const cs = getComputedStyle(el)
    const o = {}
    for (const p of props) o[p] = cs[p]
    return o
  }
  const favBtn = [...document.querySelectorAll('.photo-preview button[title]')].find(
    (b) => b.title === '取消收藏'
  )
  const favIcon = favBtn?.querySelector('span.eagle-icon')
  const addTagBtn = q('.photo-preview button[title="添加标签（回车）"]')
  const slideBtn = [...document.querySelectorAll('.photo-preview button[title]')].find((b) =>
    b.title.includes('幻灯片')
  )
  const closeBtn = q('.photo-preview button[title="关闭（Esc）"]')
  return {
    favTitle: favBtn?.title ?? '(未找到「取消收藏」)',
    favColor: pick(favBtn, ['color']),
    favIconBg: favIcon ? getComputedStyle(favIcon).backgroundColor : null,
    favIconMask: favIcon ? getComputedStyle(favIcon).maskImage.slice(0, 60) : null,
    addTagBox: pick(addTagBtn, ['width', 'height']),
    closeBox: pick(closeBtn, ['width', 'height']),
    slideColor: pick(slideBtn, ['color', 'backgroundColor'])
  }
})
log('fav-title', probe.favTitle)
log('fav-color', JSON.stringify(probe.favColor) + '  (amber-400 应为 rgb(251, 191, 36))')
log('fav-icon-bg', probe.favIconBg)
log('fav-icon-mask', probe.favIconMask)
log('addTag-btn-box', JSON.stringify(probe.addTagBox) + '  (期望 size-6 = 24px)')
log('close-btn-box', JSON.stringify(probe.closeBox) + '  (pv-icon = 32px)')

// 幻灯片激活态颜色
await page.click('.photo-preview button[title*="幻灯片"]')
await page.waitForTimeout(200)
const slide = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.photo-preview button[title]')].find((x) =>
    x.title.includes('停止幻灯片')
  )
  if (!b) return { title: '(未激活)' }
  const cs = getComputedStyle(b)
  return { title: b.title, color: cs.color, bg: cs.backgroundColor }
})
log('slideshow-active', JSON.stringify(slide))
await page.click('.photo-preview button[title*="停止幻灯片"]').catch(() => {})

// 评分点亮态（真值驱动，不经 hover）
const rated = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('div[title="评分"] button')]
  return btns.map((b) => getComputedStyle(b).color)
})
log('stars-colors', JSON.stringify(rated))
await api('photos.setRating', id, 5)
await page.waitForTimeout(400)
log('stars-after-api-set5(snapstale?)', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('div[title="评分"] button')].map((b) => getComputedStyle(b).color))))

// 还原
const now = await api('photos.getById', id)
if (now.isFavorite !== before.isFavorite) await api('photos.toggleFavorite', id)
await api('photos.setRating', id, before.rating)
log('restored', JSON.stringify(await api('photos.getById', id).then((p) => ({ fav: p.isFavorite, r: p.rating }))))
process.exit(0)
