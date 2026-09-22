// 临时探针：入库前先看库的回收站/存储模式（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const r = await page.evaluate(async () => ({
  count: await window.api.photos.getCount(),
  trash: (await window.api.photos.getRecycleBin()).length,
  all: (await window.api.photos.getAll()).length
}))
console.log(JSON.stringify(r))
process.exit(0)
