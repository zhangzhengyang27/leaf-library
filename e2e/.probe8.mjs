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
page.on('console', (m) => { const t = m.text(); if (/media|video:|ERR|error|Error/i.test(t)) console.log('PAGECON ' + t.slice(0, 200)) })
page.on('requestfailed', (r) => console.log('REQFAIL ' + r.url().slice(0, 80) + ' ' + (r.failure()?.errorText ?? '')))
await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'))
copyFileSync('/tmp/wavetest/click-120.m4a', join(srcDir, 'click-120.m4a'))
await page.evaluate(async (f) => {
  await window.api.photos.importPaths([f])
}, join(srcDir, 'click-120.m4a'))
await new Promise((r) => setTimeout(r, 5000))
await page.reload({ waitUntil: 'domcontentloaded' })
const card = page.locator('[data-photo-id]').filter({ hasText: 'click-120.m4a' }).first()
await card.waitFor({ timeout: 20_000 })
await card.dblclick()
await page.waitForFunction(() => !!document.querySelector('.fixed canvas[data-waveform]'), null, {
  timeout: 20_000
})
const pre = await page.evaluate(async () => {
  const sec = await window.api.photos.getByDateSection()
  const row = sec.flatMap((x) => x.photos).find((x) => x.fileName === 'click-120.m4a')
  const url = `video://${encodeURI(row.filePath)}`
  const r = await fetch(url)
  const el = new Audio(url)
  el.controls = true
  document.body.appendChild(el)
  let j = 'ok'
  try { await el.play() } catch (e) { j = e.name }
  await new Promise((x) => setTimeout(x, 1100))
  const out = `PRE(path=${row.filePath} kind=${row.kind}) http=${r.status}/${r.headers.get('content-type')} play=${j} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`
  el.pause(); el.remove()
  return out
})
console.log('PRECHECK ' + pre)
page.on('console', (m) => { if (/Content Security|Refused/i.test(m.text())) console.log('CSPCON ' + m.text().slice(0, 200)) })
console.log('LIVECSP ' + (await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content.match(/media-src[^;]*/)?.[0] ?? 'no-meta')))
const lines = await page.evaluate(async () => {
  const a = document.querySelector('.fixed audio')
  const ev = []
  for (const t of ['loadstart', 'loadedmetadata', 'loadeddata', 'error', 'stalled', 'waiting', 'canplay', 'suspend'])
    a.addEventListener(t, () => ev.push(t))
  const out = [`COMPONENT html=${a.outerHTML.replace(/video:\/\/[^ ]{30,}/, 'video://…')}`]
  let rej = 'ok'
  try {
    await a.play()
  } catch (e) {
    rej = `${e.name}:${e.message}`
  }
  await new Promise((r) => setTimeout(r, 1200))
  out.push(`COMPONENT play: ${rej} rs=${a.readyState} ns=${a.networkState} t=${a.currentTime.toFixed(2)} err=${a.error?.code ?? '-'} ev=${ev.join(',')}`)
  // 同一 URL、同一父节点，手工建一个对照元素
  const twin = document.createElement('audio')
  twin.src = a.src
  twin.controls = true
  a.parentElement.appendChild(twin)
  const ev2 = []
  for (const t of ['loadstart', 'loadedmetadata', 'error', 'stalled', 'waiting', 'canplay', 'suspend'])
    twin.addEventListener(t, () => ev2.push(t))
  let rej2 = 'ok'
  try {
    await twin.play()
  } catch (e) {
    rej2 = `${e.name}:${e.message}`
  }
  await new Promise((r) => setTimeout(r, 1200))
  out.push(`TWIN(same parent): ${rej2} rs=${twin.readyState} t=${twin.currentTime.toFixed(2)} err=${twin.error?.code ?? '-'} ev=${ev2.join(',')}`)
  twin.remove()
  // 三方对照：库里 filePath 现拼的 URL vs 组件给的 URL
  const sec = await window.api.photos.getByDateSection()
  const row = sec.flatMap((x) => x.photos).find((x) => x.fileName === 'click-120.m4a')
  const manual = `video://${encodeURI(row.filePath)}`
  out.push(`URLS component=${a.src} ||| manual=${manual} same=${a.src === manual}`)
  out.push(`CODES comp=${[...a.src].slice(-24).map((c) => c.charCodeAt(0)).join(',')} codes man=${[...manual].slice(-24).map((c) => c.charCodeAt(0)).join(',')}`)
  for (const [tag, u] of [['comp', a.src], ['manual', manual]]) {
    const r = await fetch(u)
    const el = new Audio(u)
    el.controls = true
    document.body.appendChild(el)
    let j = 'ok'
    try { await el.play() } catch (e) { j = e.name }
    await new Promise((rr) => setTimeout(rr, 1100))
    out.push(`X ${tag}: http=${r.status}/${r.headers.get('content-type')} play=${j} rs=${el.readyState} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`)
    el.pause(); el.remove()
  }
  out.push(`ROW kind=${row.kind} thumb=${row.thumbStatus} dur=${row.durationMs}`)
})
console.log(lines.join('\n'))
await app.close()
for (const d of [userDataDir, libraryDir, srcDir]) rmSync(d, { recursive: true, force: true })
