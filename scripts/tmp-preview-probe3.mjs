// 临时探针 3：区分 hover 干扰与快照陈旧（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const api = (fn, ...args) =>
  page.evaluate(async ([f, a]) => await new Function('return window.api.' + f)()(...a), [fn, args])
const stars = () =>
  page.$$eval('div[title="评分"] button', (els) =>
    els.map((e) => (getComputedStyle(e).color.includes('251, 191') ? 1 : 0)).join('')
  )

await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.mouse.move(5, 5)
const cards = await page.$$eval('[data-photo-id]', (e) => e.map((x) => x.dataset.photoId))
const id = cards[0]
const db0 = await api('photos.getById', id)
log('db', `rating=${db0.rating} fav=${db0.isFavorite}`)
// 用 API 直接改库（绕过渲染层 store），再看渲染层池里的值
await api('photos.setRating', id, 2)
await page.waitForTimeout(400)
await page.mouse.move(5, 5)
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(600)
await page.mouse.move(5, 5)
await page.waitForTimeout(200)
log('stars-on-open(db=2,渲染层未刷新)', await stars())
// 走 UI 评分：点第 5 颗，鼠标停在星上 → 应显示 5；移开 → 真值 5 还是旧值？
await page.click('div[title="评分"] button[aria-label="评 5 星"]')
await page.waitForTimeout(400)
log('stars-hovering', await stars())
await page.mouse.move(5, 5)
await page.waitForTimeout(300)
log('stars-mouseout(UI评分后, 期望11111)', await stars())
log('db-after-ui-rating', (await api('photos.getById', id)).rating)
// 收藏：点亮色 + 图标资产
const favInfo = async () =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('.photo-preview button[title]')].find((x) =>
      x.title.includes('收藏')
    )
    const icon = b.querySelector('span.eagle-icon')
    return {
      title: b.title,
      color: getComputedStyle(b).color,
      mask: (getComputedStyle(icon).maskImage || '').slice(-40)
    }
  })
log('fav-before', JSON.stringify(await favInfo()))
await page.click('.photo-preview button[title*="收藏"]')
await page.waitForTimeout(500)
log('fav-after', JSON.stringify(await favInfo()))
log('db-fav', (await api('photos.getById', id)).isFavorite)
// 还原
await api('photos.setRating', id, db0.rating)
const cur = await api('photos.getById', id)
if (cur.isFavorite !== db0.isFavorite) await api('photos.toggleFavorite', id)
log('restored', JSON.stringify(await api('photos.getById', id).then((p) => ({ r: p.rating, fav: p.isFavorite }))))
process.exit(0)
