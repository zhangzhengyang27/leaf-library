import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const OUT = '/tmp/leaf-eval'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))

const items = await page.evaluate(async () => {
  const rows = (await window.api.photos.getAll()).filter((r) => r.kind === 'image')
  const out = []
  for (const r of rows) {
    const res = await fetch(`thumb://256/${r.id}`)
    if (!res.ok) continue
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    out.push({ id: r.id, name: r.fileName, b64: btoa(bin) })
  }
  return out
})
await browser.close()

const COLS = 5
const CELL = 256
const LABEL = 22
const rows = Math.ceil(items.length / COLS)
const composites = []
for (let i = 0; i < items.length; i++) {
  const file = join(OUT, `${String(i).padStart(2, '0')}.png`)
  writeFileSync(file, Buffer.from(items[i].b64, 'base64'))
  const x = (i % COLS) * CELL
  const y = Math.floor(i / COLS) * (CELL + LABEL)
  const svg = `<svg width="${CELL}" height="${LABEL}"><text x="4" y="16" font-family="monospace" font-size="14" fill="#fff">#${i} ${items[i].name.slice(0, 22)}</text></svg>`
  composites.push({ input: Buffer.from(svg), left: x, top: y + CELL })
  composites.push({ input: file, left: x, top: y })
}
const canvas = sharp({
  create: {
    width: COLS * CELL,
    height: rows * (CELL + LABEL),
    channels: 3,
    background: { r: 24, g: 24, b: 24 }
  }
})
await canvas.composite(composites).png().toFile(join(OUT, 'montage.png'))
console.log(`#${0}..#${items.length - 1} 共 ${items.length} 张 → ${join(OUT, 'montage.png')}`)
writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify(items.map((it, i) => ({ i, id: it.id, name: it.name })), null, 1)
)
console.log('清单 → /tmp/leaf-eval/index.json')
