import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = '/Users/xiaoye/Desktop/leaf-library'
const ud = mkdtempSync(join(tmpdir(), 'g4ud-'))
const wd = mkdtempSync(join(tmpdir(), 'g4wd-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({
  args: [join(ROOT, 'out/main/index.js'), `--user-data-dir=${ud}`],
  launchOptions: { env }
})
let w = null
for (let i = 0; i < 60; i++) {
  for (const x of app.windows()) {
    try {
      if (/本地工具箱|Leaf/.test(await x.title())) w = x
    } catch {
      /* ignore */
    }
  }
  if (w) break
  await new Promise((r) => setTimeout(r, 300))
}
if (!w) throw new Error('no window')
await w.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
  timeout: 20000
})
const src = join(wd, 'sample.docx')
copyFileSync(join(ROOT, 'src/main/services/__tests__/fixtures/sample.docx'), src)
const [imp] = await w.evaluate(async (p) => await window.api.photos.importPaths([p]), src)
console.log('imported:', JSON.stringify({ id: imp?.id, kind: imp?.kind, ts: imp?.thumbStatus }))
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  const r = await w.evaluate(async (id) => await window.api.photos.getById(id), imp.id)
  console.log(i, JSON.stringify({ kind: r?.kind, w: r?.width, h: r?.height, ts: r?.thumbStatus, dom: r?.colorDominant }))
  if (r?.width) break
}
await app.close()
rmSync(ud, { recursive: true, force: true })
rmSync(wd, { recursive: true, force: true })
