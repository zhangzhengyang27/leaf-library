import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const win = browser.contexts()[0].pages().find((p) => p.url().includes('localhost'))
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(3000)

const r = await win.evaluate(async () => {
  const folders = await window.api.photos.listPhotoFolders()
  const rows = [...document.querySelectorAll('[data-drop-target]')]
  const hit = folders.map((f) => rows.find((rw) => rw.innerText.includes(f.name))).find(Boolean)
  if (!hit) return { err: '没找到文件夹行', rowCount: rows.length }
  const mk = (type) => {
    const dt = new DataTransfer()
    dt.items.add(new File(['x'], 'ghost.png', { type: 'text/plain' }))
    return new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true })
  }
  hit.dispatchEvent(mk('dragover'))
  await new Promise((res) => setTimeout(res, 250)) // Vue 重渲染是异步的
  const highlighted = /ring-2/.test(hit.className)
  hit.dispatchEvent(mk('drop'))
  await new Promise((res) => setTimeout(res, 900))
  const toasts = [...document.querySelectorAll('body *')].filter(
    (e) => e.childElementCount === 0 && e.textContent.includes('项解析失败')
  )
  const cleared = !/ring-2/.test(hit.className)
  return {
    row: hit.innerText.trim().slice(0, 20),
    highlighted,
    // 1 = 行处理并抑制了冒泡；2 = window 级也跑了一遍（会重复导入）
    toastCount: toasts.length,
    highlightClearedOnDrop: cleared,
    highlightClearedOnDrop: cleared,
    text: toasts[0] ? toasts[0].textContent.slice(0, 44) : null,
    folderTotal: folders.length
  }
})
console.log('RESULT', JSON.stringify(r))
process.exit(0)
