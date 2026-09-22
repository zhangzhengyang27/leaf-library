import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const rows = []
const check = (name, ok, extra = '') =>
  rows.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  → ${extra}` : ''}`)

let page
for (let i = 0; i < 80; i++) {
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
  await page.waitForTimeout(3500)

  // 1) 主进程配置面：未配置、且拿不到 Key 本体
  const cfg = await page.evaluate(() => window.api.ai.config())
  check(
    'ai.config 只回状态不回 Key',
    cfg && cfg.configured === false && cfg.model === 'deepseek-chat' && !('key' in cfg),
    JSON.stringify(cfg)
  )

  // 2) 非法 Key 被拒（不落盘）
  const bad = await page.evaluate(() => window.api.ai.setKey('hunter2'))
  const afterBad = await page.evaluate(() => window.api.ai.config())
  check('非 sk- 形态的 Key 被拒且不落盘', !bad.ok && afterBad.configured === false, bad.error)

  // 3) 没有 Key 时调用能力 = 明确错误，不是崩溃
  const noKey = await page.evaluate(() => window.api.ai.suggestMeta('no-such-id'))
  check('未配置时 suggestMeta 返回错误对象', noKey?.ok === false, JSON.stringify(noKey))

  // 4) 设置页「AI 助手」页签与未配置态
  await page.evaluate(() => {
    location.hash = '#/settings'
  })
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      x.textContent?.includes('AI 助手')
    )
    b?.click()
  })
  await page.waitForTimeout(900)
  const panel = await page.evaluate(() => {
    const t = document.body.innerText
    return {
      hasModel: t.includes('DeepSeek 文本模型'),
      notConfigured: t.includes('未配置'),
      hasTest: t.includes('测试连接')
    }
  })
  check('设置页 AI 助手面板渲染且显示未配置', panel.hasModel && panel.notConfigured && panel.hasTest)

  // 5) 素材侧门禁：有文字信号的素材才出按钮
  await page.evaluate(() => {
    location.hash = '#/photos'
  })
  await page.waitForTimeout(1500)
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('library.tab.v2')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    parsed.tab.view = 'all'
    parsed.tab.title = '全部'
    localStorage.setItem('library.tab.v2', JSON.stringify(parsed))
    return raw
  })
  await page.reload()
  await page.waitForTimeout(2500)

  const signal = await page.evaluate(async () => {
    const rows = await window.api.photos.getAll()
    const pick = (p) => ({ id: p.id, name: p.fileName, kind: p.kind, doc: !!p.docText, ocr: !!p.ocrText })
    return {
      text: rows.filter((r) => r.kind === 'text').map(pick).slice(0, 2),
      imgWithText: rows.filter((r) => r.kind === 'image' && (r.docText || r.ocrText)).map(pick).slice(0, 2),
      imgPlain: rows.filter((r) => r.kind === 'image' && !r.docText && !r.ocrText).map(pick).slice(0, 1)
    }
  })
  rows.push(`INFO  有正文/OCR 的图片 ${signal.imgWithText.length} 张；纯图片 ${signal.imgPlain.length} 张样张；文本素材 ${signal.text.length} 个`)

  async function openPreview(name) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    await page.waitForTimeout(300)
    const card = page.locator(`text=${name}`).first()
    await card.dblclick({ timeout: 8000 })
    await page.waitForTimeout(1200)
  }

  if (signal.text[0]) {
    await openPreview(signal.text[0].name)
    const btn = await page.getByRole('button', { name: /AI 摘要与标签/ }).count()
    check('有正文的素材显示 ✨AI 摘要与标签', btn === 1, `按钮数 ${btn}`)
    if (btn) {
      await page.getByRole('button', { name: /AI 摘要与标签/ }).click()
      await page.waitForTimeout(1200)
      const inline = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.photo-preview p'))
          .map((p) => p.textContent)
          .find((t) => /未配置|失败|DeepSeek/.test(t ?? ''))
      )
      check('未配置 Key 时给出内联错误而非崩溃', !!inline, String(inline).slice(0, 70))
    }
  }

  if (signal.imgPlain[0]) {
    await openPreview(signal.imgPlain[0].name)
    const btn = await page.getByRole('button', { name: /AI 摘要与标签/ }).count()
    check('无文字信号的素材不出按钮', btn === 0, `按钮数 ${btn}`)
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

  await page.evaluate((raw) => {
    if (raw === null) localStorage.removeItem('library.tab.v2')
    else localStorage.setItem('library.tab.v2', raw)
  }, saved)
  await page.reload()

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
