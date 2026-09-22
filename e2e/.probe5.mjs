import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs'
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
await page.evaluate(async () => {
  if ((await window.api.storage.getMode()) !== 'reference') {
    await window.api.storage.setMode('reference')
  }
})
copyFileSync('/tmp/wavetest/click-120.mp3', join(srcDir, 'click-120.mp3'))
await page.evaluate(async (f) => {
  await window.api.photos.importPaths([f])
}, join(srcDir, 'click-120.mp3'))
const id = await page.evaluate(async () => {
  const sec = await window.api.photos.getByDateSection()
  return sec.flatMap((s) => s.photos).find((p) => p.fileName === 'click-120.mp3')?.id ?? ''
})
await page.waitForFunction(
  async (pid) => !!(await window.api.audio.waveform(pid))?.peaks?.length,
  id,
  { timeout: 90_000 }
)
await page.reload({ waitUntil: 'domcontentloaded' })
const card = page.locator('[data-photo-id]').filter({ hasText: 'click-120.mp3' }).first()
await card.waitFor({ timeout: 20_000 })
await card.dblclick()
await page.waitForFunction(() => !!document.querySelector('.fixed canvas[data-waveform]'), null, {
  timeout: 20_000
})
const state = (tag) =>
  page
    .evaluate(() => {
      const a = document.querySelector('.fixed audio')
      const cs = getComputedStyle(a)
      return `${a.style.display}/${cs.display} ctrls=${a.hasAttribute('controls')} rs=${a.readyState} ns=${a.networkState} t=${a.currentTime.toFixed(2)} err=${a.error?.code ?? '-'} src=${a.src.slice(0, 22)}…`
    })
    .then((s) => console.log(`${tag} ${s}`))

await state('MOUNTED ')
await page.locator('.fixed button[aria-label="播放"]').click()
await new Promise((r) => setTimeout(r, 1200))
await state('AFTERBTN ')
// 绕开组件，直接命令元素播
const direct = await page.evaluate(async () => {
  const a = document.querySelector('.fixed audio')
  let rej = 'ok'
  try {
    await a.play()
  } catch (e) {
    rej = `${e.name}:${e.message}`
  }
  await new Promise((r) => setTimeout(r, 1000))
  return `${rej} t=${a.currentTime.toFixed(2)} rs=${a.readyState}`
})
console.log(`DIRECT   ${direct}`)
// 对照 1：同样的 src 新建一个 Audio（绕开组件的所有属性）
// 对照 2：换 rawfile:// 协议
const ctrl = await page.evaluate(async () => {
  const live = document.querySelector('.fixed audio')
  const run = async (url, tag) => {
    const el = new Audio(url)
    el.controls = true
    document.body.appendChild(el)
    let rej = 'ok'
    try { await el.play() } catch (e) { rej = `${e.name}` }
    await new Promise((r) => setTimeout(r, 1000))
    const out = `${tag}: ${rej} rs=${el.readyState} t=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`
    el.pause(); el.remove()
    return out
  }
  const path = decodeURIComponent(live.src.replace(/^video:\\/\\//, ''))
  return [await run(live.src, 'video:// 新建'), await run(`rawfile://${path}`, 'rawfile://'), await run(live.src, '再试一次 video://')]
})
console.log(ctrl.join('\\n'))
await app.close()
for (const d of [userDataDir, libraryDir, srcDir]) rmSync(d, { recursive: true, force: true })
