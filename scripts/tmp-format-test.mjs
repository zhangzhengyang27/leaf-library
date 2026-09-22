// 临时探针：视频/音频/PDF/ZIP/字体/书签 六类预览逐能力验收（跑完删除）
import { chromium } from 'playwright'

const ok = (n, p, d) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  · ' + d : ''}`)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const api = (fn, ...args) =>
  page.evaluate(async ([f, a]) => await new Function('return window.api.' + f)()(...a), [fn, args])
const clean = async () => {
  for (let i = 0; i < 8; i++) {
    const dirty = await page.evaluate(
      () =>
        !!document.querySelector('div.fixed.inset-0.z-\\[1000\\]') || !!document.querySelector('.photo-preview')
    )
    if (!dirty) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}

const FILES = [
  '/tmp/leaf-fmt-test/clip.mp4',
  '/tmp/leaf-fmt-test/clip.avi',
  '/tmp/leaf-fmt-test/ding.mp3',
  '/tmp/leaf-fmt-test/three-page.pdf',
  '/tmp/leaf-fmt-test/paper.pdf',
  '/tmp/leaf-fmt-test/bundle.zip',
  '/tmp/leaf-fmt-test/Arial.ttf'
]

console.log('— 入库 —')
const created = await api('photos.addMultiple', FILES)
const ids = created.map((p) => ({ id: p.id, name: p.fileName, kind: p.kind }))
console.log(ids.map((x) => `${x.kind}\t${x.name}`).join('\n'))
const bk = await api('photos.addBookmark', 'https://example.com/', 'Leaf 格式测试书签').catch((e) => ({ err: String(e).slice(0, 120) }))
console.log('bookmark:', bk.err ? 'ERR ' + bk.err : `${bk.kind} ${bk.fileName} url=${bk.sourceUrl}`)
const allIds = [...ids.map((x) => x.id), ...(bk.id ? [bk.id] : [])]

// 等缩略图管线
const deadline = Date.now() + 90000
let pending = allIds.length
for (;;) {
  const rows = await api('photos.getByIds' , allIds).catch(() => null)
  const list = rows ?? (await api('photos.getAll')).filter((p) => allIds.includes(p.id))
  pending = list.filter((p) => p.thumbStatus !== 1).length
  if (pending === 0 || Date.now() > deadline) {
    console.log(`thumbStatus: ${list.map((p) => `${p.fileName.slice(0, 16)}=${p.thumbStatus}`).join(' ')}`)
    break
  }
  await new Promise((r) => setTimeout(r, 2500))
}

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await clean()

const openByName = async (name) => {
  await clean()
  const found = await page.evaluate((n) => {
    const cards = [...document.querySelectorAll('[data-photo-id]')]
    return cards.find((c) => c.textContent.includes(n))?.dataset.photoId ?? null
  }, name)
  if (!found) {
    console.log(`(卡片不在当前视图: ${name})`)
    return null
  }
  await page.dblclick(`[data-photo-id="${found}"]`)
  await page.waitForTimeout(1200)
  return found
}
const previewText = () =>
  page.evaluate(() => document.querySelector('.photo-preview')?.innerText.replace(/\s+/g, ' ').slice(0, 200) ?? '(预览未开)')

// ───── 1 视频：可播容器 ─────
console.log('\n— clip.mp4（可内联播放）—')
await openByName('clip.mp4')
const v1 = await page.evaluate(async () => {
  const v = document.querySelector('.photo-preview video')
  if (!v) return { none: true, text: document.querySelector('.photo-preview')?.innerText.slice(0, 80) }
  for (let i = 0; i < 40 && v.readyState < 2; i++) await new Promise((r) => setTimeout(r, 250))
  return {
    present: true,
    readyState: v.readyState,
    size: [v.videoWidth, v.videoHeight],
    dur: +v.duration.toFixed(2),
    paused: v.paused,
    controls: v.controls,
    rate: v.playbackRate
  }
})
ok('mp4 出 <video> 且能解出画面', v1.present && v1.readyState >= 2 && v1.size[0] > 0, JSON.stringify(v1))
// 空格 = 播放/暂停（不是关预览）
const p0 = await page.evaluate(() => document.querySelector('.photo-preview video')?.paused)
await page.keyboard.press('Space')
await page.waitForTimeout(600)
const p1 = await page.evaluate(() => ({ paused: document.querySelector('.photo-preview video')?.paused, open: !!document.querySelector('.photo-preview') }))
ok('空格切播放不关框', p0 !== p1.paused && p1.open, `paused ${p0}->${p1.paused} open=${p1.open}`)
// 逐帧（先确保暂停，否则播放推进会污染时间差）
await page.evaluate(() => document.querySelector('.photo-preview video').pause())
await page.waitForTimeout(200)
const t0 = await page.evaluate(() => document.querySelector('.photo-preview video').currentTime)
await page.click('.photo-preview button:has-text("帧+")')
await page.waitForTimeout(400)
const t1 = await page.evaluate(() => document.querySelector('.photo-preview video').currentTime)
ok('逐帧步进', Math.abs(t1 - t0 - 1 / 30) < 0.02, `${t0.toFixed(4)} -> ${t1.toFixed(4)}`)
// 倍速
const r0 = await page.$eval('.photo-preview button[title="切换播放速度"]', (e) => e.textContent.trim())
await page.click('.photo-preview button[title="切换播放速度"]')
await page.waitForTimeout(300)
const r1 = await page.evaluate(() => ({
  label: document.querySelector('.photo-preview button[title="切换播放速度"]').textContent.trim(),
  rate: document.querySelector('.photo-preview video').playbackRate
}))
ok('倍速切换', r0 === '1x' && r1.label === '2x' && r1.rate === 2, `${r0} -> ${r1.label} (video.playbackRate=${r1.rate})`)
// 视频不该有评分以外的位图动作：⋯ 菜单里不应出现「找相似 / 设为壁纸」
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="找相似"]')
await page.waitForTimeout(400)
const vmenu = await page.$$eval('div.z-\\[1300\\] button', (els) => els.map((e) => e.textContent.trim()).filter(Boolean))
ok('视频 ⋯ 菜单收敛掉位图动作', !vmenu.some((t) => t.includes('找相似') || t.includes('壁纸')), JSON.stringify(vmenu))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
// 评分在视频上同样回显
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('div[title="评分"] button[aria-label="评 3 星"]')
await page.waitForTimeout(500)
await page.mouse.move(600, 800)
await page.waitForTimeout(250)
const vstars = await page.$$eval('div[title="评分"] button', (e) => e.filter((x) => getComputedStyle(x).color.includes('251, 191')).length)
ok('视频评分回显', vstars === 3, `lit=${vstars}`)

// ───── 2 视频：不可播容器 ─────
console.log('\n— clip.avi（容器不可内联播放）—')
await openByName('clip.avi')
const av = await page.evaluate(() => {
  const root = document.querySelector('.photo-preview')
  return {
    hasVideoTag: !!root.querySelector('video'),
    cover: root.querySelector('img')?.currentSrc?.slice(0, 40),
    coverOk: root.querySelector('img')?.naturalWidth,
    saysNoPlay: root.innerText.includes('无法在应用内播放'),
    hasOpenBtn: [...root.querySelectorAll('button')].some((b) => b.textContent.includes('用系统播放器打开'))
  }
})
ok('avi 退化封面+系统播放器出口', av.hasVideoTag === false && av.saysNoPlay && av.hasOpenBtn && av.coverOk > 0, JSON.stringify(av))

// ───── 3 音频 ─────
console.log('\n— ding.mp3 —')
await openByName('ding.mp3')
const au = await page.evaluate(async () => {
  const a = document.querySelector('.photo-preview audio')
  if (!a) return { none: true, text: document.querySelector('.photo-preview').innerText.slice(0, 60) }
  for (let i = 0; i < 30 && a.readyState < 2; i++) await new Promise((r) => setTimeout(r, 200))
  const t0 = a.currentTime
  await a.play().catch(() => {})
  await new Promise((r) => setTimeout(r, 500))
  const moved = a.currentTime > t0
  a.pause()
  return { present: true, readyState: a.readyState, dur: +a.duration.toFixed(2), controls: a.controls, moved }
})
ok('mp3 出 <audio> 且能推进播放头', au.present && au.readyState >= 2 && au.dur > 0 && au.moved, JSON.stringify(au))

// ───── 4 PDF：三页自造 + 真实 PDF ─────
for (const [label, name] of [['three-page.pdf（自造 3 页）', 'three-page.pdf'], ['paper.pdf（真实论文）', 'paper.pdf']]) {
  console.log(`\n— ${label} —`)
  await openByName(name)
  const pdf = await page.evaluate(() => {
    const c = document.querySelector('.photo-preview canvas')
    const root = document.querySelector('.photo-preview')
    const indicator = [...root.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => /^\d+\s*\/\s*\d+$/.test(t))
    let ink = 0
    if (c) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) ink++
    }
    return { canvas: c ? [c.width, c.height] : null, ink, indicator, err: root.innerText.match(/失败[^\n]{0,60}/)?.[0] }
  })
  ok(`${name} 渲染出画面`, pdf.canvas && pdf.ink > 20, JSON.stringify(pdf))
  const pager = await page.$$eval('.photo-preview button[title*="下一页"], .photo-preview button:has-text("下一页")', (e) => e.map((b) => b.disabled))
  if (name === 'three-page.pdf') {
    const before = await page.evaluate(() => document.querySelector('.photo-preview canvas').toDataURL().length)
    await page.click('.photo-preview button:has-text("下一页")')
    await page.waitForTimeout(1500)
    const after = await page.evaluate(() => ({
      size: document.querySelector('.photo-preview canvas').toDataURL().length,
      ind: [...document.querySelectorAll('.photo-preview span')].map((s) => s.textContent.trim()).find((t) => /^\d+\s*\/\s*\d+$/.test(t))
    }))
    ok('PDF 翻页到第 2 页且画面变化', after.ind === '2 / 3' && after.size !== before, `${pdf.indicator} -> ${after.ind}`)
    const lastDisabled = await page.$eval('.photo-preview button:has-text("上一页")', (b) => b.disabled)
    ok('首页时「上一页」禁用', lastDisabled === false || pdf.indicator !== '1 / 3', `disabled=${lastDisabled}`)
  }
  void pager
}

// ───── 5 ZIP ─────
console.log('\n— bundle.zip —')
await openByName('bundle.zip')
const z0 = await page.evaluate(() => {
  const root = document.querySelector('.photo-preview')
  return {
    entries: [...root.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /\.(txt|png)$/.test(t)),
    header: root.innerText.match(/ZIP · \d+ 项/)?.[0],
    hint: root.innerText.includes('选择左侧文件预览')
  }
})
ok('zip 列出条目', z0.entries.length === 3 && !!z0.header, JSON.stringify(z0))
await page.click(`.photo-preview button:has-text("note.txt")`)
await page.waitForTimeout(1200)
const zt = await page.evaluate(() => document.querySelector('.photo-preview pre')?.innerText ?? '(无 pre)')
ok('zip 文本条目预览', zt.includes('leaf 预览格式测试'), JSON.stringify(zt.slice(0, 40)))
await page.click(`.photo-preview button:has-text("pic.png")`)
await page.waitForTimeout(1200)
const zi = await page.evaluate(() => {
  const img = [...document.querySelectorAll('.photo-preview img')].find((i) => i.getAttribute('alt') === 'zip entry')
  return { src: img?.src.slice(0, 22), w: img?.naturalWidth }
})
ok('zip 图片条目预览', zi.src?.startsWith('data:') && zi.w > 0, JSON.stringify(zi))

// ───── 6 字体 ─────
console.log('\n— Arial.ttf —')
await openByName('Arial.ttf')
const f0 = await page.evaluate(async () => {
  for (let i = 0; i < 30; i++) {
    const face = [...document.fonts].find((f) => f.family.startsWith('leaf-font-'))
    if (face) return { family: face.family, status: face.status }
    await new Promise((r) => setTimeout(r, 200))
  }
  return { none: true, text: document.querySelector('.photo-preview')?.innerText.slice(0, 60) }
})
ok('字体 FontFace 已加载', !!f0.family && f0.status === 'loaded', JSON.stringify(f0))
const fStyle = await page.evaluate(() => {
  const el = document.querySelector('.photo-preview p.text-5xl')
  return { fam: getComputedStyle(el).fontFamily, real: document.querySelector('.photo-preview p.mb-6')?.textContent.trim() }
})
ok('样张真的用上了该字体', fStyle.fam.includes('leaf-font-'), JSON.stringify(fStyle))
await page.click('.photo-preview button:has-text("字形表")')
await page.waitForTimeout(4000)
const g = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.photo-preview .grid span')]
  return { total: cells.length, red: cells.filter((c) => c.className.includes('bg-red-500')).length, note: document.querySelector('.photo-preview .grid')?.previousElementSibling?.textContent?.trim() }
})
ok('字形表扫描出缺字（Arial 无 CJK）', g.total > 200 && g.red > 100, JSON.stringify(g))

// ───── 7 书签 ─────
if (bk.id) {
  console.log('\n— 书签 —')
  const found = await openByName('格式测试书签')
  if (found) {
    const b = await page.evaluate(() => {
      const root = document.querySelector('.photo-preview')
      const img = root.querySelector('img')
      const link = [...root.querySelectorAll('button')].find((x) => x.textContent.includes('example.com'))
      return {
        cover: img ? { src: img.currentSrc.slice(0, 24), w: img.naturalWidth } : null,
        title: root.querySelector('p.text-lg')?.textContent.trim(),
        link: link?.textContent.trim().slice(0, 40),
        desc: root.querySelector('p.text-sm')?.textContent.trim().slice(0, 40)
      }
    })
    ok('书签出截图+标题+原链接', !!b.link && !!b.title && b.cover?.w > 0, JSON.stringify(b))
  } else ok('书签出截图+标题+原链接', false, '卡片未找到')
}

// ───── 8 非图素材上的通用外框（评分/收藏/标签） ─────
console.log('\n— 非图素材的外框一致性 —')
await openByName('ding.mp3')
await page.mouse.move(600, 300)
await page.waitForTimeout(200)
await page.click('.photo-preview button[title*="收藏"]')
await page.waitForTimeout(500)
await page.mouse.move(600, 800)
await page.waitForTimeout(250)
const nf = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.photo-preview button[title]')].find((x) => x.title.includes('收藏'))
  return { title: b.title, color: getComputedStyle(b).color }
})
ok('音频上收藏同样回显+点亮', nf.title === '取消收藏' && nf.color === 'rgb(251, 191, 36)', JSON.stringify(nf))

// ───── 还原 ─────
console.log('\n— 清理 —')
await clean()
await api('photos.deleteMultiple', allIds)
const trashNow = await api('photos.getRecycleBin')
console.log(`回收站 ${trashNow.length} 项：${trashNow.map((p) => p.fileName.slice(0, 18)).join(' | ')}`)
if (trashNow.length === allIds.length) {
  await api('photos.clearRecycleBin')
  console.log(`已彻底清理；库内剩余 ${await api('photos.getCount')} 项（测试前 27 项）`)
} else {
  console.log('⚠ 回收站里混有测试之外的条目，未执行清空')
}
process.exit(0)
