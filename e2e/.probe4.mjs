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
for (const n of ['click-120.m4a', 'click-120.mp3', 'click-120.wav']) {
  if (!existsSync(`/tmp/wavetest/${n}`)) throw new Error(`缺样本 ${n}`)
  copyFileSync(`/tmp/wavetest/${n}`, join(srcDir, n))
}
await page.evaluate(async (dir) => {
  await window.api.photos.importPaths(['click-120.m4a', 'click-120.mp3', 'click-120.wav'].map((n) => `${dir}/${n}`))
}, srcDir)
await new Promise((r) => setTimeout(r, 8000))

const report = await page.evaluate(async () => {
  const sec = await window.api.photos.getByDateSection()
  const photos = sec.flatMap((s) => s.photos)
  const out = []
  for (const name of ['click-120.m4a', 'click-120.mp3', 'click-120.wav']) {
    const p = photos.find((x) => x.fileName === name)
    if (!p) {
      out.push(`${name}: 未入库`)
      continue
    }
    const url = `video://${encodeURI(p.filePath)}`
    // ① 直接喂 <audio>
    const a = new Audio(url)
    a.controls = true
    document.body.appendChild(a)
    let rej1 = 'ok'
    try {
      await a.play()
    } catch (e) {
      rej1 = `${e.name}:${e.message}`
    }
    await new Promise((r) => setTimeout(r, 900))
    const direct = `${rej1} rs=${a.readyState} t=${a.currentTime.toFixed(2)} dur=${a.duration} err=${a.error?.code ?? '-'}`
    a.pause()
    a.remove()
    // ② 先 fetch 成 blob 再喂（绕开自定义协议）
    let blobInfo = 'fetch 失败'
    try {
      const r = await fetch(url)
      const b = await r.blob()
      const a2 = new Audio(URL.createObjectURL(b))
      a2.controls = true
      document.body.appendChild(a2)
      let rej2 = 'ok'
      try {
        await a2.play()
      } catch (e) {
        rej2 = `${e.name}:${e.message}`
      }
      await new Promise((r2) => setTimeout(r2, 900))
      blobInfo = `${rej2} rs=${a2.readyState} t=${a2.currentTime.toFixed(2)} dur=${a2.duration} err=${a2.error?.code ?? '-'}`
      a2.pause()
      a2.remove()
    } catch (e) {
      blobInfo = `${e.name}:${e.message}`
    }
    out.push(`${name}\n   直接 video:// → ${direct}\n   fetch+blob  → ${blobInfo}`)
  }
  return out
})
console.log(report.join('\n'))
await app.close()
for (const d of [userDataDir, libraryDir, srcDir]) rmSync(d, { recursive: true, force: true })
