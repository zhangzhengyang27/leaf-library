import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(3000)

// 1) 两条边界：2 个杂字符 OCR vs 21 字 OCR
const pair = await page.evaluate(async () => {
  const all = await window.api.photos.getAll()
  const noise = all.find((r) => r.fileName === 'pexels-photo-886521.jpg')
  const good = all.find((r) => r.fileName === 'Screenshot - 2026-09-17 14.34.09.png')
  const out = {}
  for (const [label, p] of [
    ['noise', noise],
    ['good', good]
  ]) {
    const r = await window.api.ai.suggestMeta(p.id)
    out[label] = { ocr: (p.ocrText ?? '').slice(0, 14), ok: r.ok, error: r.error ?? '', desc: (r.description ?? '').slice(0, 30) }
  }
  return out
})
console.log('边界对照：', JSON.stringify(pair, null, 1))

// 2) 全量批量：看 skipped/failed 分布与 token，跑完还原
const snap = await page.evaluate(async () => {
  const all = await window.api.photos.getAll()
  return {
    ids: all.filter((r) => r.kind === 'image' && (r.ocrText ?? '').trim()).map((r) => r.id),
    dict: (await window.api.tag.getTags()).map((t) => t.id)
  }
})
const t0 = Date.now()
const r = await page.evaluate((ids) => window.api.ai.batchMeta(ids), snap.ids)
console.log(`批量 ${snap.ids.length} 张 → ${Date.now() - t0}ms ${JSON.stringify(r)}`)

const restored = await page.evaluate(async (dictBefore) => {
  const all = await window.api.photos.getAll()
  let descCleared = 0
  let tagsCleared = 0
  for (const p of all) {
    if ((p.description ?? '').trim()) {
      await window.api.photos.setDescription(p.id, '')
      descCleared++
    }
    for (const t of [...p.tags]) {
      await window.api.photos.removeTag(p.id, t)
      tagsCleared++
    }
  }
  for (const t of await window.api.tag.getTags()) {
    if (!dictBefore.includes(t.id)) await window.api.tag.deleteTag(t.id)
  }
  const after = await window.api.photos.getAll()
  return {
    descCleared,
    tagsCleared,
    stillDesc: after.filter((p) => (p.description ?? '').trim()).length,
    stillTags: after.filter((p) => p.tags.length > 0).length,
    dict: (await window.api.tag.getTags()).length,
    assets: after.length
  }
}, snap.dict)
console.log('还原：', JSON.stringify(restored))
process.exit(0)
