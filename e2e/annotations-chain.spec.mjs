/**
 * 标注消费端全链真机验收（实施计划「验收（判别性）」一条链跑完）
 *
 * 为什么要有这条：标注四期各自有单测，但「框选 → 落库 → 回显 → 徽标 → 筛选 → 删除」
 * 这条消费链任何一环断了（坐标系换算错、overlay 没挂上、徽标开关没补拉、筛选下推
 * 漏配）单测照样全绿。判别核心在第 2 步：拖拽端点按 img 显示矩形的**百分比**放置，
 * 落库的 rect 必须等于「百分比 × 源图自然尺寸」——显示层换算错了这条必红。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/annotations-chain.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
// 真图 fixture：640×480 PNG（AI 探针图片池同款）
const FIXTURE_PNG = join(ROOT, 'e2e', 'fixtures', 'ai-probe', 'img', 'bread.png')
const NAT_W = 640
const NAT_H = 480
const ANNO_BODY = 'e2e 框选区'

let app = null
let userDataDir = null
let libraryDir = null

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launch() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })
  let page = null
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && !page) {
    for (const w of app.windows()) {
      try {
        if (/本地工具箱|Leaf/.test(await w.title())) page = w
      } catch {
        /* 窗口还在开 */
      }
    }
    if (!page) await new Promise((r) => setTimeout(r, 200))
  }
  if (!page) throw new Error('主窗口没起来')
  await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
    timeout: 25_000
  })
  await page.evaluate(async () => {
    if (window.api?.preferences?.setOnboardingCompleted) {
      await window.api.preferences.setOnboardingCompleted()
    }
  })
  return page
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function closeApp() {
  if (app) await app.close()
  app = null
}

/** 网格里当前可见卡片的文件名集合（顺序不敏感） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function visibleNames(page) {
  const texts = await page.locator('[data-photo-id]').allInnerTexts()
  const names = []
  for (const t of texts) {
    const hit = t
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.endsWith('.png'))
    if (hit) names.push(hit)
  }
  return names.sort()
}

/** 双击卡片进预览（code-preview 同款入口） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function openPreview(page, name) {
  const card = page.locator('[data-photo-id]').filter({ hasText: name }).first()
  await card.waitFor({ timeout: 20_000 })
  await card.dblclick()
  await page.locator('.photo-preview .preview-stage img').waitFor({ timeout: 20_000 })
}

/**
 * 关预览：Esc 的语义链是「标注模式开着 → 先退模式；否则关预览」，所以按到
 * .photo-preview 真消失为止（不点关闭键，绕开 chrome 静止淡出的 pointer-events）。
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function closePreview(page) {
  for (let i = 0; i < 3; i++) {
    if (!(await page.locator('.photo-preview').count())) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  await page.locator('.photo-preview').waitFor({ state: 'detached', timeout: 10_000 })
}

/** 进标注模式：预览打开后点缩放 HUD 里的标注键，等 overlay 真挂载（naturalKnown 才挂） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function enterAnnotationMode(page) {
  // chrome（含 HUD）鼠标静止 2.2s 会淡出：先动一下鼠标把 chrome 顶回来再点
  await page.locator('.photo-preview .preview-stage').hover({ position: { x: 10, y: 10 } })
  await page.waitForTimeout(300)
  await page.locator('button[title="标注：拖拽圈注"]').click()
  await page.locator('[data-annotation-overlay]').waitFor({ timeout: 10_000 })
}

test('标注全链：框选落库（坐标系判别）→ 回显 → 徽标 → 筛选命中 → 删除翻转', async () => {
  test.setTimeout(240_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-anno-chain-user-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-anno-chain-lib-'))
  mkdirSync(join(libraryDir, 'images'), { recursive: true })
  // 预置非 legacy 库（不预置时启动走 userData 旧布局，网格停在空状态面板——真机踩过）
  writeFileSync(
    join(userDataDir, 'libraries.json'),
    JSON.stringify({
      activeLibraryId: 'probe',
      libraries: [
        {
          id: 'probe',
          name: '探针库',
          path: libraryDir,
          legacy: false,
          createdAt: Date.now(),
          lastOpenedAt: Date.now()
        }
      ]
    })
  )

  try {
    const page = await launch()

    // 筛选行默认收起（开关走 localStorage，原生菜单 accelerator 打不到，saved-filters 同款）；
    // 「标注」维非默认图钉，一并种进 localStorage，之后那次 reload 一次两用
    await page.evaluate(() => {
      localStorage.setItem('leaf.filterbar-visible', '1')
      localStorage.setItem(
        'leaf.filter-dimensions-pinned',
        JSON.stringify(['color', 'tags', 'folders', 'shape', 'rating', 'format', 'annotations'])
      )
    })

    // ── 第 1 步 · 导入真图 fixture ──
    const rows = await page.evaluate(
      async (p) => await window.api.photos.importPaths([p]),
      FIXTURE_PNG
    )
    expect(rows, JSON.stringify(rows)).toHaveLength(1)
    const photoId = rows[0].id
    expect(photoId).toMatch(/^[0-9a-f-]{36}$/i)

    // IPC 直导不触发渲染层池子刷新（拖拽路径才会）→ reload 让网格从库里读
    await page.reload()
    await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
      timeout: 25_000
    })
    const card = page.locator('[data-photo-id]').filter({ hasText: 'bread.png' }).first()
    await card.waitFor({ timeout: 20_000 })

    // ── 第 2 步 · 预览框选：拖拽端点取 img 显示矩形百分比，落库 rect 必须回到源图像素 ──
    await openPreview(page, 'bread.png')
    await enterAnnotationMode(page)

    // 拖拽意图：显示矩形内 (25%,30%) → (65%,70%)。换算正确的实现落库必是
    // x=0.25·640=160, y=0.30·480=144, w=0.40·640=256, h=0.40·480=192（宽高 ≥10 源图像素）
    const FRAC = { x1: 0.25, y1: 0.3, x2: 0.65, y2: 0.7 }
    const bbox = await page.evaluate(() => {
      const r = document.querySelector('.photo-preview .preview-stage img').getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height }
    })
    expect(bbox.width, '预览底图必须有真实显示尺寸').toBeGreaterThan(50)
    await page.mouse.move(bbox.left + FRAC.x1 * bbox.width, bbox.top + FRAC.y1 * bbox.height)
    await page.mouse.down()
    await page.mouse.move(bbox.left + FRAC.x2 * bbox.width, bbox.top + FRAC.y2 * bbox.height, {
      steps: 12
    })
    await page.mouse.up()

    // 内联输入框 → 填词回车保存（create）
    const editor = page.locator('[data-annotation-editor]')
    await expect(editor, '拖拽松手后内联输入框要出现').toBeVisible()
    await editor.fill(ANNO_BODY)
    await editor.press('Enter')

    // 落库断言（判别核心）：rect 是源图像素坐标，哪一步换算错了这里必红
    await expect
      .poll(
        async () =>
          await page.evaluate(
            async (pid) => (await window.api.annotations.list(pid)).filter((a) => a.rect).length,
            photoId
          ),
        { timeout: 15_000 },
        '框选标注没落库'
      )
      .toBe(1)
    const items = await page.evaluate(
      async (pid) => await window.api.annotations.list(pid),
      photoId
    )
    expect(items).toHaveLength(1)
    const rect = items[0].rect
    expect(items[0].body).toBe(ANNO_BODY)
    expect(
      Math.abs(rect.x - FRAC.x1 * NAT_W),
      `rect.x 应为 0.25×640=160，实际 ${rect.x}`
    ).toBeLessThanOrEqual(0.5)
    expect(
      Math.abs(rect.y - FRAC.y1 * NAT_H),
      `rect.y 应为 0.30×480=144，实际 ${rect.y}`
    ).toBeLessThanOrEqual(0.5)
    expect(
      Math.abs(rect.w - (FRAC.x2 - FRAC.x1) * NAT_W),
      `rect.w 应为 0.40×640=256，实际 ${rect.w}`
    ).toBeLessThanOrEqual(0.5)
    expect(
      Math.abs(rect.h - (FRAC.y2 - FRAC.y1) * NAT_H),
      `rect.h 应为 0.40×480=192，实际 ${rect.h}`
    ).toBeLessThanOrEqual(0.5)
    expect(rect.w, '源图像素宽 ≥10（主进程校验下限，这里按意图应是 256）').toBeGreaterThanOrEqual(
      10
    )
    expect(rect.h, '源图像素高 ≥10').toBeGreaterThanOrEqual(10)
    await closePreview(page)

    // ── 第 3 步 · 回显：关开预览，overlay 框按 rect/自然尺寸 的百分比画回原位 ──
    await openPreview(page, 'bread.png')
    await enterAnnotationMode(page)
    const boxStyle = await page.evaluate(
      () =>
        document.querySelector('[data-annotation-overlay] > div.group')?.getAttribute('style') ?? ''
    )
    expect(boxStyle, '重开预览后 overlay 框必须在（回显）').not.toBe('')
    const pct = Object.fromEntries(
      boxStyle
        .split(';')
        .map((s) => s.trim().split(':'))
        .filter((p) => p.length === 2 && p[1].trim().endsWith('%'))
        .map(([k, v]) => [k.trim(), parseFloat(v)])
    )
    expect(pct.left, `回显 left% 应为 ${((rect.x / NAT_W) * 100).toFixed(1)}`).toBeCloseTo(
      (rect.x / NAT_W) * 100,
      1
    )
    expect(pct.top).toBeCloseTo((rect.y / NAT_H) * 100, 1)
    expect(pct.width).toBeCloseTo((rect.w / NAT_W) * 100, 1)
    expect(pct.height).toBeCloseTo((rect.h / NAT_H) * 100, 1)
    await closePreview(page)

    // ── 第 4 步 · 徽标：布局弹层开「标注数」，卡片徽标出现且计数 = 1 ──
    await page.getByRole('button', { name: '布局与显示选项' }).click()
    await page.getByRole('switch', { name: '标注数' }).click()
    // 开关打开瞬间由 usePhotoData 的 watch 补拉计数（异步 IPC），轮询等它落地
    await expect(card.locator('[data-test="annotation-count-badge"]')).toHaveText('1', {
      timeout: 15_000
    })
    await page.getByRole('button', { name: '布局与显示选项' }).click() // 再点一下收弹层

    // ── 第 5 步 · 筛选：「标注」维 有标注 命中 / 无标注 排除 ──
    const annoChip = page.getByRole('button', { name: '标注', exact: true })
    await expect(annoChip).toHaveCount(1)
    await annoChip.click()
    await page.getByRole('button', { name: /有标注/ }).click()
    await expect.poll(() => visibleNames(page), { timeout: 20_000 }).toEqual(['bread.png'])

    await annoChip.click()
    await page.getByRole('button', { name: /无标注/ }).click()
    await expect
      .poll(() => visibleNames(page), { timeout: 20_000 }, '无标注档必须把唯一素材筛出去')
      .toEqual([])

    // ── 第 6 步 · 删除：overlay 选中框 → ✕ → 徽标消失 / 筛选翻转 ──
    // 无标注档把 bread 筛掉了，先切回「有标注」让卡片回到网格（顺带复钉正向筛选）
    await annoChip.click()
    await page.getByRole('button', { name: /有标注/ }).click()
    await expect.poll(() => visibleNames(page), { timeout: 20_000 }).toEqual(['bread.png'])
    await openPreview(page, 'bread.png')
    await enterAnnotationMode(page)
    await page.locator('[data-annotation-overlay] > div.group').click() // 第一击选中
    await page.getByRole('button', { name: `删除标注：${ANNO_BODY}` }).click()
    await expect
      .poll(
        async () =>
          await page.evaluate(async (pid) => await window.api.annotations.list(pid), photoId),
        { timeout: 15_000 },
        '删除后库里不该再有标注'
      )
      .toEqual([])
    await closePreview(page)

    // 徽标消失 + 筛选翻转：计数缓存只在池加载/开关打开时刷新，reload 走真实用户路径；
    // 有标注档此刻仍在（删除还没重查池）→ 正好钉「删完即翻空」
    await page.reload()
    await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
      timeout: 25_000
    })
    await expect
      .poll(() => visibleNames(page), { timeout: 20_000 }, '删完标注后有标注档必须翻成空')
      .toEqual([])

    // 切「无标注」：素材回来，且「标注数」开关还开着 → 徽标必须消失
    await annoChip.click()
    await page.getByRole('button', { name: /无标注/ }).click()
    await expect.poll(() => visibleNames(page), { timeout: 20_000 }).toEqual(['bread.png'])
    const card2 = page.locator('[data-photo-id]').filter({ hasText: 'bread.png' }).first()
    await expect(card2.locator('[data-test="annotation-count-badge"]')).toHaveCount(0, {
      timeout: 15_000
    })
  } finally {
    await closeApp()
    for (const d of [userDataDir, libraryDir]) if (d) rmSync(d, { recursive: true, force: true })
  }
})
