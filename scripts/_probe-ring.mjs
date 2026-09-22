import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const win = browser.contexts()[0].pages().find((p) => p.url().includes('localhost'))
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(3000)

const r = await win.evaluate(async () => {
  const row = document.querySelector('button[data-drop-target]')
  if (!row) return { err: '没有可放置的行' }
  const child = row.querySelector('span') ?? row
  const dt = new DataTransfer()
  dt.items.add(new File(['x'], 'ghost.png', { type: 'text/plain' }))
  const fire = (type, target, related) =>
    target.dispatchEvent(
      new DragEvent(type, { dataTransfer: dt, relatedTarget: related ?? null, bubbles: true, cancelable: true })
    )
  const ring = () => /ring-2/.test(row.className)
  const nap = () => new Promise((res) => setTimeout(res, 250))

  // 1. 真实拖动：dragover 命中子节点，冒泡到行
  fire('dragover', child)
  await nap()
  const afterOver = ring()
  // 2. 在行内移动：从子节点跨到另一个子节点 → 行会收到 relatedTarget 仍在行内的 dragleave
  const other = row.querySelectorAll('span')[1] ?? child
  fire('dragleave', row, other)
  await nap()
  const stillOnAfterInnerLeave = ring()
  // 3. 真的离开这一行
  fire('dragleave', row, document.body)
  await nap()
  const clearedAfterOuterLeave = !ring()
  return { afterOver, stillOnAfterInnerLeave, clearedAfterOuterLeave, rowText: row.innerText.trim().slice(0, 16) }
})
console.log('RESULT', JSON.stringify(r))
process.exit(0)
