import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '/tmp/leaf-ai-sample'
mkdirSync(DIR, { recursive: true })
const FILE = join(DIR, '多肉养护要点.txt')
writeFileSync(
  FILE,
  `多肉浇水与光照要点（自用笔记）

一、浇水遵循「干透浇透」，宁干勿湿。盆土长期潮湿是黑腐的首号原因，
尤其冬季室温低于 8 度时基本断水，两周一次喷雾即可。

二、光照：每天至少 4 小时直射光，否则徒长、叶片摊开。
夏季正午要遮阴，紫外线过强反而晒伤留疤。

三、配土用颗粒土占比六成以上（麦饭石、赤玉土、火山岩），
泥炭只留两成，保证淋水后三分钟之内沥干。

四、常见误区：往叶心积水。水珠在叶心聚焦阳光会灼伤，
也直接诱发黑腐，浇水应该沿盆边浇或者用尖嘴壶插到土面。`,
  'utf-8'
)

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const rows = []

const before = await page.evaluate(async () => (await window.api.photos.getAll()).length)
const imported = await page.evaluate(async (paths) => await window.api.photos.importPaths(paths), [
  FILE
])
rows.push(`INFO  导入返回 ${Array.isArray(imported) ? imported.length : JSON.stringify(imported)}`)

// 等处理管线出缩略图（AI 摘要不依赖缩略图，但素材要先进池）
let photo = null
for (let i = 0; i < 30; i++) {
  photo = await page.evaluate(async (name) => {
    const all = await window.api.photos.getAll()
    return all.find((r) => r.fileName === name) ?? null
  }, '多肉养护要点.txt')
  if (photo && photo.thumbStatus === 1) break
  await page.waitForTimeout(500)
}
if (!photo) {
  rows.push('FAIL  素材没进库')
} else {
  rows.push(`INFO  素材 id=${photo.id.slice(0, 8)} kind=${photo.kind} thumb=${photo.thumbStatus}`)
  const t0 = Date.now()
  const r = await page.evaluate((id) => window.api.ai.suggestMeta(id), photo.id)
  rows.push(`INFO  suggestMeta ${Date.now() - t0}ms`)
  rows.push(JSON.stringify(r, null, 1))
  // 收尾：软删 + 清空回收站（进来之时回收站是 0 条，只会清掉这条）
  const del = await page.evaluate((id) => window.api.photos.deleteMultiple([id]), photo.id)
  rows.push(`INFO  软删返回 ${JSON.stringify(del)?.slice(0, 60)}`)
  await page.waitForTimeout(600)
  const purged = await page.evaluate(() => window.api.photos.clearRecycleBin())
  rows.push(`INFO  回收站清理 ${JSON.stringify(purged)}`)
}
const after = await page.evaluate(async () => (await window.api.photos.getAll()).length)
rows.push(`${before === after ? 'PASS' : 'FAIL'}  库已恢复原状  ${before} → ${after}`)
rmSync(DIR, { recursive: true, force: true })
console.log(rows.join('\n'))
await browser.close()
