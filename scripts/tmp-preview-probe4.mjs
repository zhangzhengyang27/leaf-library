// 临时探针 4：⋯ 菜单动作 + 边缘翻页键 + 素材类型分布（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const api = (fn, ...args) =>
  page.evaluate(async ([f, a]) => await new Function('return window.api.' + f)()(...a), [fn, args])

await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// 库里都有哪些类型，决定哪些预览分支能真跑
const all = await api('photos.getAll')
const kinds = {}
for (const p of all) kinds[p.kind] = (kinds[p.kind] || 0) + 1
log('total', `${all.length} kinds=${JSON.stringify(kinds)}`)
const exts = {}
for (const p of all) {
  const e = p.fileName.slice(p.fileName.lastIndexOf('.') + 1).toLowerCase()
  exts[e] = (exts[e] || 0) + 1
}
log('exts', JSON.stringify(exts))

const cards = await page.$$eval('[data-photo-id]', (e) => e.map((x) => x.dataset.photoId))
const id = cards[0]
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(700)

// —— 边缘悬停翻页键 ——
const edge = await page.evaluate(() => {
  const strips = [...document.querySelectorAll('.photo-preview div.group')]
  return strips.map((s) => {
    const btn = s.querySelector('button.pv-edge')
    const r = s.getBoundingClientRect()
    return {
      present: !!btn,
      stripRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      opacity: btn ? getComputedStyle(btn).opacity : null,
      pe: btn ? getComputedStyle(btn).pointerEvents : null
    }
  })
})
log('edge-strips', JSON.stringify(edge))
// 真点右侧边缘键
const before = await page.$eval('.photo-preview span.truncate', (e) => e.textContent.trim())
await page.hover('.photo-preview div.group:last-of-type button.pv-edge').catch((e) => log('hover-fail', e.message.slice(0, 80)))
await page.waitForTimeout(300)
await page.click('.photo-preview div.group:last-of-type button.pv-edge').catch((e) => log('click-fail', e.message.slice(0, 80)))
await page.waitForTimeout(700)
const after = await page.$eval('.photo-preview span.truncate', (e) => e.textContent.trim())
log('edge-next', `${before} -> ${after} = ${before !== after}`)

// —— ⋯ 菜单：重命名弹窗是否浮在预览之上 ——
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
await page.click('div.z-\\[1300\\] >> text=重命名…')
await page.waitForTimeout(500)
const prompt = await page.evaluate(() => {
  const m = document.querySelector('div.fixed.inset-0.z-\\[1000\\]')
  if (!m) return { open: false }
  const input = m.querySelector('input')
  const r = input?.getBoundingClientRect()
  return {
    open: true,
    title: m.querySelector('h3')?.textContent?.trim(),
    value: input?.value,
    focused: document.activeElement === input,
    visibleAtCenter: r ? !!(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('input')) : false
  }
})
log('rename-prompt', JSON.stringify(prompt))
if (prompt.open) {
  await page.click('div.z-\\[1000\\] button:has-text("取消")')
  await page.waitForTimeout(300)
  log('preview-still-open-after-cancel', String(await page.$('.photo-preview') !== null))
}

// —— 复制文件路径（看 toast）——
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
await page.click('div.z-\\[1300\\] >> text=复制文件路径')
await page.waitForTimeout(700)
const toastText = await page.evaluate(() =>
  [...document.querySelectorAll('[role="status"], .fixed') ]
    .map((e) => e.textContent?.trim())
    .filter((t) => t && t.length < 60)
    .slice(-4)
)
log('copy-path-toast', JSON.stringify(toastText))

await page.keyboard.press('Escape')
await page.waitForTimeout(300)
log('final-preview-open', String(await page.$('.photo-preview') !== null))
process.exit(0)
