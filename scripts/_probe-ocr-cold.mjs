import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const TESS = join(process.env.HOME, 'Library/Application Support/leaf-library/tessdata')
const DIR = '/tmp/leaf-ocr-sample'
mkdirSync(DIR, { recursive: true })
const svg = `<svg width="640" height="200" xmlns="http://www.w3.org/2000/svg">
<rect width="640" height="200" fill="#ffffff"/>
<text x="20" y="80" font-size="42" font-family="sans-serif" fill="#000">季度营收增长说明</text>
<text x="20" y="150" font-size="34" font-family="sans-serif" fill="#000">本季度同比增长百分之十八</text></svg>`
writeFileSync(join(DIR, 'note.svg'), svg)
await sharp(Buffer.from(svg), { density: 200 }).flatten({ background: '#fff' }).png().toFile(join(DIR, 'ocr-sample.png'))
console.log('tessdata 目录存在？', existsSync(TESS))

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(2000)

const t0 = Date.now()
await page.evaluate(async (paths) => await window.api.photos.importPaths(paths), [join(DIR, 'ocr-sample.png')])
let text = ''
let id = ''
for (let i = 0; i < 60; i++) {
  const r = await page.evaluate(async () => {
    const all = await window.api.photos.getAll()
    const p = all.find((x) => x.fileName === 'ocr-sample.png')
    return p ? { id: p.id, thumb: p.thumbStatus, ocr: p.ocrText ?? null } : null
  })
  if (r) {
    id = r.id
    if (r.ocr !== null) {
      text = r.ocr
      break
    }
  }
  await page.waitForTimeout(2000)
}
console.log(`首张 OCR（含语言包下载）耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，识别结果：「${text.replace(/\n/g, ' ')}」`)
console.log('tessdata 内容：', existsSync(TESS) ? readdirSync(TESS).map((f) => `${f} ${(statSync(join(TESS, f)).size / 1048576).toFixed(1)}MB`).join(' | ') : '（仍不存在）')

// 清理临时素材
if (id) {
  await page.evaluate(async (pid) => {
    await window.api.photos.deleteMultiple([pid])
    await window.api.photos.clearRecycleBin()
  }, id)
}
rmSync(DIR, { recursive: true, force: true })
console.log('临时素材与临时文件已清理')
process.exit(0)
