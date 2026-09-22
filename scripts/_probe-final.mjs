import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const rows = []
const check = (n, ok, x = '') => rows.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? `  → ${x}` : ''}`)
let page
for (let i = 0; i < 90; i++) {
  page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
  if (page) break
  await new Promise((r) => setTimeout(r, 500))
}

async function main() {
  if (!page) throw new Error('渲染层页面未出现')
  await page.waitForTimeout(4000)

  // 1) 计数修正 + 迁移 020 归一化
  const st = await page.evaluate(() => window.api.photos.ocrStatus())
  check('pendingTotal 走 SQL 后归零', st.pendingTotal === 0, JSON.stringify(st))
  const texts = await page.evaluate(async () => {
    const a = await window.api.photos.getAll()
    return a
      .filter((r) => r.kind === 'image' && (r.ocrText ?? '').trim())
      .slice(0, 3)
      .map((r) => r.ocrText.trim().slice(0, 40))
  })
  const spaced = texts.filter((t) => /[一-鿿] [一-鿿]/.test(t))
  check('存量 OCR 文本已归一化（汉字间无空格）', spaced.length === 0, texts.join(' | '))

  // 2) 归一化后 trigram 索引能命中整词
  if (texts[0]) {
    const word = texts[0].match(/[一-鿿]{4,}/)?.[0] ?? ''
    if (word) {
      const hits = await page.evaluate(async (q) => {
        const r = await window.api.photos.search(q)
        return (Array.isArray(r) ? r : []).map((p) => p.fileName)
      }, word)
      check(`用 OCR 整词「${word}」搜到素材`, hits.length > 0, `${hits.length} 命中`)
    }
  }

  // 3) 重命名规则助手（真实调用，只填模板不落盘）
  await page.evaluate(() => {
    location.hash = '#/photos'
  })
  await page.waitForTimeout(1500)
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('library.tab.v2')
    if (!raw) return null
    const p = JSON.parse(raw)
    p.tab.view = 'all'
    p.tab.title = '全部'
    localStorage.setItem('library.tab.v2', JSON.stringify(p))
    return raw
  })
  await page.reload()
  await page.waitForTimeout(2500)

  const cards = page.locator('img[src^="thumb://"]')
  await cards.nth(0).click()
  await cards.nth(1).click({ modifiers: ['Meta'] })
  await cards.nth(0).click({ button: 'right' })
  await page.waitForTimeout(500)
  await page.getByText(/批量重命名/).first().click()
  await page.waitForTimeout(700)
  await page.locator('input[placeholder^="用一句话说规则"]').fill('前面加所在文件夹名，再接导入日期和 3 位序号')
  const t0 = Date.now()
  await page.getByRole('button', { name: '✨ 生成' }).click()
  await page.waitForTimeout(5000)
  const pattern = await page.locator('input[placeholder^="例如"]').inputValue()
  check(`AI 生成命名模板（${Date.now() - t0}ms）`, /\{parent\}/.test(pattern) && /\{date\}/.test(pattern) && /\{n\}/.test(pattern), pattern)
  await page.getByRole('button', { name: '取消' }).click()
  await page.waitForTimeout(500)

  // 4) 批量摘要：挑 2 个有文字的素材，跑完还原
  const targets = await page.evaluate(async () => {
    const a = await window.api.photos.getAll()
    return a
      .filter((r) => r.kind === 'image' && (r.ocrText ?? '').trim().length > 10)
      .slice(0, 2)
      .map((r) => ({ id: r.id, name: r.fileName, desc: r.description ?? '', tags: [...r.tags] }))
  })
  if (targets.length < 2) throw new Error(`可测素材不足：${targets.length}`)
  const before = JSON.stringify(targets.map((t) => ({ n: t.name, d: t.desc, t: t.tags })))
  const t1 = Date.now()
  const r = await page.evaluate((ids) => window.api.ai.batchMeta(ids), targets.map((t) => t.id))
  check(`批量摘要跑完 2 条（${Date.now() - t1}ms）`, r.done === 2, JSON.stringify(r))
  const after = await page.evaluate(async (ids) => {
    const out = []
    for (const id of ids) {
      const p = await window.api.photos.getById(id)
      out.push({ name: p.fileName, desc: p.description ?? '', tags: [...p.tags] })
    }
    return out
  }, targets.map((t) => t.id))
  rows.push(`INFO  写入结果：${after.map((a) => `${a.name} → 描述${a.desc.length}字 / 标签[${a.tags.join('、')}]`).join('；')}`)
  check('描述与标签确实落库', after.every((a) => a.desc.length > 4 && a.tags.length > 0))

  // 还原
  for (let i = 0; i < after.length; i++) {
    const orig = targets[i]
    if (after[i].desc !== orig.desc) {
      await page.evaluate(([id, d]) => window.api.photos.setDescription(id, d), [orig.id, orig.desc])
    }
    for (const t of after[i].tags) {
      if (!orig.tags.includes(t)) {
        await page.evaluate(([id, tag]) => window.api.tags.removeTagFromPhoto(id, tag), [orig.id, t])
      }
    }
  }
  const restored = await page.evaluate(async (ids) => {
    const out = []
    for (const id of ids) {
      const p = await window.api.photos.getById(id)
      out.push({ d: p.description ?? '', t: [...p.tags] })
    }
    return JSON.stringify(out)
  }, targets.map((t) => t.id))
  const expect = JSON.stringify(targets.map((t) => ({ d: t.desc, t: t.tags })))
  check('测试写入已还原', restored === expect, `期望 ${expect} 实际 ${restored}`)

  await page.evaluate((raw) => {
    if (raw === null) localStorage.removeItem('library.tab.v2')
    else localStorage.setItem('library.tab.v2', raw)
  }, saved)
}

try {
  await main()
} catch (e) {
  rows.push(`THREW  ${String(e.message).split('\n')[0]}`)
}
console.log(rows.join('\n'))
await browser.close()
