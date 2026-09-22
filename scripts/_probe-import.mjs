import { chromium } from 'playwright'

const DIR = '/tmp/leaf-import-demo'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const win = browser.contexts()[0].pages().find((p) => p.url().includes('localhost'))
if (!win) throw new Error('main window not found')
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2500)

const tree = () =>
  win.evaluate(async () => {
    const folders = await window.api.photos.listPhotoFolders()
    const byId = new Map(folders.map((f) => [f.id, f]))
    const pathOf = (f) => {
      const parts = [f.name]
      let p = f.parentId
      while (p && byId.get(p)) {
        parts.unshift(byId.get(p).name)
        p = byId.get(p).parentId
      }
      return parts.join(' / ')
    }
    const out = []
    for (const f of folders) {
      const photos = await window.api.photos.getFolderPhotos(f.id)
      out.push({ path: pathOf(f), n: photos.length, names: photos.map((x) => x.fileName).sort() })
    }
    return {
      rows: out.filter((r) => r.path.includes('leaf-import-demo') || r.path.includes('验证-')),
      trashCount: (await window.api.photos.getRecycleBin()).length
    }
  })

console.log('BEFORE', JSON.stringify(await tree()))

const r1 = await win.evaluate(async (dir) => {
  const photos = await window.api.photos.importPaths([dir], null)
  return { added: photos.length, ids: photos.map((p) => p.id) }
}, DIR)
console.log('IMPORT-根级', JSON.stringify(r1).slice(0, 120))
await win.waitForTimeout(1500)
console.log('TREE-根级', JSON.stringify((await tree()).rows, null, 1))

await win.screenshot({ path: 'test-results/import-sidebar.png', clip: { x: 0, y: 40, width: 330, height: 620 } })

// 挂载到某个文件夹下
const mount = await win.evaluate(async (dir) => {
  const parent = await window.api.photos.createPhotoFolder('验证-挂载点', null)
  const photos = await window.api.photos.importPaths([dir], parent.id)
  return { parentId: parent.id, added: photos.length, ids: photos.map((p) => p.id) }
}, DIR)
await win.waitForTimeout(1500)
console.log('TREE-挂载', JSON.stringify((await tree()).rows, null, 1))

// ── 还原：删掉本次导入的素材（回收站里必须只有这些才敢清），再删镜像出来的夹 ──
const allIds = [...r1.ids, ...mount.ids]
const cleanup = await win.evaluate(
  async ({ ids, parentId }) => {
    await window.api.photos.deleteMultiple(ids)
    const trash = (await window.api.photos.getRecycleBin()).map((p) => p.id)
    const onlyMine = trash.every((t) => ids.includes(t))
    if (onlyMine) await window.api.photos.clearRecycleBin()
    const folders = await window.api.photos.listPhotoFolders()
    for (const f of folders) {
      if (f.name === 'leaf-import-demo' || f.name === '验证-挂载点' || ['子目录A', '深层B', '空目录C'].includes(f.name))
        await window.api.photos.deletePhotoFolder(f.id, false)
    }
    return {
      onlyMine,
      purged: onlyMine ? ids.length : 0,
      leftFolders: (await window.api.photos.listPhotoFolders()).map((f) => f.name),
      leftTrash: (await window.api.photos.getRecycleBin()).length
    }
  },
  { ids: allIds, parentId: mount.parentId }
)
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2000)
console.log('CLEANUP', JSON.stringify(cleanup))
console.log('AFTER ', JSON.stringify(await tree()))
process.exit(0)
