import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(1500)

// 跑前事实（_probe-cost 日志记录）：标签字典 0 个、这三张描述均为空、无标签
const r = await page.evaluate(async () => {
  const all = await window.api.photos.getAll()
  const touched = all.filter((p) => (p.description ?? '').trim() || p.tags.length > 0)
  for (const p of touched) {
    for (const t of [...p.tags]) await window.api.photos.removeTag(p.id, t)
    if ((p.description ?? '').trim()) await window.api.photos.setDescription(p.id, '')
  }
  const dict = await window.api.tag.getTags()
  for (const t of dict) await window.api.tag.deleteTag(t.id)
  const after = await window.api.photos.getAll()
  return {
    touched: touched.map((p) => p.fileName),
    dictDeleted: dict.length,
    stillWithDesc: after.filter((p) => (p.description ?? '').trim()).length,
    stillWithTagged: after.filter((p) => p.tags.length > 0).length,
    dictNow: (await window.api.tag.getTags()).length,
    assets: after.length
  }
})
console.log(JSON.stringify(r, null, 1))
process.exit(0)
