/**
 * 代码素材的网格卡（文本卡那条分支）真机验收
 *
 * 单测能证明扩展名判对了，证不了两件真事：
 *  1. 卡片读的是**各自**的正文（共享缓存/按 filePath 取错内容这类 bug 在单测里看不出来）；
 *  2. 一屏几十张代码卡同时发 readTextFile，界面不会被拖住（这条链的读取是每卡一次 IPC）。
 * 所以这里导 24 个内容互不相同的代码文件，逐张核对卡片上的串，并把耗时打出来。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/code-card.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
const COUNT = 24

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

test('每张代码卡显示自己的正文片段，一屏 24 张不被读取拖住', async () => {
  test.setTimeout(180_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-codecard-user-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-codecard-lib-'))
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-codecard-assets-'))
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
  const files = []
  for (let i = 0; i < COUNT; i++) {
    const name = i % 2 === 0 ? `mod${i}.js` : `mod${i}.ts`
    const f = join(assetsDir, name)
    writeFileSync(f, `export const marker${i} = ${i}\n// 只有各自正文里才有的串\n`)
    files.push(f)
  }
  try {
    let page = await launch()
    await page.evaluate(async (list) => await window.api.photos.importPaths(list), files)
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.api.photos.getByDateSection().then((s) => {
              const all = s.flatMap((x) => x.photos)
              return all.filter((p) => p.thumbStatus === 1).length
            })
          ),
        { timeout: 60_000, intervals: [1000] }
      )
      .toBe(COUNT)
    await closeApp()

    // 重开一趟：让卡片自己从库里加载（而不是导入时的增量刷新）
    page = await launch()
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('[data-photo-id]'))
            // 每张卡的正文里都该有 marker<数字>（下面再逐张核对它只有自己的那一个）
            return cards.filter((c) => /marker\d+/.test(c.textContent ?? '')).length
          }),
        { timeout: 40_000, intervals: [500] }
      )
      .toBe(COUNT)
    // 计时口径：整页重载 → 24 张卡的正文全部就位（含每卡一次 readTextFile IPC）
    const started = Date.now()
    await page.reload()
    await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
      timeout: 25_000
    })
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('[data-photo-id]'))
            return cards.filter((c) => /marker\d+/.test(c.textContent ?? '')).length
          }),
        { timeout: 40_000, intervals: [250] }
      )
      .toBe(COUNT)
    const elapsed = Date.now() - started

    // 每张卡拿到的是**自己**那条串（marker7 只出现在 mod7 的卡上）
    const crossed = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-photo-id]'))
      return cards.filter((c) => (c.textContent.match(/marker\d+/g) ?? []).length !== 1).length
    })
    expect(crossed).toBe(0)
    // 字母卡兜底不该再出现在代码文件上
    expect(await page.evaluate(() => document.body.innerText.includes('📄'))).toBe(false)
    console.log(`CODECARD 整页重载后 ${COUNT} 张代码卡显示各自正文用时 ${elapsed}ms`)
  } finally {
    await closeApp()
    for (const d of [userDataDir, libraryDir, assetsDir])
      if (d) rmSync(d, { recursive: true, force: true })
  }
})
