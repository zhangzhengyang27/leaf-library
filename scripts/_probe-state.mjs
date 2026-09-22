import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(2000)
const s = await page.evaluate(async () => {
  const all = await window.api.photos.getAll()
  return {
    withDesc: all
      .filter((r) => (r.description ?? '').trim())
      .map((r) => ({ id: r.id.slice(0, 8), name: r.fileName, desc: r.description })),
    withTags: all
      .filter((r) => r.tags.length > 0)
      .map((r) => ({ name: r.fileName, tags: r.tags })),
    dict: (await window.api.tag.getTags()).map((t) => `${t.name}(u=${t.usageCount ?? 0})`)
  }
})
console.log(JSON.stringify(s, null, 1))
process.exit(0)
