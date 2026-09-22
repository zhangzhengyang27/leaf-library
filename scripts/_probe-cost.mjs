import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(3000)
const log = (m) => console.log(m)

// ── 1) 上限与重入闸：全用不存在的 id，应当零 API 调用（tokens 为 0 即证）──
const fake = Array.from({ length: 250 }, (_, i) => `no-such-id-${i}`)
const t0 = Date.now()
const capped = await page.evaluate((ids) => window.api.ai.batchMeta(ids), fake)
log(`250 个不存在 id → ${Date.now() - t0}ms ${JSON.stringify(capped)}`)

// ── 2) 真跑：库里所有带 OCR 文字的图 ──
const snapshot = await page.evaluate(async () => {
  const all = await window.api.photos.getAll()
  const targets = all.filter((r) => r.kind === 'image' && (r.ocrText ?? '').trim().length > 4)
  const tagDict = await window.api.tag.getTags()
  return {
    targets: targets.map((t) => ({ id: t.id, name: t.fileName, desc: t.description ?? '', tags: [...t.tags] })),
    tagIds: tagDict.map((t) => t.id)
  }
})
log(`待处理 ${snapshot.targets.length} 张；跑前标签字典 ${snapshot.tagIds.length} 个`)

const t1 = Date.now()
const perCall = []
for (const t of snapshot.targets) {
  const a = Date.now()
  const r = await page.evaluate((id) => window.api.ai.suggestMeta(id), t.id)
  perCall.push({ ms: Date.now() - a, ok: r.ok, tok: r.tokens ?? null })
}
const total = Date.now() - t1
const okN = perCall.filter((p) => p.ok).length
const ms = perCall.map((p) => p.ms).sort((x, y) => x - y)
const prompt = perCall.reduce((s, p) => s + (p.tok?.prompt ?? 0), 0)
const completion = perCall.reduce((s, p) => s + (p.tok?.completion ?? 0), 0)
log(
  `真跑 ${perCall.length} 条：成功 ${okN}，总耗时 ${total}ms，单条 min/中位/max = ${ms[0]}/${ms[Math.floor(ms.length / 2)]}/${ms[ms.length - 1]}ms`
)
log(`token：输入 ${prompt}，输出 ${completion}，合计 ${prompt + completion}；平均输入 ${(prompt / perCall.length).toFixed(0)}/条`)
log(`外推 200 条：约 ${((total / perCall.length) * 200 / 1000).toFixed(0)}s，输入 ~${Math.round((prompt / perCall.length) * 200).toLocaleString()} tokens`)

// ── 3) 落库并还原 ──
const applied = await page.evaluate(async (targets) => {
  const out = []
  for (const t of targets.slice(0, 3)) {
    const r = await window.api.ai.suggestMeta(t.id)
    if (r.ok) {
      if (r.description && !(t.desc ?? '').trim()) await window.api.photos.setDescription(t.id, r.description)
      for (const tag of r.tags ?? []) await window.api.photos.addTagToMultiple([t.id], tag)
      const fresh = await window.api.photos.getById(t.id)
      out.push({ id: t.id, name: t.fileName, desc: fresh.description ?? '', tags: [...fresh.tags] })
    }
  }
  return out
}, snapshot.targets)
log(`落库样例：${applied.map((a) => `${a.name.slice(0, 18)}→描述${a.desc.length}字/${a.tags.length}标签`).join('；')}`)

const restored = await page.evaluate(
  async ({ applied, orig, tagIdsBefore }) => {
    for (const a of applied) {
      const o = orig.find((x) => x.id === a.id)
      if (!o) continue
      if (a.desc !== o.desc) await window.api.photos.setDescription(a.id, o.desc)
      for (const t of a.tags) if (!o.tags.includes(t)) await window.api.photos.removeTag(a.id, t)
    }
    const dict = await window.api.tag.getTags()
    for (const t of dict) if (!tagIdsBefore.includes(t.id)) await window.api.tag.deleteTag(t.id)
    const after = await window.api.tag.getTags()
    const photos = await window.api.photos.getAll()
    return {
      dictCount: after.length,
      leftoverTags: photos.filter((p) => p.tags.length > 0).length,
      leftoverDesc: photos.filter((p) => (p.description ?? '').trim()).length
    }
  },
  { applied, orig: snapshot.targets, tagIdsBefore: snapshot.tagIds }
)
log(`还原后：字典 ${restored.dictCount} 个标签 / 仍带标签的素材 ${restored.leftoverTags} / 仍带描述的素材 ${restored.leftoverDesc}`)
process.exit(0)
