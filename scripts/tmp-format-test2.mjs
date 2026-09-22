// 临时探针：音频/PDF/ZIP/字体/书签 预览验收（跑完删除）
import { chromium } from 'playwright'
const out = []
const ok = (n, p, d) => {
  out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  · ' + d : ''}`)
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  · ' + d : ''}`)
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const api = (fn, ...args) =>
  page.evaluate(async ([f, a]) => await new Function('return window.api.' + f)()(...a), [fn, args])
const clean = async () => {
  for (let i = 0; i < 8; i++) {
    const dirty = await page.evaluate(
      () => !!document.querySelector('div.fixed.inset-0.z-\\[1000\\]') || !!document.querySelector('.photo-preview')
    )
    if (!dirty) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}
await page.waitForTimeout(1500)
await clean()

// 重导 three-page.pdf（上一版自造 PDF 结构非法，thumbStatus=2）
const all0 = await api('photos.getAll')
const badPdf = all0.find((p) => p.fileName === 'three-page.pdf')
if (badPdf && badPdf.thumbStatus !== 1) {
  await api('photos.deleteMultiple', [badPdf.id])
  const re = await api('photos.addMultiple', ['/tmp/leaf-fmt-test/three-page.pdf'])
  console.log('重导 three-page.pdf:', re.map((p) => `${p.id.slice(0, 8)} kind=${p.kind}`).join(','))
  for (let i = 0; i < 24; i++) {
    const row = (await api('photos.getAll')).find((p) => p.id === re[0].id)
    if (row?.thumbStatus === 1) break
    await new Promise((r) => setTimeout(r, 2500))
  }
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(3000)
}
await clean()

const openByName = async (name) => {
  await clean()
  const id = await page.evaluate((n) => {
    const cards = [...document.querySelectorAll('[data-photo-id]')]
    return cards.find((c) => c.textContent.includes(n))?.dataset.photoId ?? null
  }, name)
  if (!id) return null
  await page.dblclick(`[data-photo-id="${id}"]`)
  await page.waitForTimeout(1500)
  return id
}
const pdfIndicator = () =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll('.photo-preview span')].find(
      (x) => x.className.includes('text-sm') && /^\s*\d+\s*\/\s*\d+\s*$/.test(x.textContent)
    )
    return s ? s.textContent.trim() : null
  })
const canvasInk = () =>
  page.evaluate(() => {
    const c = document.querySelector('.photo-preview canvas')
    if (!c) return null
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let ink = 0
    let sampled = 0
    for (let i = 0; i < d.length; i += 4 * 401) {
      sampled++
      if (d[i + 3] > 200 && (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235)) ink++
    }
    return { size: [c.width, c.height], ink, sampled }
  })

// ───── 音频（协议补 MIME 后复测）─────
console.log('\n— ding.mp3 —')
const aId = await openByName('ding.mp3')
if (aId) {
  const au = await page.evaluate(async () => {
    const a = document.querySelector('.photo-preview audio')
    if (!a) return { none: true }
    const head = await fetch(a.currentSrc).then((r) => ({ status: r.status, ct: r.headers.get('content-type') }))
    for (let i = 0; i < 30 && a.readyState < 2; i++) await new Promise((r) => setTimeout(r, 200))
    const t0 = a.currentTime
    await a.play().catch(() => {})
    await new Promise((r) => setTimeout(r, 400))
    const moved = a.currentTime > t0
    a.pause()
    return { present: true, readyState: a.readyState, dur: +a.duration.toFixed(2), controls: a.controls, moved, head, err: a.error?.code ?? null }
  })
  ok('mp3 加载并播放', au.present && au.readyState >= 2 && au.dur > 0 && au.moved, JSON.stringify(au))
  ok('协议无 Range 响应带 MIME', /^audio\//.test(au.head?.ct ?? ''), JSON.stringify(au.head))
} else ok('mp3 加载并播放', false, '卡片未找到')

// ───── PDF：合法 3 页 ─────
console.log('\n— three-page.pdf（3 页）—')
if (await openByName('three-page.pdf')) {
  const ind0 = await pdfIndicator()
  const ink0 = await canvasInk()
  ok('PDF 渲染出画面', !!ink0 && ink0.ink > 3, JSON.stringify({ ind0, ink0 }))
  ok('页码显示 1 / 3', ind0 === '1 / 3', String(ind0))
  const prevDisabled = await page.$eval('.photo-preview button:has-text("上一页")', (b) => b.disabled)
  ok('首页时上一页禁用', prevDisabled === true)
  await page.click('.photo-preview button:has-text("下一页")')
  await page.waitForTimeout(1500)
  const ind1 = await pdfIndicator()
  const ink1 = await canvasInk()
  ok('翻到 2 / 3 且画面变了', ind1 === '2 / 3' && ink1.ink !== ink0.ink, `${ind0} -> ${ind1} ink ${ink0.ink}->${ink1.ink}`)
  await page.click('.photo-preview button:has-text("下一页")')
  await page.waitForTimeout(1500)
  const ind2 = await pdfIndicator()
  const nextDisabled = await page.$eval('.photo-preview button:has-text("下一页")', (b) => b.disabled)
  ok('末页停在 3 / 3 且下一页禁用', ind2 === '3 / 3' && nextDisabled === true, `${ind2} disabled=${nextDisabled}`)
} else ok('PDF 渲染出画面', false, '卡片未找到')

// ───── PDF：真实论文 ─────
console.log('\n— paper.pdf（真实 PDF）—')
if (await openByName('paper.pdf')) {
  const ind = await pdfIndicator()
  const ink = await canvasInk()
  const err = await page.evaluate(() => document.querySelector('.photo-preview').innerText.match(/失败[^\n]{0,70}/)?.[0] ?? null)
  ok('真实 PDF 渲染', !!ink && ink.ink > 3 && !err, JSON.stringify({ ind, ink, err }))
} else ok('真实 PDF 渲染', false, '卡片未找到')

// ───── ZIP ─────
console.log('\n— bundle.zip —')
if (await openByName('bundle.zip')) {
  const z0 = await page.evaluate(() => {
    const root = document.querySelector('.photo-preview')
    return {
      entries: [...root.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /\.(txt|png)/.test(t)),
      header: root.innerText.match(/ZIP · \d+ 项/)?.[0]
    }
  })
  ok('zip 列出 3 条目', z0.entries.length === 3 && z0.header === 'ZIP · 3 项', JSON.stringify(z0))
  await page.click('.photo-preview button:has-text("note.txt")')
  await page.waitForTimeout(1500)
  const zt = await page.evaluate(() => document.querySelector('.photo-preview pre')?.innerText ?? '(无 pre)')
  ok('zip 文本条目出正文', zt.includes('leaf 预览格式测试'), JSON.stringify(zt.slice(0, 30)))
  await page.click('.photo-preview button:has-text("pic.png")')
  await page.waitForTimeout(1500)
  const zi = await page.evaluate(() => {
    const img = [...document.querySelectorAll('.photo-preview img')].find((i) => i.getAttribute('alt') === 'zip entry')
    return { src: img?.src.slice(0, 16), w: img?.naturalWidth }
  })
  ok('zip 图片条目出图', (zi.src ?? '').startsWith('data:') && zi.w > 0, JSON.stringify(zi))
} else ok('zip 列出 3 条目', false, '卡片未找到')

// ───── 字体 ─────
console.log('\n— Arial.ttf —')
if (await openByName('Arial.ttf')) {
  const f0 = await page.evaluate(async () => {
    for (let i = 0; i < 25; i++) {
      const face = [...document.fonts].find((f) => f.family.startsWith('leaf-font-'))
      if (face) return { family: face.family, status: face.status }
      await new Promise((r) => setTimeout(r, 200))
    }
    return { none: true }
  })
  ok('FontFace 加载', !!f0.family && f0.status === 'loaded', JSON.stringify(f0))
  const fStyle = await page.evaluate(() => ({
    fam: getComputedStyle(document.querySelector('.photo-preview p.text-5xl')).fontFamily,
    real: document.querySelector('.photo-preview p.mb-6')?.textContent.trim()
  }))
  ok('样张用上该字体 + 报真实字体名', fStyle.fam.includes('leaf-font-'), JSON.stringify(fStyle))
  await page.click('.photo-preview button:has-text("字形表")')
  await page.waitForTimeout(6000)
  const g = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.photo-preview .grid span')]
    return {
      total: cells.length,
      red: cells.filter((c) => c.className.includes('bg-red-500')).length,
      note: document.querySelector('.photo-preview .grid')?.previousElementSibling?.textContent.trim().slice(0, 60)
    }
  })
  ok('字形表扫出缺字（Arial 无 CJK）', g.total > 200 && g.red > 100, JSON.stringify(g))
} else ok('FontFace 加载', false, '卡片未找到')

// ───── 书签 ─────
console.log('\n— 书签 —')
if (await openByName('格式测试书签')) {
  const b = await page.evaluate(() => {
    const root = document.querySelector('.photo-preview')
    const img = root.querySelector('img')
    const link = [...root.querySelectorAll('button')].find((x) => x.textContent.includes('example.com'))
    return {
      cover: img ? { src: img.currentSrc.slice(0, 22), w: img.naturalWidth } : null,
      title: root.querySelector('p.text-lg')?.textContent.trim(),
      link: link?.textContent.trim().slice(0, 34)
    }
  })
  ok('书签出截图+标题+原链接', !!b.link && !!b.title && (b.cover?.w ?? 0) > 0, JSON.stringify(b))
} else ok('书签出截图+标题+原链接', false, '卡片未找到')

// ───── 非图素材上的外框一致性 ─────
console.log('\n— 非图素材外框 —')
if (await openByName('ding.mp3')) {
  await page.mouse.move(600, 300)
  await page.waitForTimeout(200)
  const favBefore = await page.evaluate(() => [...document.querySelectorAll('.photo-preview button[title]')].find((x) => x.title.includes('收藏')).title)
  await page.click('.photo-preview button[title*="收藏"]')
  await page.waitForTimeout(600)
  await page.mouse.move(600, 800)
  await page.waitForTimeout(250)
  const nf = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.photo-preview button[title]')].find((x) => x.title.includes('收藏'))
    return { title: b.title, color: getComputedStyle(b).color }
  })
  const flipped = nf.title !== favBefore
  const lit = nf.title === '取消收藏' ? nf.color === 'rgb(251, 191, 36)' : nf.color === 'rgba(255, 255, 255, 0.7)'
  ok('音频上收藏回显+点亮', flipped && lit, `${favBefore} -> ${nf.title} color=${nf.color}`)
}
await clean()
console.log('\n===== 汇总 =====')
console.log(out.join('\n'))
process.exit(0)
