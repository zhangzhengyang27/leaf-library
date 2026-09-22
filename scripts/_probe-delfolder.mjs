import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const win = browser.contexts()[0].pages().find((p) => p.url().includes('localhost'))
if (!win) throw new Error('main window not found')

const stage = process.argv[2] ?? 'setup'

// ── setup：清掉上次残留，建 父/子 两个临时夹，把一张未归类素材放进子夹 ──
if (stage === 'setup') {
  const base = await win.evaluate(async () => {
    const folders = await window.api.photos.listPhotoFolders()
    for (const f of folders) {
      if (f.name.startsWith('临时验证-')) await window.api.photos.deletePhotoFolder(f.id, true)
    }
    const all = await window.api.photos.getAll()
    const free = all.filter((p) => !p.folderId)
    const trashCount = (await window.api.photos.getRecycleBin()).length
    return { photoId: free[0]?.id ?? null, trashCount }
  })
  console.log('BASE', JSON.stringify(base))
  if (!base.photoId) throw new Error('没有未归类的素材可做实验，终止')

  const setup = await win.evaluate(async (pid) => {
    const parent = await window.api.photos.createPhotoFolder('临时验证-父', null)
    const child = await window.api.photos.createPhotoFolder('临时验证-子', parent.id)
    await window.api.photos.assignPhotosToFolder(child.id, [pid])
    return { parent: parent.id, child: child.id, photo: pid }
  }, base.photoId)
  console.log('SETUP', JSON.stringify(setup))
  await win.reload()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(2500)
  const seen = await win.evaluate(() =>
    [...document.querySelectorAll('*')].some((e) => e.childElementCount === 0 && e.textContent?.includes('临时验证-父'))
  )
  console.log('SIDEBAR_SEES_PARENT', seen)
  process.exit(0)
}

// ── menu：真 UI 右键 → 删除文件夹 → 截确认框 ──
const row = win.locator('text=临时验证-父').first()
await row.waitFor({ timeout: 8000 })
await row.click({ button: 'right' })
await win.waitForTimeout(600)
await win.screenshot({ path: 'test-results/fd-1-menu.png', clip: { x: 0, y: 40, width: 640, height: 560 } })
const menuText = await win.evaluate(() => {
  const items = [...document.querySelectorAll('li,button,[role="menuitem"]')]
    .map((e) => e.textContent?.trim() ?? '')
    .filter((t) => t && t.length < 10)
  return [...new Set(items)].filter((t) => /删除|重命名|密码|加入/.test(t))
})
console.log('MENU', JSON.stringify(menuText))
const del = win.locator('text=删除文件夹').last()
await del.click()
await win.waitForTimeout(600)
await win.screenshot({ path: 'test-results/fd-2-dialog.png' })
const dialog = await win.evaluate(() => {
  const box = document.querySelector('[role="dialog"], .fixed.inset-0')
  const cb = box?.querySelector('input[type="checkbox"]')
  return {
    text: box?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? null,
    hasCheckbox: !!cb,
    checked: cb?.checked ?? null
  }
})
console.log('DIALOG', JSON.stringify(dialog))
process.exit(0)
