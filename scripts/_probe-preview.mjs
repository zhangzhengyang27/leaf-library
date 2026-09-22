import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const rows = []
const check = (name, ok, extra = '') =>
  rows.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  → ${extra}` : ''}`)

const img = () => page.locator('.photo-preview img').first()

async function state() {
  return img().evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform)
    const s = el.parentElement.getBoundingClientRect()
    return {
      scale: m.a,
      tx: m.e,
      ty: m.f,
      ty: m.f,
      natW: el.naturalWidth,
      natH: el.naturalHeight,
      stageW: s.width,
      stageH: s.height
    }
  })
}

const previewOpen = async () => (await page.locator('.photo-preview').count()) > 0

const counterText = async () =>
  page.evaluate(() => {
    const m = document.querySelector('.photo-preview')?.textContent.match(/(\d+)\s*\/\s*(\d+)/)
    return m ? m[0] : null
  })

async function run() {
  await page.evaluate(() => {
    location.hash = '#/photos'
  })
  await page.waitForTimeout(600)
  // 上一次探针可能把预览留在打开态，先清干净
  for (let i = 0; i < 4 && (await previewOpen()); i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }

  await page.locator('img[src^="thumb://"]').first().dblclick()
  await page.waitForTimeout(700)
  if (!(await previewOpen())) {
    await page.locator('img[src^="thumb://"]').first().click()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(700)
  }
  check('预览可打开', await previewOpen())
  if (!(await previewOpen())) return

  const c = await counterText()
  check('工具栏有 n / 总数 计数', !!c && /^\d+ \/ \d+$/.test(c), String(c))

  const s0 = await state()
  const expectFit = Math.min(s0.stageW / s0.natW, s0.stageH / s0.natH, 4)
  check(
    '初始=适应窗口',
    Math.abs(s0.scale - expectFit) < 0.02,
    `nat=${s0.natW}x${s0.natH} stage=${Math.round(s0.stageW)}x${Math.round(s0.stageH)} scale=${s0.scale.toFixed(3)} 期望=${expectFit.toFixed(3)}`
  )
  check(
    '小图放大铺满（scale>1）',
    s0.natW < s0.stageW && s0.natH < s0.stageH ? s0.scale > 1.02 : true,
    `scale=${s0.scale.toFixed(2)}`
  )

  const box = await img().evaluate((el) => {
    const r = el.parentElement.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.move(box.x, box.y)
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(150)
  const s1 = await state()
  check('滚轮向上 = 放大', s1.scale > s0.scale * 1.05, `${s0.scale.toFixed(3)} → ${s1.scale.toFixed(3)}`)

  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(120)
  const s2 = await state()
  // 只测纵向：横向此时没溢出（830 < 1280），夹在 0 是预期
  check(
    '放大后可拖拽平移（纵向溢出）',
    Math.abs(s2.ty - s1.ty) > 20,
    `translateY 变化 ${(s2.ty - s1.ty).toFixed(1)}px / X ${(s2.tx - s1.tx).toFixed(1)}px`
  )

  await page.mouse.dblclick(box.x, box.y)
  await page.waitForTimeout(150)
  const s3 = await state()
  check('双击切到 100% 实际像素', Math.abs(s3.scale - 1) < 0.02, `scale=${s3.scale.toFixed(3)}`)

  await page.keyboard.press('0')
  await page.waitForTimeout(120)
  const s4 = await state()
  check('按 0 回适应窗口', Math.abs(s4.scale - expectFit) < 0.02, `scale=${s4.scale.toFixed(3)}`)
  await page.keyboard.press('+')
  await page.waitForTimeout(120)
  const s5 = await state()
  check('按 + 放大', s5.scale > s4.scale * 1.05, `${s4.scale.toFixed(3)} → ${s5.scale.toFixed(3)}`)

  const tagInput = page.locator('.photo-preview input[list="photo-tag-suggestions"]')
  await tagInput.focus()
  const before = await counterText()
  await page.keyboard.press('Space')
  await page.waitForTimeout(120)
  check('标签框内空格不关预览', await previewOpen())
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  check('标签框内 → 不翻页', (await counterText()) === before, `${before} → ${await counterText()}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  const focused = await page.evaluate(() => document.activeElement?.tagName)
  check(
    '标签框内 Esc 只退出输入不关预览',
    (await previewOpen()) && focused !== 'INPUT',
    `activeElement=${focused}`
  )

  await page.getByRole('button', { name: '更多 ▾' }).click()
  await page.waitForTimeout(250)
  const menuText = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('div')).filter((d) =>
      d.textContent?.includes('在文件夹中显示')
    )
    return (nodes[nodes.length - 1]?.textContent ?? '').slice(0, 80)
  })
  check(
    '更多菜单含 5 项文件动作',
    ['重命名', '在文件夹中显示', '用默认应用打开', '复制文件路径', '导出'].every((k) =>
      menuText.includes(k)
    ),
    menuText
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check('菜单 Esc 只关菜单（预览不被连带关掉）', await previewOpen())

  const stageBox = await img().evaluate((el) => {
    const r = el.parentElement.getBoundingClientRect()
    return { x: r.x, y: r.y }
  })
  await page.mouse.click(stageBox.x + 4, stageBox.y + 4)
  await page.waitForTimeout(250)
  check('点舞台空白可关预览', !(await previewOpen()))
}

try {
  await run()
} catch (err) {
  rows.push(`THREW  ${err.message.split('\n')[0]}`)
}
console.log(rows.join('\n'))
await browser.close()
