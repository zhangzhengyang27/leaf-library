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
await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'))
console.log('MODE ' + (await page.evaluate(async () => window.api.storage.getMode())))
await page.evaluate(async () => { await window.api.storage.setMode('copy') })
copyFileSync('/tmp/wavetest/click-120.m4a', join(srcDir, 'click-120.m4a'))
await page.evaluate(async (f) => {
  await window.api.photos.importPaths([f])
}, join(srcDir, 'click-120.m4a'))
await new Promise((r) => setTimeout(r, 6000))

const sec = await page.evaluate(async () => {
  const s = await window.api.photos.getByDateSection()
  const p = s.flatMap((x) => x.photos).find((x) => x.fileName === 'click-120.m4a')
  return { filePath: p?.filePath, kind: p?.kind, durationMs: p?.durationMs, bpm: p?.bpm, id: p?.id }
})
console.log('DBROW ' + JSON.stringify(sec))

// A) 不打开预览：手工元素
const manual = await page.evaluate(async (path) => {
  const el = new Audio(`video://${encodeURI(path)}`)
  el.controls = true
  document.body.appendChild(el)
  let j = 'ok'
  try {
    await el.play()
  } catch (e) {
    j = e.name
  }
  await new Promise((r) => setTimeout(r, 1100))
  const out = `${j} rs=${el.readyState} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`
  el.pause()
  el.remove()
  return out
}, sec.filePath)
console.log('MANUAL-NO-PREVIEW ' + manual)

// B) 打开预览：组件元素
await page.reload({ waitUntil: 'domcontentloaded' })
const card = page.locator('[data-photo-id]').filter({ hasText: 'click-120.m4a' }).first()
await card.waitFor({ timeout: 20_000 })
await card.dblclick()
await page.waitForFunction(() => !!document.querySelector('.fixed canvas[data-waveform]'), null, {
  timeout: 20_000
})
const comp = await page.evaluate(async () => {
  const a = document.querySelector('.fixed audio')
  const ev = []
  for (const t of ['loadstart', 'loadedmetadata', 'error', 'waiting', 'canplay', 'suspend', 'stalled'])
    a.addEventListener(t, () => ev.push(t))
  let j = 'ok'
  try {
    await a.play()
  } catch (e) {
    j = e.name
  }
  await new Promise((r) => setTimeout(r, 1400))
  return {
    src: a.src,
    res: `${j} rs=${a.readyState} t=${a.currentTime.toFixed(2)} err=${a.error?.code ?? '-'} ev=${ev.join(',')} disp=${getComputedStyle(a).display}`,
    canvasPixels: (() => {
      const c = document.querySelector('.fixed canvas[data-waveform]')
      const ctx = c.getContext('2d')
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let ink = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink++
      return `${ink}/${d.length / 4}`
    })()
  }
})
console.log('COMPONENT ' + JSON.stringify(comp))
const again = await page.evaluate(
  async (path) => {
    const el = new Audio(`video://${encodeURI(path)}`)
    el.controls = true
    document.body.appendChild(el)
    let j = 'ok'
    try {
      await el.play()
    } catch (e) {
      j = e.name
    }
    await new Promise((r) => setTimeout(r, 1100))
    el.pause()
    el.remove()
    return `${j} rs=${el.readyState} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`
  },
  sec.filePath
)
console.log('MANUAL-WITH-PREVIEW ' + again)
// 真的点组件的 ▶ 按钮（先暂停回到初始态）
await page.evaluate(() => document.querySelector('.fixed audio').pause())
await new Promise((r) => setTimeout(r, 300))
const labelBefore = await page.evaluate(() => document.querySelector('.fixed audio').paused)
await page.locator('.fixed button[aria-label="播放"]').click()
await new Promise((r) => setTimeout(r, 1200))
const after = await page.evaluate(() => {
  const a = document.querySelector('.fixed audio')
  const btn = document.querySelector('.fixed button[aria-label]')
  const time = [...document.querySelectorAll('.fixed span')].find((x) => /^\\d+:\\d\\d \\/ \\d+:\\d\\d$/.test(x.textContent.trim()))
  return { t: a.currentTime.toFixed(2), paused: a.paused, aria: btn?.getAttribute('aria-label'), time: time?.textContent.trim() }
})
console.log('CLICKTEST pausedBefore=' + labelBefore + ' ' + JSON.stringify(after))
await app.close()
for (const d of [userDataDir, libraryDir, srcDir]) rmSync(d, { recursive: true, force: true })
