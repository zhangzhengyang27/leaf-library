import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const pages = browser.contexts()[0].pages()
console.log('pages:', pages.map((p) => p.url().slice(0, 45)))
const page = pages.find((p) => /localhost:51\d\d/.test(p.url()))
if (!page) process.exit(1)

const withBudget = (label, p, ms) =>
  Promise.race([
    p.then((v) => ({ label, ok: true, v })),
    new Promise((res) => setTimeout(() => res({ label, ok: false, v: `超时 ${ms}ms` }), ms))
  ])

console.log(
  await withBudget(
    'trivial',
    page.evaluate(() => ({ alive: true, aiKeys: Object.keys(window.api?.ai ?? {}) })),
    6000
  )
)
console.log(
  await withBudget(
    'config',
    page.evaluate(() => window.api.ai.config()),
    6000
  )
)
console.log(
  await withBudget(
    'renamePattern',
    page.evaluate(() => window.api.ai.renamePattern('前面加文件夹名和 3 位序号', ['a.png'])),
    25000
  )
)
process.exit(0)
