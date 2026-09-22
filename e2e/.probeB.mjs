import { _electron as electron } from 'playwright'
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const MAIN_ENTRY = join(process.cwd(), 'out/main/index.js')
const MODE = process.env.PROBE_MODE ?? 'reference'
const FIXTURE = process.env.PROBE_FIXTURE ?? 'click-120.m4a'

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
copyFileSync(`/tmp/wavetest/${FIXTURE}`, join(srcDir, FIXTURE))
writeFileSync(join(srcDir, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({
  args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
  launchOptions: { env }
})
const mainLog = []
app.process().stdout.on('data', (b) => mainLog.push(String(b)))
app.process().stderr.on('data', (b) => mainLog.push(String(b)))
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
if (MODE !== 'none') {
  await page.evaluate(async (m) => {
    await window.api.storage.setMode(m)
  }, MODE)
}
await page.evaluate(async (list) => {
  await window.api.photos.importPaths(list)
}, [join(srcDir, FIXTURE), join(srcDir, 'pixel.png')])
await new Promise((r) => setTimeout(r, 6000))
await page.reload({ waitUntil: 'domcontentloaded' })
if (process.env.PROBE_OPEN !== '0') {
  if (process.env.PROBE_OPEN === 'image') {
    const img = page.locator('[data-photo-id]').filter({ hasText: 'pixel.png' }).first()
    await img.waitFor({ timeout: 20_000 })
    await img.dblclick()
    await page.waitForFunction(() => !!document.querySelector('.fixed img'), null, { timeout: 20_000 })
  }
  const card = page.locator('[data-photo-id]').filter({ hasText: FIXTURE.slice(0, 9) }).first()
  await card.waitFor({ timeout: 20_000 })
  await card.dblclick()
  if (process.env.PROBE_OPEN === 'image') {
    await page.waitForFunction(() => !!document.querySelector('.fixed img'), null, { timeout: 20_000 })
  } else {
    await page.waitForFunction(() => !!document.querySelector('.fixed canvas[data-waveform]'), null, {
      timeout: 20_000
    })
  }
}
const lines = await page.evaluate(async () => {
  const sec = await window.api.photos.getByDateSection()
  const rows = sec.flatMap((x) => x.photos)
  const out = rows.map((r) => `ROW ${r.fileName} ${r.kind} dur=${r.durationMs} path=${r.filePath}`)
  const live = document.querySelector('.fixed audio') ?? { src: '' }
  const evLog = []
  if (live.addEventListener)
    for (const t of ['loadstart', 'loadedmetadata', 'error', 'waiting', 'stalled', 'suspend', 'canplay', 'progress', 'abort'])
      live.addEventListener(t, () => evLog.push(t))
  for (const [tag, u] of [['组件', live?.src], ['DB现拼', `video://${encodeURI(rows[0]?.filePath ?? '')}`]]) {
    if (!u) continue
    const r = await fetch(u)
    const buf = await r.arrayBuffer()
    const el = new Audio(u)
    el.controls = true
    if (process.env.PROBE_NOAPPEND) el.remove?.()
    document.body.appendChild(el)
    let j = 'ok'
    try {
      await el.play()
    } catch (e) {
      j = e.name
    }
    await new Promise((x) => setTimeout(x, 1100))
    out.push(`NET ${tag}: ${el.networkState} cur=${el.currentSrc ? 'ok' : 'empty'}`)
    out.push(
      `PLAY ${tag}: http=${r.status}/${r.headers.get('content-type')}/${buf.byteLength}B → ${j} rs=${el.readyState} dur=${el.duration} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`
    )
    el.pause()
    el.remove()
  }
  return out
})
console.log(lines.join('\n'))
console.log(
  'PROTO ' +
    mainLog
      .join('')
      .split('\n')
      .filter((l) => /\\[VP\\]|protocol|asset|Error|error|ERR/i.test(l))
      .join(' ~~ ')
)
await app.close()
for (const d of [userDataDir, libraryDir, srcDir]) rmSync(d, { recursive: true, force: true })
