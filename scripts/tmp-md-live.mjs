// 临时探针：Markdown 预览真机核对（颜色/高亮/截图，跑完删除）
import { chromium } from 'playwright'
import { writeFileSync, readFileSync } from 'fs'
const log = (k, v) => console.log(`${k}: ${v}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
await page.waitForTimeout(3000)
// 备一条含代码块/表格/任务列表的 md，走真实导入链路
const src = [
  '# 排版核对',
  '## 二级',
  '### 三级',
  '#### 四级（此前没有样式）',
  '',
  '正文一句话，含 `inline code` 与 **加粗**，链接 https://example.com/x',
  '',
  '| 项目 | 内容 |',
  '| --- | --- |',
  '| a | b |',
  '',
  '- [x] 已完成项',
  '- [ ] 待办项',
  '',
  '```ts',
  'export function hi(name: string): string {',
  '  const n = 42',
  '  return `hi ${name}` // 注释',
  '}',
  '```',
  '',
  '> 引用一行',
  '',
  '---',
  '',
  '收尾段落'
].join('\n')
writeFileSync('/tmp/leaf-fmt-test/排版核对.md', src)
await page.evaluate(() => window.api.photos.addMultiple(['/tmp/leaf-fmt-test/排版核对.md']))
await page.waitForTimeout(2500)
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(4500)
const id = await page.evaluate(() => [...document.querySelectorAll('[data-photo-id]')].find((c) => c.textContent.includes('排版核对'))?.dataset.photoId ?? null)
if (!id) {
  console.log('卡片没找到')
  process.exit(0)
}
await page.dblclick(`[data-photo-id="${id}"]`)
await page.waitForTimeout(2200)
const m = await page.evaluate(() => {
  const host = document.querySelector('.leaf-md')
  if (!host) return { noHost: true, text: document.querySelector('.photo-preview')?.innerText.slice(0, 90) }
  const cs = getComputedStyle(host)
  const q = (s) => {
    const n = host.querySelector(s)
    return n ? { color: getComputedStyle(n).color, size: getComputedStyle(n).fontSize, weight: getComputedStyle(n).fontWeight } : null
  }
  const pre = host.querySelector('pre')
  const preCs = pre ? getComputedStyle(pre) : null
  return {
    host: { color: cs.color, bg: cs.backgroundColor },
    h1: q('h1'),
    h4: q('h4'),
    p: q('p'),
    th: q('th'),
    checkbox: !!host.querySelector('input[type=checkbox]'),
    hljsSpans: host.querySelectorAll('.hljs-keyword, .hljs-string, .hljs-number, .hljs-comment, .hljs-title, .hljs-built_in, .hljs-attr').length,
    preBg: preCs?.backgroundColor,
    // 对比度粗算：正文色与卡片底色
    contrastSample: [cs.color, cs.backgroundColor]
  }
})
log('渲染测量', JSON.stringify(m, null, 1))
await page.screenshot({ path: '/tmp/md-preview.png' })
log('截图', '/tmp/md-preview.png')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
// 清理这条测试素材
const trash = await page.evaluate((x) => window.api.photos.deleteMultiple([x]).then(() => window.api.photos.getRecycleBin()), id)
if (trash.length === 1) await page.evaluate(() => window.api.photos.clearRecycleBin())
log('清理后库内', await page.evaluate(() => window.api.photos.getCount()))
process.exit(0)
