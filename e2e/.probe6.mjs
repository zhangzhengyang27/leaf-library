import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const MAIN_ENTRY = join(process.cwd(), 'out/main/index.js')
const userDataDir = mkdtempSync(join(tmpdir(), 'leaf-probe-'))
const libraryDir = mkdtempSync(join(tmpdir(), 'leaf-probe-lib-'))
const srcDir = mkdtempSync(join(tmpdir(), 'leaf-probe-src-'))
mkdirSync(join(libraryDir, 'images'), { recursive: true })
writeFileSync(
  join(userDataDir, 'libraries.json'),
  JSON.stringify({
    activeLibraryId: 'probe',
    libraries: [
      { id: 'probe', name: 'p', path: libraryDir, legacy: false, createdAt: 1, lastOpenedAt: 1 }
    ]
  })
)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({
  args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
  launchOptions: { env }
})
const mainLog = []
app.process().stderr.on('data', (b) => mainLog.push(String(b)))
app.process().stdout.on('data', (b) => mainLog.push(String(b)))
let page = null
for (let i = 0; i < 60 && !page; i++) {
  await new Promise((r) => setTimeout(r, 250))
  for (const w of app.windows()) {
    try {
      if (/Leaf|本地工具箱/.test(await w.title())) page = w
    } catch {
      /* noop */
    }
  }
}
await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'))
await page.evaluate(async () => {
  if ((await window.api.storage.getMode()) !== 'reference') {
    await window.api.storage.setMode('reference')
  }
})
copyFileSync('/tmp/wavetest/click-120.mp3', join(srcDir, 'click-120.mp3'))
await page.evaluate(async (f) => {
  await window.api.photos.importPaths([f])
}, join(srcDir, 'click-120.mp3'))
await new Promise((r) => setTimeout(r, 6000))
await page.reload({ waitUntil: 'domcontentloaded' })
const card = page.locator('[data-photo-id]').filter({ hasText: 'click-120.mp3' }).first()
await card.waitFor({ timeout: 20_000 })
await card.dblclick()
await page.waitForFunction(() => !!document.querySelector('.fixed canvas[data-waveform]'), null, {
  timeout: 20_000
})
const photoPath = await page.evaluate(async () => {
  const sec = await window.api.photos.getByDateSection()
  return sec.flatMap((s) => s.photos).find((p) => p.fileName === 'click-120.mp3')?.filePath ?? ''
})
await page.evaluate((p) => {
  window.__leafDbgPath = p
}, photoPath)
console.log('DBPATH ' + photoPath)
const lines = await page.evaluate(async () => {
  const live = document.querySelector('.fixed audio')
  const out = [`LIVE html=${live.outerHTML.slice(0, 150)}`]
  const run = async (el, tag) => {
    el.controls = true
    document.body.appendChild(el)
    let rej = 'ok'
    try {
      await el.play()
    } catch (e) {
      rej = e.name
    }
    await new Promise((r) => setTimeout(r, 1000))
    const s = `${tag}: ${rej} rs=${el.readyState} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'} disp=${getComputedStyle(el).display}`
    el.pause()
    el.remove()
    return s
  }
  const path = window.__leafDbgPath
  const manual = `video://${encodeURI(path)}`
  const manualSeg = `video://${path.split('/').map(encodeURIComponent).join('/')}`
  out.push(`URLS live=${live.src.slice(0, 90)}`)
  out.push(`     manual=${manual.slice(0, 90)}`)
  out.push(`     segs  =${manualSeg.slice(0, 90)}`)
  for (const [tag, u] of [['M manual', manual], ['S segs', manualSeg], ['L live', live.src]]) {
    const el = new Audio(u)
    el.controls = true
    document.body.appendChild(el)
    let rej = 'ok'
    try { await el.play() } catch (e) { rej = e.name }
    await new Promise((r) => setTimeout(r, 900))
    out.push(`URLTEST ${tag}: ${rej} rs=${el.readyState} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`)
    el.pause(); el.remove()
  }
  // A. 克隆现有元素（保留全部属性）
  out.push(await run(live.cloneNode(false), 'A 克隆原元素'))
  // B. 只带 src + preload=metadata
  const b = new Audio(live.src)
  b.setAttribute('preload', 'metadata')
  out.push(await run(b, 'B src+preload=metadata'))
  // C. 只带 src
  out.push(await run(new Audio(live.src), 'C 只 src'))
  // D. 现有元素本身，先 load() 再播
  live.load()
  let d = 'ok'
  try {
    await live.play()
  } catch (e) {
    d = e.name
  }
  await new Promise((r) => setTimeout(r, 1000))
  out.push(`D 原元素 load()+play(): ${d} rs=${live.readyState} t=${live.currentTime.toFixed(2)} err=${live.error?.code ?? '-'}`)
  return out
})
console.log(lines.join('\n'))
await app.close()
for (const d of [userDataDir, libraryDir, srcDir]) rmSync(d, { recursive: true, force: true })
