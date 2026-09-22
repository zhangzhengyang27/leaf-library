import { chromium } from 'playwright'

const AI_TAGS = ['安装', '截图', '拖放', '文件导入', '浏览器扩展', '拖拽', '提示', '文件添加', '界面']
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))

const r = await page.evaluate(async (aiTags) => {
  const all = await window.api.photos.getAll()
  const b = all.find((x) => x.fileName === 'Screenshot - 2026-09-17 13.29.14.png')
  if (b) await window.api.photos.setDescription(b.id, '')
  // 标签字典里是否有被清空引用后残留的空标签
  const dict = await window.api.photos.getAllTags()
  const stillUsed = new Set(all.flatMap((p) => p.tags))
  const orphans = dict.filter((t) => aiTags.includes(t) && !stillUsed.has(t))
  for (const name of orphans) {
    const rows = await window.api.tag.getTags()
    const row = rows.find((x) => x.name === name)
    if (row) await window.api.tag.deleteTag(row.id)
  }
  const after = await window.api.photos.getAllTags()
  return {
    bDesc: (await window.api.photos.getById(b.id)).description ?? '',
    orphans,
    dictBefore: dict.length,
    dictAfter: after.length
  }
}, AI_TAGS)
console.log(JSON.stringify(r, null, 1))
await browser.close()
