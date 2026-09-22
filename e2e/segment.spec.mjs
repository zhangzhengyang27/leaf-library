/**
 * 中文分词真机验收（打包产物里的 Electron 主进程）
 *
 * 这条存在的唯一理由：jieba-wasm 在 `node` 里能跑不代表在 Electron 主进程里能跑。
 * D-017 那轮 transformers.js 就是这么死的——宿主差异让"本地测过"变成假绿灯。
 * 所以断言的是产物里的真实行为：词典 active=true，且「红色海报」真的切成两个词。
 *
 * 顺带验 preload 桥（search:segmentWords 贯通到渲染层）与"搜得到"这件事本身：
 * 库里只有一张「红色系海报.png」，用连写的「红色海报」必须搜出来。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/segment.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')

let app = null
let userDataDir = null
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

test.beforeAll(async () => {
  if (!existsSync(MAIN_ENTRY)) throw new Error(`缺产物 ${MAIN_ENTRY}：先跑 pnpm build`)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-seg-e2e-'))
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-seg-assets-'))
  // 文件名带中文：走真实导入管线，让 FTS 与 file_name 都有内容
  const px = Buffer.alloc(64 * 64 * 3, 200)
  const file = join(assetsDir, '红色系海报.png')
  await sharp(px, { raw: { width: 64, height: 64, channels: 3 } }).png().toFile(file)

  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })
  const page = await getMainWindow()
  await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
    timeout: 20_000
  })
  await page.evaluate(async () => {
    if (window.api?.preferences?.setOnboardingCompleted) {
      await window.api.preferences.setOnboardingCompleted()
    }
  })
  await page.evaluate(async (p) => await window.api.photos.importPaths([p]), file)
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.api.photos.getByDateSection().then((s) => s.flatMap((x) => x.photos).length)
        ),
      { timeout: 30_000, intervals: [500] }
    )
    .toBe(1)
}, 120_000)

test.afterAll(async () => {
  if (app) await app.close()
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  if (assetsDir) rmSync(assetsDir, { recursive: true, force: true })
})

test('Electron 主进程里词典真的在用（不是回落空白切分）', async () => {
  const page = await getMainWindow()
  const st = await page.evaluate(() => window.api.search.segmentStatus())
  expect(st.active, `词典没起来：${st.error}`).toBe(true)
  expect(st.engine).toBe('jieba-wasm')

  const words = await page.evaluate(() => window.api.search.segmentWords('红色海报'))
  expect(words).toEqual(['红色', '海报'])
  // 判别性：回落分支下这条会是 ['红色海报'] 一个整词
  expect(words.length).toBe(2)
})

test('连写中文词在真实搜索链里搜得到中文文件名', async () => {
  const page = await getMainWindow()
  const names = await page.evaluate(() =>
    window.api.photos
      .getPage({ view: 'search', filters: { searchKeyword: '红色海报' }, limit: 10 })
      .then((p) => p.items.map((x) => x.fileName))
  )
  expect(names).toEqual(['红色系海报.png'])
  // 反证：整串「红色海报」并不是这个文件名里的子串，命中只能来自分词
  const none = await page.evaluate(() =>
    window.api.photos
      .getPage({ view: 'search', filters: { searchKeyword: '红色海报不存在' }, limit: 10 })
      .then((p) => p.items.map((x) => x.fileName))
  )
  expect(none).toEqual([])
})

test('空格分词与英文行为不变（改动没有把旧语义顶掉）', async () => {
  const page = await getMainWindow()
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
  const q = async (s) =>
    page.evaluate(
      async (str) =>
        (await window.api.photos.getPage({ view: 'search', filters: { searchKeyword: str }, limit: 10 }))
          .items.length,
      s
    )
  expect(await q('红色 海报')).toBe(1)
  expect(await q('红色 蓝色')).toBe(0)
  expect(await q('poster')).toBe(0)
})
