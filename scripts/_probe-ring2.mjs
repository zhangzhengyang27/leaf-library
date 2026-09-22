import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const win = browser.contexts()[0].pages().find((p) => p.url().includes('localhost'))
await win.reload()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(3000)

console.log(
  JSON.stringify(
    await win.evaluate(async () => {
      const row = document.querySelector('button[data-drop-target="true"]')
      const child = row.querySelector('span') ?? row
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'g.png', { type: 'text/plain' }))
      const fire = (type, target, related) =>
        target.dispatchEvent(
          new DragEvent(type, {
            dataTransfer: dt,
            relatedTarget: related ?? null,
            bubbles: true,
            cancelable: true
          })
        )
      const ring = () => /ring-2/.test(row.className)
      const nap = () => new Promise((res) => setTimeout(res, 250))
      fire('dragover', child)
      await nap()
      const afterOver = ring()
      fire('dragleave', row, row.querySelectorAll('span')[1] ?? child)
      await nap()
      const keptAcrossInnerLeave = ring()
      fire('dragleave', row, document.body)
      await nap()
      return { afterOver, keptAcrossInnerLeave, clearedOnLeave: !ring() }
    })
  )
)
process.exit(0)
