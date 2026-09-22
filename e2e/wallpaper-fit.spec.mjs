/**
 * Leaf · 壁纸适配 E2E（playwright + _electron，独立 userData，不碰真实素材库）
 *
 * 1. 判定与渲染层接线：assess 的屏幕物理像素与 Electron 实报一致、非素材路径被拒、
 *    检查器策略菜单能开出并说明适配代价。全程无副作用。
 * 2. 真设桌面（WP_REAL_SET=1 才跑）：cover / 模糊底各改写一次 macOS 桌面，
 *    断言派生 JPEG 落盘 + 尺寸 + 无 alpha + 二次命中缓存，最后把壁纸还原。
 *
 * 用法：pnpm build && npx playwright test e2e/wallpaper-fit.spec.mjs
 *      WP_REAL_SET=1 npx playwright test e2e/wallpaper-fit.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join } from 'node:path'
import { mkdtempSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')

let app = null
let userDataDir = null
let assetDir = null

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs
const getMainWindow = async () => {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      try {
        if (/本地工具箱|Leaf/.test(await w.title())) return w
      } catch {
        /* 窗口可能已关闭 */
      }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return app.firstWindow()
}

test.describe.configure({ timeout: 120_000 })

test.beforeAll(async () => {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-wp-probe-profile-'))
  assetDir = mkdtempSync(join(tmpdir(), 'leaf-wp-probe-assets-'))
  app = await electron.launch({ args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`], launchOptions: { env } })
}, 120000)

test.afterAll(async () => {
  if (app) await app.close()
  for (const dir of [userDataDir, assetDir]) {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

test('assess 判定与真实屏幕一致，策略菜单可开出', async () => {
  const page = await getMainWindow()
  await page.evaluate(async () => {
    await window.api?.preferences?.setOnboardingCompleted?.()
  })
  await page.waitForTimeout(500)

  // 竖图（底部白条：cover 必裁）+ 与主屏同比例的宽图
  const portrait = join(assetDir, 'portrait.png')
  const wide = join(assetDir, 'wide.png')
  const strip = await sharp({ create: { width: 900, height: 60, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  await sharp({ create: { width: 900, height: 1800, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .composite([{ input: strip, top: 1740, left: 0 }])
    .png()
    .toFile(portrait)

  const displays = await app.evaluate(({ screen }) =>
    screen.getAllDisplays().map((d) => ({
      width: Math.round(d.size.width * d.scaleFactor),
      height: Math.round(d.size.height * d.scaleFactor)
    }))
  )
  console.log('wp-e2e: displays(physical) =', JSON.stringify(displays))
  const primary = displays[0]
  // 与主屏同比例、同尺寸（长边不超封顶）→ 应判原图直设
  const wideW = Math.min(primary.width, 4096)
  const wideH = Math.round((wideW * primary.height) / primary.width)
  await sharp({ create: { width: wideW, height: wideH, channels: 3, background: { r: 40, g: 60, b: 80 } } })
    .png()
    .toFile(wide)

  const imported = await page.evaluate(
    async (paths) => await window.api.photos.addMultiple(paths),
    [portrait, wide]
  )
  console.log('wp-e2e: imported =', JSON.stringify(imported?.added ?? imported))

  // D-020：入库即拷贝，素材指的是库内那份副本（这条以前断言 filePath === 原路径）
  const rowOf = (name) => imported.find((x) => x.fileName === name)
  const pRow = rowOf('portrait.png')
  expect(pRow.filePath, '素材指向库内副本').not.toBe(portrait)
  expect(pRow.filePath.startsWith(assetDir), '副本不在素材临时目录里').toBe(false)
  expect(existsSync(pRow.filePath), '库内副本确实在盘上').toBe(true)
  expect(pRow.sourcePath, '原件路径记在 source_path').toBe(portrait)
  expect(existsSync(portrait), '原件仍在原处').toBe(true)

  const pFit = await page.evaluate(async (fp) => await window.api.assessWallpaper(fp), pRow.filePath)
  const wFit = await page.evaluate(
    async (fp) => await window.api.assessWallpaper(fp),
    rowOf('wide.png').filePath
  )
  console.log('wp-e2e: portrait fit =', JSON.stringify(pFit))
  console.log('wp-e2e: wide fit =', JSON.stringify(wFit?.assessments?.[0] ?? wFit))
  expect(pFit.ok).toBe(true)
  expect(pFit.assessments[0].screen.width).toBeGreaterThan(0)
  expect(pFit.assessments[0].source).toEqual({ width: 900, height: 1800 })
  expect(pFit.assessments[0].strategy).toBe('blurred')
  expect(wFit.assessments[0].strategy).toBe('original')
  expect(wFit.assessments[0].screen).toEqual({
    width: Math.min(primary.width, 4096),
    height: Math.round((Math.min(primary.width, 4096) * primary.height) / primary.width)
  })

  // 等处理管线回填（thumbStatus → 1，colorDominant 有值），否则菜单文案会缺
  await page
    .waitForFunction(
      async (id) => (await window.api.photos.getById(id))?.thumbStatus === 1,
      pRow.id,
      { timeout: 30000 }
    )
    .catch(() => console.log('wp-e2e: thumb 管线未在 30s 内完成'))

  // 非素材路径必须被拒（协议级：assess 与 set 同一口径）
  const outside = join(assetDir, 'not-in-library.png')
  await sharp({ create: { width: 10, height: 10, channels: 3, background: '#123456' } }).png().toFile(outside)
  const rejected = await page.evaluate(async (p) => await window.api.assessWallpaper(p), outside)
  expect(rejected.ok).toBe(false)
  expect(rejected.error).toContain('素材库')

  // 渲染层：切到图库并整页重载（IPC 直插不推渲染层），选中卡片 → 检查器壁纸按钮 → 策略菜单
  await page.evaluate(() => {
    window.location.hash = '#/photos'
  })
  await page.reload()
  await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
    timeout: 20000
  })
  const card = page.locator('[data-photo-id]').filter({ hasText: 'portrait.png' }).first()
  await card.waitFor({ timeout: 20000 })
  await card.click()
  await page.waitForTimeout(600)
  const wpButton = page.locator('button[title^="设为桌面壁纸"]')
  await expect(wpButton).toHaveCount(1)
  await wpButton.click()
  await page.waitForTimeout(400)
  const items = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  console.log('wp-e2e: menu =', JSON.stringify(items))
  expect(items.join('|')).toContain('模糊留白（不裁内容）')
  expect(items.join('|')).toMatch(/自动适配 → (居中裁切填满|模糊留白)/)
  expect(items.join('|')).toMatch(/｜/)
  await page.keyboard.press('Escape')

  // 预览面板入口：双击卡片进预览 → ▾ 展开同一套策略菜单
  await card.dblclick()
  await page.waitForTimeout(600)
  const autoButton = page.locator('button[title="按屏幕比例适配后设为桌面壁纸"]')
  await expect(autoButton).toHaveCount(1)
  const menuButton = page.locator('button[title^="选择适配方式"]')
  await expect(menuButton).toHaveCount(1)
  await menuButton.click()
  await page.waitForTimeout(500)
  const previewItems = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  console.log('wp-e2e: 预览面板菜单 =', JSON.stringify(previewItems))
  expect(previewItems.join('|')).toContain('自动适配 → 模糊留白（不裁内容）')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // 右键菜单入口：用菜单搜索把「设为壁纸」滤到首行（否则长菜单里它在视口外），
  // 展开子菜单验证三项策略都在（点它们才会改桌面，这里只验证接线）
  await card.click({ button: 'right' })
  await page.waitForTimeout(500)
  await page.locator('[role="menu"] input[type="text"]').fill('壁纸')
  await page.waitForTimeout(300)
  const parentRow = page.locator('[role="menuitem"]', { hasText: '设为壁纸' })
  await expect(parentRow).toHaveCount(1)
  await parentRow.hover()
  await page.waitForTimeout(500)
  const subItems = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  const strategies = subItems.filter((t) => /自动|裁切|模糊|原图/.test(t))
  console.log('wp-e2e: 右键子菜单 =', JSON.stringify(strategies))
  expect(strategies).toEqual([
    '自动适配（按屏判定）',
    '居中裁切填满',
    '模糊留白（不裁内容）',
    '原图直设（不处理）'
  ])
  await page.keyboard.press('Escape')

  // assess 不得写任何派生文件
  expect(existsSync(join(userDataDir, 'wallpaper'))).toBe(false)
})

/** 全图最大灰度值：判定「底部那条白条有没有被裁掉」 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs
async function maxLuma(path) {
  const { data } = await sharp(path).grayscale().raw().toBuffer({ resolveWithObject: true })
  let max = 0
  for (const v of data) if (v > max) max = v
  return max
}

/** 从测试进程直接调 macOS 壁纸二进制读/还原（wallpaper 包内部也是调它） */
const WP_BIN = join(ROOT, 'node_modules/wallpaper/source/macos-wallpaper')
const run = promisify(execFile)
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs
const wpGet = async () => (await run(WP_BIN, ['get', '--screen', 'main'])).stdout.trim()
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs
const wpSet = (p) => run(WP_BIN, ['set', p, '--screen', 'main', '--scale', 'auto'])

test('真设桌面：派生 JPEG 落盘 + 缓存命中 + 还原原壁纸', async () => {
  test.skip(!process.env.WP_REAL_SET, '会改写 macOS 桌面，需显式 WP_REAL_SET=1')
  test.skip(process.platform !== 'darwin', 'macOS 专有')
  const page = await getMainWindow()

  const portrait = join(assetDir, 'set-portrait.png')
  const strip = await sharp({ create: { width: 900, height: 80, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  await sharp({ create: { width: 900, height: 1800, channels: 3, background: { r: 12, g: 12, b: 12 } } })
    .composite([{ input: strip, top: 1720, left: 0 }])
    .png()
    .toFile(portrait)
  const cutout = join(assetDir, 'set-cutout.png')
  await sharp({
    create: { width: 900, height: 900, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      {
        input: await sharp({ create: { width: 500, height: 500, channels: 3, background: '#2266aa' } })
          .png()
          .toBuffer(),
        top: 200,
        left: 200
      }
    ])
    .png()
    .toFile(cutout)

  const added = await page.evaluate(
    async (paths) => await window.api.photos.addMultiple(paths),
    [portrait, cutout]
  )
  // D-020：入库即拷贝，后面所有对素材的操作都用库内那份副本的路径
  const portraitRow = added.find((x) => x.fileName === 'set-portrait.png')
  const cutoutRow = added.find((x) => x.fileName === 'set-cutout.png')
  expect(portraitRow?.id).toBeTruthy()

  const px = await app.evaluate(({ screen }) =>
    screen.getAllDisplays().map((d) => ({
      w: Math.round(d.size.width * d.scaleFactor),
      h: Math.round(d.size.height * d.scaleFactor)
    }))
  )
  const scale = Math.min(1, 4096 / Math.max(px[0].w, px[0].h))
  const tag = `${Math.round(px[0].w * scale)}x${Math.round(px[0].h * scale)}`
  console.log('wp-e2e: 目标 =', tag)

  const before = await wpGet()
  console.log('wp-e2e: 原壁纸 =', before)
  expect(before).toBeTruthy()

  try {
    // ① 强制 cover：竖图铺满横屏，底部白条必被裁掉
    const cover = await page.evaluate(
      async (p) => await window.api.setWallpaper(p, 'main', { mode: 'cover' }),
      portraitRow.filePath
    )
    console.log('wp-e2e: cover =', JSON.stringify(cover))
    expect(cover.ok).toBe(true)
    expect(cover.adapt.strategy).toBe('cover')
    const coverFile = join(userDataDir, 'wallpaper', portraitRow.id, `${tag}-cover.jpg`)
    const coverMeta = await sharp(coverFile).metadata()
    expect({ width: coverMeta.width, height: coverMeta.height }).toEqual({
      width: Number(tag.split('x')[0]),
      height: Number(tag.split('x')[1])
    })
    expect(coverMeta.format).toBe('jpeg')
    expect(coverMeta.hasAlpha).toBeFalsy()
    expect(await maxLuma(coverFile)).toBeLessThan(200)
    const afterSet = await wpGet()
    console.log('wp-e2e: 设置后系统报告 =', afterSet)
    expect(afterSet.endsWith(basename(coverFile))).toBe(true)

    // ② 再设一次：缓存命中，文件不得被重写
    const mtime1 = statSync(coverFile).mtimeMs
    const again = await page.evaluate(
      async (fp) => await window.api.setWallpaper(fp, 'main', { mode: 'cover' }),
      portraitRow.filePath
    )
    expect(again.ok).toBe(true)
    expect(statSync(coverFile).mtimeMs).toBe(mtime1)

    // ③ 强制模糊底：同一目标另一张派生图，完整画面（含底部白条）保留
    const blurred = await page.evaluate(
      async (fp) => await window.api.setWallpaper(fp, 'main', { mode: 'blurred' }),
      portraitRow.filePath
    )
    expect(blurred.ok).toBe(true)
    const blurredFile = join(userDataDir, 'wallpaper', portraitRow.id, `${tag}-blurred.jpg`)
    expect(statSync(blurredFile).size).toBeGreaterThan(0)
    expect(await maxLuma(blurredFile)).toBeGreaterThan(200)

    // ④ 透明抠图走 auto → 判定为模糊底，输出不再有 alpha（否则系统给一块黑底）
    const auto = await page.evaluate(
      async (fp) => await window.api.setWallpaper(fp, 'main', { mode: 'auto' }),
      cutoutRow.filePath
    )
    console.log('wp-e2e: cutout auto =', JSON.stringify(auto))
    expect(auto.adapt.strategy).toBe('blurred')
    expect(auto.adapt.reasons).toContain('transparency')
    const cutoutFile = join(userDataDir, 'wallpaper', cutoutRow.id, `${tag}-blurred.jpg`)
    expect((await sharp(cutoutFile).metadata()).hasAlpha).toBeFalsy()

    // 同一张走 UI 入口（检查器 → 自动适配）：toast 必须说明透明区域落到了主色底
    await page.reload()
    await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
      timeout: 20000
    })
    const cutoutCard = page.locator('[data-photo-id]').filter({ hasText: 'cutout.png' }).first()
    await cutoutCard.waitFor({ timeout: 20000 })
    await cutoutCard.click()
    await page.waitForTimeout(600)
    await page.locator('button[title^="设为桌面壁纸"]').click()
    await page.waitForTimeout(600)
    await page.locator('[role="menuitem"]', { hasText: '自动适配' }).click()
    await page.waitForTimeout(800)
    const toast = page.locator('[role="status"], [class*="toast"]').last()
    const toastText = await toast.innerText()
    console.log('wp-e2e: toast =', JSON.stringify(toastText))
    expect(toastText).toContain('已设为桌面壁纸 · 模糊留白')
    expect(toastText).toContain('透明区域落主色底')
    // 描述区是 max-w-72 + truncate（288px 就出省略号），必须量真实宽度而不是只读 innerText
    const desc = await toast.evaluate((el) => {
      const span = [...el.querySelectorAll('span')].find((s) => s.className.includes('truncate'))
      return span ? { scroll: span.scrollWidth, client: span.clientWidth, text: span.textContent } : null
    })
    console.log('wp-e2e: 描述区 =', JSON.stringify(desc))
    expect(desc?.text).toContain('cutout.png')
    expect(desc?.scroll ?? 0).toBeLessThanOrEqual(desc?.client ?? 0)

    // ⑤ 派生文件恰好 3 张（竖图 cover+blurred、抠图 blurred），无多余重编码
    const written = readdirSync(join(userDataDir, 'wallpaper'), { recursive: true })
      .map((f) => String(f))
      .filter((f) => f.endsWith('.jpg'))
    console.log('wp-e2e: 派生文件 =', JSON.stringify(written))
    expect(written).toHaveLength(3)
  } finally {
    await wpSet(before)
    console.log('wp-e2e: 还原后 =', await wpGet())
    expect(await wpGet()).toBe(before)
  }
})
