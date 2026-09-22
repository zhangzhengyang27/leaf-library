import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
let page
for (let i = 0; i < 40; i++) {
  page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
  if (page) break
  await new Promise((r) => setTimeout(r, 500))
}
if (!page) {
  console.log('NO RENDERER PAGE')
  process.exit(1)
}
await page.waitForTimeout(2500)

const boot = await page.evaluate(async () => {
  const [available, status] = await Promise.all([
    window.api.photos.aiAvailable(),
    window.api.photos.embeddingStatus()
  ])
  return { available, status }
})
console.log(`aiAvailable = ${boot.available}   status = ${JSON.stringify(boot.status)}`)

const QUERIES = ['叶子 植物', '山 风景', '屏幕截图 界面', '城市 建筑', '猫', '美食 食物']
for (const q of QUERIES) {
  const t0 = Date.now()
  const hits = await page.evaluate((query) => window.api.photos.semanticSearch(query, 5), q)
  const line = hits
    .map((h) => `${h.photo.fileName.replace(/\.[^.]+$/, '').slice(0, 22)}(${h.score.toFixed(3)})`)
    .join('  ')
  console.log(`「${q}」 ${Date.now() - t0}ms  ${hits.length} 命中`)
  if (line) console.log(`    ${line}`)
}

// 全量分数分布（判 0.2 阈值是否合适）：取一个宽查询，打印 top10 + 最低分
const dist = await page.evaluate(() => window.api.photos.semanticSearch('风景 自然 照片', 200), [])
const scores = dist.map((d) => d.score)
console.log(
  `分布「风景 自然 照片」：命中 ${scores.length}/23  max=${Math.max(...scores).toFixed(3)} median=${scores.sort((a, b) => b - a)[Math.floor(scores.length / 2)].toFixed(3)} min=${Math.min(...scores).toFixed(3)}`
)

// 之前被门禁挡住的打标路径
const one = await page.evaluate(async () => {
  const rows = await window.api.photos.getAll()
  const img = rows.find((r) => r.kind === 'image')
  const tags = await window.api.photos.suggestTags(img.id)
  return { name: img.fileName, tags: tags.slice(0, 5).map((t) => `${t.tag}:${t.score.toFixed(3)}`) }
})
console.log(`suggestTags(${one.name}) →`, one.tags.join('  ') || '（空）')

await browser.close()
