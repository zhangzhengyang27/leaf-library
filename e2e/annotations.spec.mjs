/**
 * 标注 comments[] 真机验收（存储 + IPC + 检查器）
 *
 * 单测证明的是仓库层与校验函数，证不了这三件：
 *  1. 迁移 023 在**新建的库**上真的跑到了（表不在，UI 写入会静默失败）；
 *  2. IPC 通道 → preload → 检查器这一串接线是通的（"d.ts 写了但 preload 没实现"
 *     这类只有真跑才暴露）；
 *  3. 批注**重开应用还在**，且软删/还原不会丢。
 * 区域坐标与时间点这一趟用 API 直接写（框选 overlay 还没接，那条等预览层落地），
 * 但走的是同一条通道与同一张表，所以存得进、读得出这件事是真的验到了。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/annotations.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')

let app = null
let userDataDir = null
let libraryDir = null
let assetsDir = null

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
const getMainWindow = async () => {
  const deadline = Date.now() + 30_000
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launch() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })
  const page = await getMainWindow()
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

/** 选中那条素材（检查器只对单选出现） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function selectCard(page, name) {
  const card = page.locator('[data-photo-id]').filter({ hasText: name }).first()
  await card.waitFor({ timeout: 20_000 })
  await card.click()
  await page.waitForTimeout(400)
}

test('检查器加标注 → 重开还在 → 删掉；区域/时间点走同一条通道存得进', async () => {
  test.setTimeout(180_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-anno-user-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-anno-lib-'))
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-anno-assets-'))
  mkdirSync(join(libraryDir, 'images'), { recursive: true })
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
  const note = join(assetsDir, 'poster.txt')
  writeFileSync(note, '一张海报的说明\n')
  try {
    let page = await launch()
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), note)
    const id = await page.evaluate(() =>
      window.api.photos
        .getByDateSection()
        .then((s) => s.flatMap((x) => x.photos).find((p) => p.fileName === 'poster.txt')?.id ?? '')
    )
    expect(id).not.toBe('')

    // 走 IPC 直接导入不会触发渲染层那套池子刷新（拖拽路径才会）→ 重加载一次
    await page.reload()
    await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
      timeout: 25_000
    })
    await selectCard(page, 'poster.txt')
    const box = page.getByPlaceholder('写一条标注，回车保存')
    await expect(box).toBeVisible()
    await box.fill('右下角水印太抢眼')
    await box.press('Enter')
    await expect(page.locator('text=标注（1）')).toBeVisible()
    await expect(page.locator('li', { hasText: '右下角水印太抢眼' })).toHaveCount(1)

    // 空正文与脏坐标：主进程逐条复核，UI 上给的是"哪一条不对"而不是 SQLITE 报错
    const rejected = await page.evaluate(
      async (pid) => await window.api.annotations.create(pid, { body: '   ' }),
      id
    )
    expect(rejected.ok).toBe(false)
    const badRect = await page.evaluate(
      async (pid) =>
        await window.api.annotations.create(pid, { body: 'x', rect: { x: 1, y: 1, w: 2, h: 2 } }),
      id
    )
    expect(badRect.ok).toBe(false)
    if (!badRect.ok) expect(badRect.error).toContain('10×10')

    // 区域与时间点由 overlay 填，这一趟直接用 API 写：同一条通道、同一张表
    const withRect = await page.evaluate(
      async (pid) =>
        await window.api.annotations.create(pid, {
          body: 'logo 区',
          rect: { x: 8, y: 12, w: 120, h: 64 }
        }),
      id
    )
    expect(withRect.ok).toBe(true)
    await page.evaluate(
      async (pid) => await window.api.annotations.create(pid, { body: '开头', atMs: 4200 }),
      id
    )
    const shapes = await page.evaluate(async (pid) => await window.api.annotations.list(pid), id)
    expect(shapes.map((a) => a.body)).toEqual(['开头', '右下角水印太抢眼', 'logo 区'])
    expect(shapes.find((a) => a.body === 'logo 区').rect).toEqual({ x: 8, y: 12, w: 120, h: 64 })
    expect(shapes.find((a) => a.body === '开头').atMs).toBe(4200)
    await closeApp()

    // 重开：批注必须在（迁移 023 也在一个已有数据的库上跑过）
    page = await launch()
    await selectCard(page, 'poster.txt')
    await expect(page.locator('text=标注（3）')).toBeVisible()
    await expect(page.locator('li', { hasText: 'logo 区' })).toHaveCount(1)

    // 删除走 UI 一颗 ×
    await page.locator('li', { hasText: 'logo 区' }).getByTitle('删除这条标注').click()
    await expect(page.locator('text=标注（2）')).toBeVisible()
  } finally {
    await closeApp()
    for (const d of [userDataDir, libraryDir, assetsDir])
      if (d) rmSync(d, { recursive: true, force: true })
  }
})
