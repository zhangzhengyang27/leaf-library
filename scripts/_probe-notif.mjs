import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const ctx = browser.contexts()[0]
const win = ctx.pages().find((p) => p.url().includes('localhost'))
if (!win) throw new Error('main window not found')

const find = () => win.evaluate(() => !!document.querySelector('.absolute.top-full'))
if (!(await find())) {
  await win.click('[aria-label^="通知"]')
  await win.waitForTimeout(400)
}
if (!(await find())) {
  await win.click('[aria-label^="通知"]')
  await win.waitForTimeout(400)
}

const geo = await win.evaluate(() => {
  const el = document.querySelector('.absolute.top-full')
  if (!el) return { found: false }
  const b = el.getBoundingClientRect()
  // 塞一条真实文案的假消息，量是否被 truncate
  const box = el.querySelector('.max-h-80')
  box.innerHTML = `<ul class="flex flex-col py-1"><li><button type="button" class="flex w-full items-start gap-2.5 px-3 py-2 text-left">
    <span class="mt-0.5 shrink-0" style="width:16px;height:16px;background:#10b981;display:block"></span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-xs font-medium" id="p-t">素材处理完成</span>
      <span class="mt-0.5 block truncate text-[11px]" id="p-d">已完成 5028/5028 项（缩略图/EXIF/哈希）</span>
    </span>
    <span class="shrink-0 text-[10px]">24 分钟前</span>
  </button></li></ul>`
  const t = document.getElementById('p-t')
  const d = document.getElementById('p-d')
  const clipped = (n) => n.scrollWidth > n.clientWidth + 1
  return {
    found: true,
    rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) },
    viewportW: innerWidth,
    offLeft: b.x < 0,
    titleClipped: clipped(t),
    descClipped: clipped(d),
    descScrollW: d.scrollWidth,
    descClientW: d.clientWidth
  }
})
console.log(JSON.stringify(geo, null, 1))
await win.screenshot({ path: 'test-results/notif-fixed.png', clip: { x: 0, y: 0, width: 620, height: 260 } })
process.exit(0)
