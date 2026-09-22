import { chromium } from 'playwright'

const AI_TAGS = ['安装', '截图', '拖放', '文件导入', '浏览器扩展', '拖拽', '提示', '文件添加', '界面']
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(1500)

const before = await page.evaluate(async () => {
  const tags = await window.api.tag.getTags()
  const photos = await window.api.photos.getAll()
  const used = new Set(photos.flatMap((p) => p.tags))
  return tags.map((t) => ({ id: t.id, name: t.name, usage: t.usageCount ?? 0, linked: used.has(t.name) }))
})
console.log('字典现状：')
for (const t of before)
  console.log(`  ${t.name}  usageCount=${t.usage}  被素材引用=${t.linked}`)

const doomed = before.filter((t) => AI_TAGS.includes(t.name) && t.usage === 0 && !t.linked)
console.log('\n将删除（AI 建的空标签）：', doomed.map((d) => d.name).join('、') || '（无）')
const after = await page.evaluate(async (ids) => {
  for (const id of ids) await window.api.tag.deleteTag(id)
  const tags = await window.api.tag.getTags()
  const photos = await window.api.photos.getAll()
  const used = new Set(photos.flatMap((p) => p.tags))
  return tags.map((t) => `${t.name}(u=${t.usageCount ?? 0}${used.has(t.name) ? ',引用中' : ''})`)
}, doomed.map((d) => d.id))
console.log('删除后字典：', JSON.stringify(after))
process.exit(0)
