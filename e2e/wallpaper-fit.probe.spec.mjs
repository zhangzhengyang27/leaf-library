/**
 * 临时探针（验收用，跑完删除）：壁纸适配在真实 Electron 里的接线
 * 断言 assess 的判定与真实屏幕物理像素一致 + 渲染层策略菜单能开出不改桌面。
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
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
  console.log('probe: displays(physical) =', JSON.stringify(displays))
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
  console.log('probe: imported =', JSON.stringify(imported?.added ?? imported))

  const pRow = await page.evaluate(async (p) => await window.api.photos.getByPath(p), portrait)
  const wRow = await page.evaluate(async (p) => await window.api.photos.getByPath(p), wide)
  expect(pRow?.filePath).toBe(portrait)

  const pFit = await page.evaluate(async (p) => await window.api.assessWallpaper(p), portrait)
  const wFit = await page.evaluate(async (p) => await window.api.assessWallpaper(p), wide)
  console.log('probe: portrait fit =', JSON.stringify(pFit))
  console.log('probe: wide fit =', JSON.stringify(wFit?.assessments?.[0] ?? wFit))
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
    .catch(() => console.log('probe: thumb 管线未在 30s 内完成'))

  // 等处理管线回填（thumbStatus → 1，colorDominant 有值），否则菜单文案会缺
  await page
    .waitForFunction(
      async (id) => (await window.api.photos.getById(id))?.thumbStatus === 1,
      pRow.id,
      { timeout: 30000 }
    )
    .catch(() => console.log('probe: thumb 管线未在 30s 内完成'))

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
  const card = page.locator('[data-photo-id]').first()
  await card.waitFor({ timeout: 20000 })
  await card.click()
  await page.waitForTimeout(600)
  const wpButton = page.locator('button[title^="设为桌面壁纸"]')
  await expect(wpButton).toHaveCount(1)
  await wpButton.click()
  await page.waitForTimeout(400)
  const items = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  console.log('probe: menu =', JSON.stringify(items))
  expect(items.join('|')).toContain('模糊留白（不裁内容）')
  expect(items.join('|')).toMatch(/自动适配 → (居中裁切填满|模糊留白)/)
  expect(items.join('|')).toMatch(/｜/)
  await page.keyboard.press('Escape')

  // assess 不得写任何派生文件
  const cacheRoot = join(userDataDir, 'wallpaper')
  const fs = await import('node:fs')
  expect(fs.existsSync(cacheRoot)).toBe(false)
}, 60000)
