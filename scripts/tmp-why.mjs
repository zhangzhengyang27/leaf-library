// 临时探针：为什么卡片找不到（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const pages = browser.contexts()[0].pages()
console.log('pages:', pages.map((p) => p.url()))
const page = pages.find((p) => /localhost:51\d\d/.test(p.url()))
const r = await page.evaluate(() => ({
  cards: document.querySelectorAll('[data-photo-id]').length,
  titles: [...document.querySelectorAll('h1,h2,[class*=title]')].slice(0, 6).map((e) => e.textContent.trim().slice(0, 30)),
  body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
  tabText: [...document.querySelectorAll('[class*=tab]')].slice(0, 8).map((e) => e.textContent.trim().slice(0, 24))
}))
console.log(JSON.stringify(r, null, 1))
process.exit(0)
