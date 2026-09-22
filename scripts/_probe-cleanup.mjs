import { chromium } from 'playwright'

const ADDED = {
  'Screenshot - 2026-09-17 14.34.09.png': ['安装', '截图', '拖放', '文件导入', '浏览器扩展'],
  'Screenshot - 2026-09-17 13.29.14.png': ['截图', '拖拽', '提示', '文件添加', '界面']
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))

const show = async (label) => {
  const rows = await page.evaluate(async (names) => {
    const all = await window.api.photos.getAll()
    return all
      .filter((r) => names.includes(r.fileName))
      .map((r) => ({ name: r.fileName, desc: r.description ?? '', tags: [...r.tags] }))
  }, Object.keys(ADDED))
  console.log(label)
  for (const r of rows) console.log(`  ${r.name} | 描述「${r.desc}」| 标签[${r.tags.join('、')}]`)
  return rows
}

await show('—— 当前状态 ——')

const fixed = await page.evaluate(async (added) => {
  const all = await window.api.photos.getAll()
  const out = []
  for (const [name, tags] of Object.entries(added)) {
    const p = all.find((r) => r.fileName === name)
    if (!p) continue
    for (const t of tags) {
      if (p.tags.includes(t)) await window.api.photos.removeTag(p.id, t)
    }
    const fresh = await window.api.photos.getById(p.id)
    out.push({ name, desc: fresh.description ?? '', tags: [...fresh.tags] })
  }
  return out
}, ADDED)
console.log('—— 移除 AI 标签后 ——')
for (const r of fixed) console.log(`  ${r.name} | 描述「${r.desc}」| 标签[${r.tags.join('、')}]`)

// 描述：两条都是探针跑批量前为空的截图（A 已被还原步骤写回原值），
// 非空且明显是模型摘要的那条清回空
const needClear = fixed.filter((r) => r.desc.length > 4).map((r) => r.name)
console.log('仍带描述、需确认是否清回的：', needClear.join(' | ') || '（无）')
await browser.close()
