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
app.process().stderr.on('data', (b) => mainLog.push(String(b)))
app.process().stdout.on('data', (b) => mainLog.push(String(b)))
await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'))
copyFileSync('/tmp/wavetest/click-120.mp3', join(srcDir, 'click-120.mp3'))
await page.evaluate(async (f) => {
  await window.api.photos.importPaths([f])
}, join(srcDir, 'click-120.mp3'))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'))
console.log('RELOADED')
const info = await page.evaluate(async () => {
  const sec = await window.api.photos.getByDateSection()
  const p = sec.flatMap((s) => s.photos).find((x) => x.fileName === 'click-120.mp3')
  const url = `video://${encodeURI(p.filePath)}`
  const r = await fetch(url)
  const buf = await r.arrayBuffer()
  const head = [...new Uint8Array(buf.slice(0, 12))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
  const r2 = await fetch(url, { headers: { range: 'bytes=0-1' } })
  const el = new Audio(url)
  el.controls = true
  document.body.appendChild(el)
  let rej = 'ok'
  try {
    await el.play()
  } catch (e) {
    rej = e.name
  }
  await new Promise((rr) => setTimeout(rr, 1000))
  const out = {
    kind: p.kind,
    filePath: p.filePath,
    status: r.status,
    ct: r.headers.get('content-type'),
    cl: r.headers.get('content-length'),
    bytes: buf.byteLength,
    head,
    sliceStatus: r2.status,
    play: `${rej} rs=${el.readyState} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`,
    blobPlay: await (async () => {
      const b = await (await fetch(url)).blob()
      const e2 = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/mp4' })))
      e2.controls = true
      document.body.appendChild(e2)
      let j = 'ok'
      try { await e2.play() } catch (er) { j = er.name }
      await new Promise((r) => setTimeout(r, 900))
      const out = `${j} rs=${e2.readyState} t=${e2.currentTime.toFixed(2)} err=${e2.error?.code ?? '-'}`
      e2.pause(); e2.remove()
      return out
    })()
  }
  el.pause()
  el.remove()
  return out
})
const playAgain = async (tag) => {
  const r = await page.evaluate(async () => {
    const sec = await window.api.photos.getByDateSection()
    const row = sec.flatMap((x) => x.photos).find((x) => x.fileName === 'click-120.m4a')
    const el = new Audio(`video://${encodeURI(row.filePath)}`)
    el.controls = true
    document.body.appendChild(el)
    let j = 'ok'
    try { await el.play() } catch (e) { j = e.name }
    await new Promise((x) => setTimeout(x, 1100))
    const out = `${j} rs=${el.readyState} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`
    el.pause(); el.remove()
    return out
  })
  console.log(`AGAIN ${tag}: ${r}`)
}
console.log('INFO ' + JSON.stringify(info, null, 1))
await playAgain('预览未开')
const card = page.locator('[data-photo-id]').filter({ hasText: 'click-120.m4a' }).first()
await card.waitFor({ timeout: 20_000 })
await card.dblclick()
await page.waitForFunction(() => !!document.querySelector('.fixed canvas[data-waveform]'), null, { timeout: 20_000 })
await playAgain('预览已开')
await page.keyboard.press('Escape')
await new Promise((r) => setTimeout(r, 600))
await playAgain('预览关了')
console.log('MAINLOG:\\n' + mainLog.join('').split('\\n').filter((l) => /VIDEOPROTO/.test(l)).join('\\n'))
await app.close()
for (const d of [userDataDir, libraryDir, srcDir]) rmSync(d, { recursive: true, force: true })
