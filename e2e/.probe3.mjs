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
const SRC = '/tmp/wavetest/click-120.m4a'
if (!existsSync(SRC)) throw new Error('missing fixture')
copyFileSync(SRC, join(srcDir, 'click-120.m4a'))
await page.evaluate(async (f) => {
  await window.api.photos.importPaths([f])
}, join(srcDir, 'click-120.m4a'))
const id = await page.evaluate(async () => {
  const sec = await window.api.photos.getByDateSection()
  return sec.flatMap((s) => s.photos).find((p) => p.fileName === 'click-120.m4a')?.id ?? ''
})
await page.waitForFunction(
  async (pid) => !!(await window.api.audio.waveform(pid))?.peaks?.length,
  id,
  { timeout: 90_000 }
)
await page.reload({ waitUntil: 'domcontentloaded' })
const card = page.locator('[data-photo-id]').filter({ hasText: 'click-120.m4a' }).first()
await card.waitFor({ timeout: 20_000 })
await card.dblclick()
await page.waitForFunction(() => !!document.querySelector('.fixed canvas[data-waveform]'), null, {
  timeout: 20_000
})
const lines = await page.evaluate(async () => {
  const a = document.querySelector('.fixed audio')
  const out = []
  out.push(
    `live: connected=${a.isConnected} inlineDisplay=${a.style.display} computed=${getComputedStyle(a).display} rs=${a.readyState} err=${a.error?.code}`
  )
  const twin = document.createElement('audio')
  twin.setAttribute('style', a.getAttribute('style'))
  twin.src = a.src
  a.parentElement.appendChild(twin)
  await new Promise((r) => setTimeout(r, 800))
  out.push(`twin(同 style 同父节点): computed=${getComputedStyle(twin).display} rs=${twin.readyState}`)
  const twin2 = document.createElement('audio')
  twin2.setAttribute('style', a.getAttribute('style'))
  twin2.setAttribute('controls', '')
  twin2.src = a.src
  a.parentElement.appendChild(twin2)
  await new Promise((r) => setTimeout(r, 800))
  out.push(`twin2(带 controls): computed=${getComputedStyle(twin2).display} rs=${twin2.readyState}`)
  return out
})
console.log(lines.join('\n'))
await app.close()
for (const d of [userDataDir, libraryDir, srcDir]) rmSync(d, { recursive: true, force: true })
