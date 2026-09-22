// 临时探针：摸清当前界面状态（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const s = await page.evaluate(() => {
  const modal = document.querySelector('div.fixed.inset-0.z-\\[1000\\]')
  const layoutEls = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && /布局/.test(e.textContent || e.getAttribute('title') || ''))
    .slice(0, 5)
    .map((e) => `${e.tagName}[${e.getAttribute('title') ?? ''}] ${e.textContent.trim().slice(0, 30)}`)
  return {
    cards: document.querySelectorAll('[data-photo-id]').length,
    modalOpen: !!modal,
    modalTitle: modal?.querySelector('h3,[class*=title]')?.textContent?.trim().slice(0, 40) ?? null,
    modalText: modal?.innerText.replace(/\s+/g, ' ').slice(0, 140) ?? null,
    previewOpen: !!document.querySelector('.photo-preview'),
    layoutEls,
    body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)
  }
})
log('状态', JSON.stringify(s, null, 1))
const all = await page.evaluate(() => window.api.photos.getAll())
const k = {}
for (const p of all) k[p.kind] = (k[p.kind] || 0) + 1
log('库', `${all.length} 项 ${JSON.stringify(k)}`)
log('样例', all.slice(0, 6).map((p) => p.fileName).join(' | '))
process.exit(0)
