import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const rows = []
const check = (name, ok, extra = '') =>
  rows.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  → ${extra}` : ''}`)

let page
for (let i = 0; i < 60; i++) {
  page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
  if (page) break
  await new Promise((r) => setTimeout(r, 500))
}

async function main() {
  if (!page) throw new Error('渲染层页面未出现')
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.split('\n')[0]}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().split('\n')[0].slice(0, 110)}`)
  })
  await page.waitForTimeout(3000)

  const gone = await page.evaluate(() =>
    [
      'semanticSearch',
      'embeddingStatus',
      'embeddingIndexAll',
      'suggestTags',
      'suggestName',
      'suggestDescription',
      'autoTagLibrary',
      'findSimilarVisual',
      'aiAvailable',
      'onEmbedding'
    ]
      .filter((k) => typeof window.api.photos[k] !== 'undefined')
      .join(',')
  )
  check('preload 上 AI 通道全部移除', gone === '', gone)

  const n = await page.evaluate(async () => (await window.api.photos.getAll()).length)
  check('素材库仍可读（迁移未破坏数据）', n === 26, `${n} 条`)

  await page.evaluate(() => {
    location.hash = '#/photos'
  })
  await page.waitForSelector('img[src^="thumb://"]', { timeout: 15000 })
  const before = await page.locator('img[src^="thumb://"]').count()
  await page.locator('#library-search').fill('pexels')
  await page.waitForTimeout(1400)
  const after = await page.locator('img[src^="thumb://"]').count()
  check('关键词搜索仍生效', after > 0 && after < before, `${before} → ${after}`)
  await page.locator('#library-search').fill('')
  await page.waitForTimeout(1400)
  rows.push(`INFO  清空关键词后缩略图数 = ${await page.locator('img[src^="thumb://"]').count()}`)

  await page.locator('img[src^="thumb://"]').first().dblclick({ timeout: 15000 })
  await page.waitForTimeout(1400)
  check('预览可打开', (await page.locator('.photo-preview').count()) > 0)
  const hasAiBtn = await page.getByRole('button', { name: /AI 命名|AI 建议/ }).count()
  check('预览内 AI 命名/建议按钮已移除', hasAiBtn === 0, `残留 ${hasAiBtn}`)

  await page.getByRole('button', { name: '🔍 找相似' }).click()
  await page.waitForTimeout(2000)
  const previewGone = (await page.locator('.photo-preview').count()) === 0
  const body = await page.evaluate(() => document.body.innerText)
  check('找相似切到相似视图（pHash 档）', previewGone && /相似/.test(body))

  await page.evaluate(() => {
    location.hash = '#/settings'
  })
  await page.waitForTimeout(1500)
  const s1 = await page.evaluate(() => {
    const t = document.body.innerText
    return {
      contentNav: t.includes('内容识别'),
      aiNav: /AI 搜索/.test(t),
      aiPanel: /AI Search|模型状态|什么是 AI/.test(t)
    }
  })
  check(
    '设置页导航改名、AI 面板消失',
    s1.contentNav && !s1.aiNav && !s1.aiPanel,
    JSON.stringify(s1)
  )
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      x.textContent?.includes('内容识别')
    )
    b?.click()
  })
  await page.waitForTimeout(900)
  const s2 = await page.evaluate(() => {
    const t = document.body.innerText
    return t.includes('文字识别（OCR）') && t.includes('文档正文抽取')
  })
  check('OCR 与文档抽取仍在「内容识别」页', s2)

  const real = errors.filter((e) => !/Autofill|sandboxed_renderer|caniuse|browserslist/i.test(e))
  check('无新增控制台错误', real.length === 0, real.slice(0, 3).join(' | '))
}

try {
  await main()
} catch (err) {
  rows.push(`THREW  ${String(err.message).split('\n')[0]}`)
}
console.log(rows.join('\n'))
await browser.close()
