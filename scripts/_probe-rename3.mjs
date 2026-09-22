import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(3000)

for (const ask of [
  '前面加所在文件夹名，再接导入日期，最后 3 位序号',
  '全部改成 素材-{name} 的形式',
  '把文件名里的空格换成下划线'
]) {
  const t0 = Date.now()
  const r = await page.evaluate((q) => window.api.ai.renamePattern(q, ['Screenshot 2026-09-17.png', '旅行 照片 001.jpg']), ask)
  console.log(`「${ask}」 ${Date.now() - t0}ms → ${JSON.stringify(r)}`)
}
console.log('（脚本结束，不关浏览器）')
