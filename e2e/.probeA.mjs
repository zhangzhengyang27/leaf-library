import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const MAIN_ENTRY = join(process.cwd(), 'out/main/index.js')
const userDataDir = mkdtempSync(join(tmpdir(), 'leaf-probe-'))
const libraryDir = mkdtempSync(join(tmpdir(), 'leaf-probe-lib-'))
const srcDir = mkdtempSync(join(tmpdir(), 'leaf-wave-assets-'))
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
copyFileSync('/tmp/wavetest/click-120.m4a', join(srcDir, 'click-120.m4a'))
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
await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'))
await page.evaluate(async (f) => {
  await window.api.photos.importPaths(f)
}, [join(srcDir, 'click-120.m4a'), join(srcDir, 'click-120x.mp3')])
await new Promise((r) => setTimeout(r, 6000))
await page.reload({ waitUntil: 'domcontentloaded' })
const card = page.locator('[data-photo-id]').filter({ hasText: 'click-120.m4a' }).first()
await card.waitFor({ timeout: 20_000 })
await card.dblclick()
await page.waitForFunction(() => !!document.querySelector('.fixed canvas[data-waveform]'), null, {
  timeout: 20_000
})
const lines = await page.evaluate(async () => {
  const live = document.querySelector('.fixed audio')
  const url = live.src
  const sec = await window.api.photos.getByDateSection()
  const rows = sec.flatMap((x) => x.photos)
  out.push(`ROWS ${rows.map((r) => `${r.fileName}@${String(r.filePath).slice(-28)}:${r.durationMs}`).join(' | ')}`)
  for (const r of rows) {
    const el = new Audio(`video://${encodeURI(r.filePath)}`)
    el.controls = true
    document.body.appendChild(el)
    let j = 'ok'
    try { await el.play() } catch (e) { j = e.name }
    await new Promise((x) => setTimeout(x, 1000))
    out.push(`ROWPLAY ${r.fileName}: ${j} rs=${el.readyState} dur=${el.duration} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`)
    el.pause(); el.remove()
  }
  const out = [`LIVE t=${live.currentTime.toFixed(2)} rs=${live.readyState} err=${live.error?.code ?? '-'} preload=${live.preload}`]
  for (let n = live; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n)
    out.push(
      `CHAIN ${n.tagName}.${(n.className ?? '').toString().split(' ')[0]} disp=${cs.display} vis=${cs.visibility} cv=${cs.contentVisibility} contain=${cs.contain} op=${cs.opacity} filter=${cs.filter === 'none' ? '-' : cs.filter} rect=${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`
    )
  }
  const test = async (tag, attrs, parent = document.body) => {
    const el = document.createElement('audio')
    el.src = url
    el.controls = true
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    el.style.cssText = 'display:block;width:200px;height:30px'
    parent.appendChild(el)
    let j = 'ok'
    try {
      await el.play()
    } catch (e) {
      j = e.name
    }
    await new Promise((r) => setTimeout(r, 1100))
    out.push(`V ${tag}: ${j} rs=${el.readyState} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`)
    el.pause()
    el.remove()
  }
  await test('body 下', {})
  await test('同父节点内', {}, live.parentElement)
  await test('preview 根内', {}, document.querySelector('.photo-preview') ?? document.body)
  await test('preload=auto', { preload: 'auto' })
  await test('preload=none', { preload: 'none' })
  // 原元素：改 preload 再 load
  live.removeAttribute('preload')
  live.load()
  let j = 'ok'
  try {
    await live.play()
  } catch (e) {
    j = e.name
  }
  await new Promise((r) => setTimeout(r, 1100))
  out.push(`FIXED-attr: ${j} rs=${live.readyState} t=${live.currentTime.toFixed(2)} err=${live.error?.code ?? '-'}`)
  return out
})
console.log(lines.join('\n'))
await app.close()
for (const d of [userDataDir, libraryDir, srcDir]) rmSync(d, { recursive: true, force: true })
