import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const out = []

const st = async () => page.evaluate(() => window.api.photos.ocrStatus())
const pendingTotal = async () => (await st()).pendingTotal

out.push(`启用前：${JSON.stringify(await st())}`)
out.push(`setOcrEnabled → ${JSON.stringify(await page.evaluate(() => window.api.photos.setOcrEnabled(true)))}`)
out.push(`runOcr → ${JSON.stringify(await page.evaluate(() => window.api.photos.runOcr()))}`)

const t0 = Date.now()
let last = -1
for (let i = 0; i < 240; i++) {
  const p = await pendingTotal()
  if (p !== last) {
    out.push(`  待识别 ${p}  （${((Date.now() - t0) / 1000).toFixed(0)}s）`)
    last = p
  }
  if (p === 0) break
  await page.waitForTimeout(3000)
}
out.push(`OCR 跑完用时 ${((Date.now() - t0) / 1000).toFixed(0)}s，最终 ${JSON.stringify(await st())}`)

// 真实副作用：ocr_text 落库 + 进全文索引
const withText = await page.evaluate(async () => {
  const all = await window.api.photos.getAll()
  return all
    .filter((r) => r.kind === 'image' && (r.ocrText ?? '').trim().length > 4)
    .slice(0, 3)
    .map((r) => ({ name: r.fileName, text: r.ocrText.trim().slice(0, 70) }))
})
out.push(`带 OCR 文字的图片 ${withText.length} 张（示例）：`)
for (const w of withText) out.push(`  ${w.name} → 「${w.text.replace(/\n/g, ' ')}」`)

if (withText.length > 0) {
  const word = withText[0].text
    .split(/[\s，。：:、（）()【】\[\]#\-]+/)
    .map((s) => s.trim())
    .find((s) => s.length >= 4)
  if (word) {
    const hits = await page.evaluate(async (q) => {
      const r = await window.api.photos.search(q)
      return (Array.isArray(r) ? r : []).slice(0, 5).map((p) => p.fileName)
    }, word)
    out.push(`用 OCR 里的词「${word}」搜全文 → ${hits.length} 命中：${hits.join(' | ')}`)
  }
}
console.log(out.join('\n'))
await browser.close()
