import { chromium } from 'playwright'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const MODELS = join(homedir(), 'Library/Application Support/leaf-library/models')

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(2000)

const files = []
const walk = (d, pre = '') => {
  if (!existsSync(d)) return
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p, `${pre}${e.name}/`)
    else files.push(`${(statSync(p).size / 1048576).toFixed(1)}MB ${pre}${e.name}`)
  }
}
walk(MODELS)
console.log(`aiAvailable = ${await page.evaluate(() => window.api.photos.aiAvailable())}`)
console.log(
  'status =',
  JSON.stringify(await page.evaluate(() => window.api.photos.embeddingStatus()))
)
console.log(`userData/models（${files.length} 个文件）：\n  ` + files.join('\n  '))

const one = await page.evaluate(async () => {
  const rows = await window.api.photos.getAll()
  const img = rows.find((r) => r.kind === 'image')
  const t0 = performance.now()
  const tags = await window.api.photos.suggestTags(img.id)
  return { name: img.fileName, ms: Math.round(performance.now() - t0), tags: tags.slice(0, 4).map((t) => `${t.tag} ${t.score.toFixed(3)}`) }
})
console.log(`\nsuggestTags（走视觉塔，冷加载）${one.ms}ms  ${one.name}`)
for (const t of one.tags) console.log(`   ${t}`)

const ZH = ['叶子 植物', '山 风景', '猫', '美食 食物']
const EN = [
  'a photo of green leaves',
  'a photo of mountains',
  'a photo of a cat',
  'a photo of food'
]
for (const [label, list] of [['中文', ZH], ['英文', EN]]) {
  console.log(`\n—— ${label}查询（top3 / 全 23 条中 ≥0.2 的条数）——`)
  for (const q of list) {
    const all = await page.evaluate((query) => window.api.photos.semanticSearch(query, 200), q)
    const top = all.slice(0, 3).map((h) => `${h.photo.fileName.slice(0, 20)}(${h.score.toFixed(3)})`)
    console.log(`   「${q}」 ${all.length} 命中  ${top.join('  ')}`)
  }
}
await browser.close()
