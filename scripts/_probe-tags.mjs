import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(2500)

const TEMP = ['旅行照片', '旅行', '截图', 'screenshot']
const created = await page.evaluate(async (names) => {
  const out = []
  for (const n of names) {
    const t = await window.api.tag.addTag(n)
    if (t) out.push({ id: t.id, name: t.name })
  }
  return out
}, TEMP)
console.log('临时标签：', created.map((c) => `${c.name}(${c.id.slice(0, 4)})`).join(' '))

const t0 = Date.now()
const r = await page.evaluate(() => window.api.ai.tagStructure())
console.log(`tagStructure ${Date.now() - t0}ms →`, JSON.stringify(r, null, 1))

const cleaned = await page.evaluate(async (ids) => {
  for (const id of ids) await window.api.tag.deleteTag(id)
  return (await window.api.tag.getTags()).map((t) => t.name)
}, created.map((c) => c.id))
console.log('删除临时标签后字典：', JSON.stringify(cleaned))
process.exit(0)
