// 临时探针 8：kind=file 的文本素材落到哪个预览分支（跑完删除）
import { chromium } from 'playwright'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const all = await page.evaluate(() => window.api.photos.getAll())
const files = all.filter((p) => p.kind === 'file')
log('file-kind', JSON.stringify(files.map((p) => ({ n: p.fileName, size: p.fileSize, thumb: p.thumbStatus }))))
for (let i = 0; i < 6; i++) {
  const dirty = await page.evaluate(() => !!document.querySelector('.photo-preview'))
  if (!dirty) break
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}
for (const p of files) {
  const card = `[data-photo-id="${p.id}"]`
  const exists = await page.$(card)
  if (!exists) {
    log(`skip ${p.fileName}`, '当前视图里没有这张卡')
    continue
  }
  await page.dblclick(card)
  await page.waitForTimeout(900)
  const branch = await page.evaluate(() => {
    const root = document.querySelector('.photo-preview')
    if (!root) return '(预览没开)'
    const txt = root.innerText.replace(/\s+/g, ' ').slice(0, 160)
    return { hasPre: !!root.querySelector('pre'), hasIframe: !!root.querySelector('iframe'), hasImg: !!root.querySelector('img.cursor-zoom-in, img.select-none'), text: txt }
  })
  log(`branch ${p.fileName}`, JSON.stringify(branch))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}
process.exit(0)
