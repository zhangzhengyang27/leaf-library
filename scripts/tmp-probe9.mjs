// 临时探针 9：预览逐能力验收（修复后复跑，跑完删除）
import { chromium } from 'playwright'
const results = []
const ok = (name, pass, detail) => {
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`)
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const api = (fn, ...args) =>
  page.evaluate(async ([f, a]) => await new Function('return window.api.' + f)()(...a), [fn, args])
const clean = async () => {
  for (let i = 0; i < 8; i++) {
    const dirty = await page.evaluate(
      () => !!document.querySelector('div.fixed.inset-0.z-\\[1000\\]') || !!document.querySelector('.photo-preview')
    )
    if (!dirty) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(420)
  }
}
await clean()
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await clean()

const cards = await page.$$eval('[data-photo-id]', (e) => e.map((x) => x.dataset.photoId))
const id = cards[0]
const orig = await api('photos.getById', id)

const litStars = () =>
  page.$$eval('div[title="评分"] button', (els) =>
    els.map((e) => (getComputedStyle(e).color.includes('251, 191') ? 1 : 0)).join('')
  )
const favState = () =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('.photo-preview button[title]')].find((x) =>
      x.title.includes('收藏')
    )
    return { title: b.title, color: getComputedStyle(b).color }
  })

await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(800)

// 1 评分：点第 5 星，鼠标移开后仍应显示 5
await page.click('div[title="评分"] button[aria-label="评 5 星"]')
await page.waitForTimeout(500)
await page.mouse.move(600, 800)
await page.waitForTimeout(300)
const lit = await litStars()
const dbRating = (await api('photos.getById', id)).rating
ok('评分回显', lit === '11111' && dbRating === 5, `DOM=${lit} DB=${dbRating}`)

// 2 收藏：图标态 + 点亮色（amber-400 应压过 pv-icon 的 white/70）
await page.click('.photo-preview button[title*="收藏"]')
await page.waitForTimeout(500)
await page.mouse.move(600, 800)
await page.waitForTimeout(250)
const fav = await favState()
const dbFav = (await api('photos.getById', id)).isFavorite
ok('收藏回显', fav.title === '取消收藏' && dbFav === true, `title=${fav.title} DB=${dbFav}`)
ok('收藏点亮色', fav.color === 'rgb(251, 191, 36)', `color=${fav.color}`)

// 3 标签：回车后 chips 立刻出现
const chipTexts = () =>
  page.$$eval('.photo-preview span.rounded-full', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()))
await page.fill('.photo-preview input[list="photo-tag-suggestions"]', '探针标签')
await page.keyboard.press('Enter')
await page.waitForTimeout(700)
const chips = await chipTexts()
const dbTags = (await api('photos.getById', id)).tags
ok('标签回显', chips.some((c) => c.includes('探针标签')) && dbTags.includes('探针标签'), `chips=${JSON.stringify(chips)}`)

// 4 注释：失焦落库
await page.click('.photo-preview input[list="photo-tag-suggestions"]')
await page.locator('.photo-preview input[list="photo-tag-suggestions"]').blur()
await page.click('.photo-preview textarea.pv-note')
await page.fill('.photo-preview textarea.pv-note', '探针注释')
await page.locator('.photo-preview textarea.pv-note').blur()
await page.waitForTimeout(600)
ok('注释落库', (await api('photos.getById', id)).description === '探针注释')

// 5 添加标签小键：size-6 应生效（24px）
const addBtn = await page.$eval('.photo-preview button[title="添加标签（回车）"]', (e) => [e.clientWidth, e.clientHeight])
ok('小键尺寸生效', addBtn[0] === 24 && addBtn[1] === 24, `${addBtn[0]}x${addBtn[1]}`)

// 6 重命名弹窗：输入框自动聚焦 + Enter 提交（同名 no-op）+ 取消按钮可关窗
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
await page.click('div.z-\\[1300\\] >> text=重命名…')
await page.waitForTimeout(700)
const focus = await page.evaluate(() => {
  const m = document.querySelector('div.fixed.inset-0.z-\\[1000\\]')
  const input = m?.querySelector('input')
  return { open: !!m, focused: document.activeElement === input, value: input?.value }
})
ok('重命名弹窗自动聚焦', focus.open && focus.focused, JSON.stringify(focus))
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
ok('Enter 提交可关窗', !(await page.$('div.fixed.inset-0.z-\\[1000\\]')))

await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
await page.click('div.z-\\[1300\\] >> text=重命名…')
await page.waitForTimeout(700)
await page.locator('div.fixed.inset-0.z-\\[1000\\] button', { hasText: '取消' }).first().click()
await page.waitForTimeout(600)
ok('取消按钮可关窗', !(await page.$('div.fixed.inset-0.z-\\[1000\\]')))

// 7 ⌘G 黑白预览
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
const grayOff = await page.$eval('.photo-preview img.select-none', (e) => e.className.includes('grayscale'))
await page.keyboard.press('Meta+KeyG')
await page.waitForTimeout(400)
const grayOn = await page.$eval('.photo-preview img.select-none', (e) => e.className.includes('grayscale'))
await page.keyboard.press('Meta+KeyG')
await page.waitForTimeout(300)
const grayBack = await page.$eval('.photo-preview img.select-none', (e) => e.className.includes('grayscale'))
ok('⌘G 黑白预览', grayOff === false && grayOn === true && grayBack === false, `${grayOff}->${grayOn}->${grayBack}`)

// 8 翻页 + 缩放回归
const nameShown = () => page.$eval('.photo-preview span.truncate', (e) => e.textContent.trim())
const n0 = await nameShown()
await page.click('.photo-preview button[title="下一张（→）"]')
await page.waitForTimeout(700)
const n1 = await nameShown()
ok('翻页', n0 !== n1, `${n0.slice(0, 18)} -> ${n1.slice(0, 18)}`)
const pct = () => page.$eval('.photo-preview button[title="点击回到适应窗口"]', (e) => e.textContent.trim())
const p0 = await pct()
await page.click('.photo-preview button[title="放大（+）"]')
await page.waitForTimeout(300)
ok('缩放', p0 !== await pct(), `${p0} -> ${await pct()}`)

// 9 遗留 kind=file 的 .txt 现在走文本分支
await clean()
const all = await api('photos.getAll')
const txt = all.find((p) => p.kind === 'file' && p.fileName.toLowerCase().endsWith('.txt'))
if (txt) {
  const card = `[data-photo-id="${txt.id}"]`
  if (await page.$(card)) {
    await page.dblclick(card)
    await page.waitForTimeout(1000)
    const branch = await page.evaluate(() => {
      const root = document.querySelector('.photo-preview')
      return { hasPre: !!root?.querySelector('pre'), saysUnsupported: root?.innerText.includes('暂不支持预览') }
    })
    ok('.txt 文本预览', branch.hasPre === true && branch.saysUnsupported === false, JSON.stringify(branch))
  } else ok('.txt 文本预览', false, '该素材不在当前视图')
  await clean()
} else ok('.txt 文本预览', false, '库里没有 kind=file 的 .txt')

// —— 还原 ——
await api('photos.setRating', id, orig.rating)
await api('photos.setDescription', id, orig.description ?? '')
const cur = await api('photos.getById', id)
if (cur.isFavorite !== orig.isFavorite) await api('photos.toggleFavorite', id)
if (cur.tags.includes('探针标签')) await api('photos.removeTag', id, '探针标签')
const back = await api('photos.getById', id)
console.log(`\n还原核对: rating=${back.rating}(原 ${orig.rating}) fav=${back.isFavorite}(原 ${orig.isFavorite}) tags=${JSON.stringify(back.tags)}(原 ${JSON.stringify(orig.tags)}) desc="${back.description ?? ''}"(原 "${orig.description ?? ''}")`)
console.log('\n===== 汇总 =====')
console.log(results.join('\n'))
process.exit(0)
