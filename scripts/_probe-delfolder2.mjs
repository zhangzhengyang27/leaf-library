import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const win = browser.contexts()[0].pages().find((p) => p.url().includes('localhost'))
if (!win) throw new Error('main window not found')
await win.waitForTimeout(1500)

const snapshot = () =>
  win.evaluate(async () => {
    const pid = globalThis.__probePid
    const folders = await window.api.photos.listPhotoFolders()
    const trash = await window.api.photos.getRecycleBin()
    const p = await window.api.photos.getById(pid)
    return {
      folders: folders.map((f) => f.name),
      tempLeft: folders.filter((f) => f.name.startsWith('临时验证-')).length,
      trashCount: trash.length,
      photoInTrash: trash.some((x) => x.id === pid),
      photoFolderId: p?.folderId ?? null
    }
  })

// ── 1. 造 父/子 两夹，把一张未归类素材放进「子」夹（素材不在被删的父夹里，才验得出子树） ──
const setup = await win.evaluate(async () => {
  for (const f of await window.api.photos.listPhotoFolders()) {
    if (f.name.startsWith('临时验证-')) await window.api.photos.deletePhotoFolder(f.id, false)
  }
  const free = (await window.api.photos.getAll()).filter((p) => !p.folderId)
  const pid = free[0].id
  globalThis.__probePid = pid
  const parent = await window.api.photos.createPhotoFolder('临时验证-父', null)
  const child = await window.api.photos.createPhotoFolder('临时验证-子', parent.id)
  await window.api.photos.assignPhotosToFolder(child.id, [pid])
  return { pid, parent: parent.id, child: child.id }
})
console.log('SETUP  ', JSON.stringify(setup))
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(3000)
await win.evaluate((s) => (globalThis.__probePid = s.pid), setup)
console.log('BEFORE ', JSON.stringify(await snapshot()))

// ── 2. 真 UI：右键父夹 → 删除文件夹 → 确认框（勾选框默认勾着）→ 确认删除 ──
await win.locator('text=临时验证-父').first().click({ button: 'right' })
await win.waitForTimeout(500)
await win.locator('text=删除文件夹').last().click()
await win.waitForTimeout(500)
const dlg = await win.evaluate(() => {
  const cb = document.querySelector('input[type="checkbox"]')
  return { text: cb?.closest('.fixed')?.innerText.replace(/\s+/g, ' ').trim(), checked: cb?.checked }
})
console.log('DIALOG ', JSON.stringify(dlg))
await win.screenshot({ path: 'test-results/fd-dialog.png', clip: { x: 400, y: 260, width: 660, height: 360 } })
await win.locator('button:has-text("确认删除")').click()
await win.waitForTimeout(1500)
console.log('AFTER-勾 ', JSON.stringify(await snapshot()))

// ── 3. 判别性对照：不勾选 → 只落未分类，不软删 ──
await win.evaluate(async (s) => {
  await window.api.photos.restoreMultiple([s.pid])
  const parent = await window.api.photos.createPhotoFolder('临时验证-父', null)
  await window.api.photos.assignPhotosToFolder(parent.id, [s.pid])
  globalThis.__probePid = s.pid
}, setup)
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(3000)
await win.locator('text=临时验证-父').first().click({ button: 'right' })
await win.waitForTimeout(500)
await win.locator('text=删除文件夹').last().click()
await win.waitForTimeout(500)
await win.locator('input[type="checkbox"]').click()
console.log('UNCHECK ', JSON.stringify(await win.evaluate(() => document.querySelector('input[type="checkbox"]').checked)))
await win.locator('button:has-text("确认删除")').click()
await win.waitForTimeout(1500)
console.log('AFTER-不勾', JSON.stringify(await snapshot()))

// ── 4. 还原库状态 ──
const done = await win.evaluate(async () => {
  const pid = globalThis.__probePid
  await window.api.photos.assignPhotosToFolder(null, [pid])
  for (const f of await window.api.photos.listPhotoFolders()) {
    if (f.name.startsWith('临时验证-')) await window.api.photos.deletePhotoFolder(f.id, false)
  }
  return { pid, trash: (await window.api.photos.getRecycleBin()).length }
})
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2500)
console.log('FINAL  ', JSON.stringify(await snapshot()), 'restoredPhoto=', done.pid)
process.exit(0)
