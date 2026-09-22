import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
console.log(
  '重新入队：',
  JSON.stringify(await page.evaluate(() => window.api.photos.runOcr()))
)
const t0 = Date.now()
for (;;) {
  const st = await page.evaluate(() => window.api.photos.ocrStatus())
  if (st.pendingTotal === 0) {
    console.log(`完成，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(st))
    break
  }
  if (Date.now() - t0 > 400000) {
    console.log('超时仍未清零：', JSON.stringify(st))
    break
  }
  await new Promise((r) => setTimeout(r, 5000))
}
const lens = await page.evaluate(async () => {
  const a = await window.api.photos.getAll()
  return a.filter((r) => r.kind === 'image').map((r) => (r.ocrText ?? '').trim().length)
})
console.log(
  `有文字的图 ${lens.filter((l) => l > 4).length}/${lens.length}；识别过但无文字 ${lens.filter((l) => l === 0).length}`
)
await browser.close()
