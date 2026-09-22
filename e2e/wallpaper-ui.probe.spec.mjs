/**
 * 临时 UI 走查（跑完删除）：壁纸适配三处入口 + toast 的实际渲染
 * 截图落 /tmp/wp-ui/；最后一步会真设桌面（已获同意），随后还原。
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
const SHOTS = '/tmp/wp-ui'
const run = promisify(execFile)
const WP_BIN = join(ROOT, 'node_modules/wallpaper/source/macos-wallpaper')
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs
const wpGet = async () => (await run(WP_BIN, ['get', '--screen', 'main'])).stdout.trim()
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs
const wpSet = (p) => run(WP_BIN, ['set', p, '--screen', 'main', '--scale', 'auto'])

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

test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  rmSync(SHOTS, { recursive: true, force: true })
  mkdtempSync(SHOTS)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-wp-ui-profile-'))
  assetDir = mkdtempSync(join(tmpdir(), 'leaf-wp-ui-assets-'))
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })
}, 120000)

test.afterAll(async () => {
  if (app) await app.close()
  for (const d of [userDataDir, assetDir]) if (d) rmSync(d, { recursive: true, force: true })
})

test('UI 走查', async () => {
  const page = await getMainWindow()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(async () => {
    await window.api?.preferences?.setOnboardingCompleted?.()
  })
  await page.waitForTimeout(500)

  // 素材：竖图（→ 模糊底）、透明抠图（→ 模糊底 + 主色底）、同比例图（→ 原图直设）
  const portrait = join(assetDir, 'portrait.png')
  const strip = await sharp({ create: { width: 900, height: 80, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  await sharp({ create: { width: 900, height: 1800, channels: 3, background: { r: 12, g: 12, b: 12 } } })
    .composite([{ input: strip, top: 1720, left: 0 }])
    .png()
    .toFile(portrait)
  const cutout = join(assetDir, 'cutout.png')
  await sharp({
    create: { width: 1200, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      {
        input: await sharp({ create: { width: 700, height: 700, channels: 3, background: '#e05555' } })
          .png()
          .toBuffer(),
        top: 250,
        left: 250
      }
    ])
    .png()
    .toFile(cutout)
  const wide = join(assetDir, 'wide.png')
  await sharp({ create: { width: 3840, height: 2160, channels: 3, background: { r: 40, g: 60, b: 80 } } })
    .png()
    .toFile(wide)
  await page.evaluate(async (paths) => await window.api.photos.addMultiple(paths), [
    portrait,
    cutout,
    wide
  ])
  await page.evaluate(() => {
    window.location.hash = '#/photos'
  })
  await page.reload()
  await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
    timeout: 20000
  })
  const portraitCard = page.locator('[data-photo-id]').filter({ hasText: 'portrait.png' }).first()
  await portraitCard.waitFor({ timeout: 20000 })
  await portraitCard.click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOTS}/01-检查器入口.png` })

  // ① 检查器策略菜单
  const wpButton = page.locator('button[title^="设为桌面壁纸"]')
  await expect(wpButton).toHaveCount(1)
  await wpButton.click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOTS}/02-检查器策略菜单.png` })
  const menuText = (await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()).join(' / ')
  console.log('ui: 检查器菜单 =', menuText)
  await page.keyboard.press('Escape')

  // ② 预览面板按钮组 + 菜单
  await portraitCard.dblclick()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${SHOTS}/03-预览面板按钮.png` })
  await page.locator('button[title^="选择适配方式"]').click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOTS}/04-预览面板菜单.png` })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // ③ 右键菜单子菜单
  await portraitCard.click({ button: 'right' })
  await page.waitForTimeout(600)
  await page.locator('[role="menu"] input[type="text"]').fill('壁纸')
  await page.waitForTimeout(400)
  const parentRow = page.locator('[role="menuitem"]', { hasText: '设为壁纸' })
  await parentRow.hover()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOTS}/05-右键子菜单.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ④ 真设一次看 toast（竖图 auto → 模糊底），随后还原
  const before = await wpGet()
  console.log('ui: 原壁纸 =', before)
  try {
    await portraitCard.click()
    await page.waitForTimeout(400)
    await page.locator('button[title^="设为桌面壁纸"]').click()
    await page.waitForTimeout(600)
    await page.locator('[role="menuitem"]', { hasText: '自动适配' }).click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${SHOTS}/06-设置成功toast.png` })
    const toast = await page.locator('[role="status"], .u-toast, [class*="toast"]').last().innerText()
    console.log('ui: toast =', JSON.stringify(toast))
    expect(toast).toContain('已设为桌面壁纸')
    expect(toast).toContain('模糊留白')
    // 透明抠图走 auto → 主色底
    const cutoutCard = page.locator('[data-photo-id]').filter({ hasText: 'cutout.png' }).first()
    await cutoutCard.click()
    await page.waitForTimeout(400)
    await page.locator('button[title^="设为桌面壁纸"]').click()
    await page.waitForTimeout(600)
    await page.locator('[role="menuitem"]', { hasText: '自动适配' }).click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${SHOTS}/07-透明图toast.png` })
    console.log('ui: 透明图 toast =', JSON.stringify(await page.locator('[class*="toast"]').last().innerText()))
    console.log('ui: 当前壁纸 =', await wpGet())
  } finally {
    await wpSet(before)
    console.log('ui: 还原后 =', await wpGet())
  }
})
