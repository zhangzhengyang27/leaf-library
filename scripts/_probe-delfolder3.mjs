import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const win = browser.contexts()[0].pages().find((p) => p.url().includes('localhost'))
if (!win) throw new Error('main window not found')

const snap = (pid) =>
  win.evaluate(async (p) => {
    const folders = await window.api.photos.listPhotoFolders()
    const trash = await window.api.photos.getRecycleBin()
    const photo = await window.api.photos.getById(p)
    const ids = new Set(folders.map((f) => f.id))
    const all = await window.api.photos.getAll()
    return {
      tempLeft: folders.filter((f) => f.name.startsWith('临时验证-')).map((f) => f.name),
      trashCount: trash.length,
      photoInTrash: trash.some((x) => x.id === p),
      photoFolderId: photo?.folderId ?? null,
      danglingFolderRefs: all.filter((x) => x.folderId && !ids.has(x.folderId)).length
    }
  }, pid)

const setup = await win.evaluate(async () => {
  const free = (await window.api.photos.getAll()).filter((p) => !p.folderId)
  const pid = free[0].id
  const parent = await window.api.photos.createPhotoFolder('临时验证-父', null)
  await window.api.photos.assignPhotosToFolder(parent.id, [pid])
  return { pid, parent: parent.id }
})
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(3000)
console.log('BEFORE   ', JSON.stringify(await snap(setup.pid)))

await win.locator('text=临时验证-父').first().click({ button: 'right' })
await win.waitForTimeout(500)
await win.locator('text=删除文件夹').last().click()
await win.waitForTimeout(600)
// 真 UI 点勾选框：input 是 sr-only，点它的 label（用户实际命中的也是 label）
await win.locator('label:has-text("把文件夹内项目丢到回收站")').click()
console.log('UNCHECKED', JSON.stringify(await win.evaluate(() => document.querySelector('input[type="checkbox"]').checked)))
await win.locator('button:has-text("确认删除")').click()
await win.waitForTimeout(1500)
console.log('AFTER-不勾', JSON.stringify(await snap(setup.pid)))

const clean = await win.evaluate(async (s) => {
  for (const f of await window.api.photos.listPhotoFolders()) {
    if (f.name.startsWith('临时验证-')) await window.api.photos.deletePhotoFolder(f.id, false)
  }
  return { folders: (await window.api.photos.listPhotoFolders()).map((f) => f.name) }
}, setup)
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2500)
console.log('FINAL    ', JSON.stringify(await snap(setup.pid)), JSON.stringify(clean))
process.exit(0)
