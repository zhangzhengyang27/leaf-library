/**
 * Leaf · 二十九轮缺陷修复的真机验收（playwright + _electron，独立 userData 实例）
 *
 * 覆盖必须走「主进程 + 预加载 + 渲染层」整条链路的三条：
 *  - 缺陷1：搜索范围「文档正文」下推 SQL（渲染层一直认 docText，主进程不认 → 静默搜文件名）
 *  - 缺陷2：侧栏徽章数来自 SQL 聚合，且真的进到 DOM
 *  - 缺陷3：「未标签」视图按 SQL 谓词取池（渲染出的卡片集合 == 未标签集合）
 * 缺陷4（智能文件夹文件夹条件往返）由组件测试覆盖：
 *  SmartAlbumModal.folders.test.ts（含判别性退回验证）。
 *
 * 用法：
 *   pnpm build
 *   pnpm exec playwright test e2e/gap-round29.spec.mjs
 *
 * 为什么要真机：三条都能在单测里绿——列映射单测直接写库、徽章单测只断纯函数，
 * 而 IPC 通道名/预加载声明/视图取数路径这三处接缝只有跑起来才暴露。
 */

import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
const DOCX_FIXTURE = join(ROOT, 'src/main/services/__tests__/fixtures/sample.docx')

let app = null
let userDataDir = null
let work = null
let importedId = null

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
  if (!existsSync(MAIN_ENTRY)) {
    throw new Error(`缺产物 ${MAIN_ENTRY}：先跑 pnpm build`)
  }
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-gap29-'))
  work = mkdtempSync(join(tmpdir(), 'leaf-gap29-assets-'))

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

  // 正文抽取是后台开关，默认关；开着再导入才会有 doc_text
  await page.evaluate(() => window.api.photos.setDocTextEnabled(true))

  // 夹具先复制到 tmp：仓库在 ~/Desktop 下受 macOS TCC 保护，不该让测试依赖授权状态
  const docx = join(work, 'sample.docx')
  copyFileSync(DOCX_FIXTURE, docx)
  // evaluate 的第二个实参就是页面函数的唯一入参，不能再包一层数组
  const [imported] = await page.evaluate(
    async (p) => await window.api.photos.importPaths([p]),
    docx
  )
  if (!imported) throw new Error('importPaths 未返回导入结果')
  importedId = imported.id

  // 队列是后台低优先级，轮询等 doc_text 落库
  await expect
    .poll(
      async () =>
        page.evaluate(async (id) => !!(await window.api.photos.getById(id))?.docText, importedId),
      { timeout: 60_000, intervals: [500] }
    )
    .toBe(true)
}, 180_000)

test.afterAll(async () => {
  if (app) await app.close()
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  if (work) rmSync(work, { recursive: true, force: true })
})

test('缺陷1：勾「文档正文」命中正文词，而不是静默去搜文件名', async () => {
  const page = await getMainWindow()
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
  const hitsFor = (scopes) =>
    page.evaluate(
      async (s) =>
        (
          await window.api.photos.queryPhotosByRules({
            searchKeyword: '营收',
            searchScopes: s
          })
        ).map((p) => p.id),
      scopes
    )

  // 正文里含「营收」而文件名不含：修复前这条恒空（docText 查不到列就 ?? 退回 file_name）
  expect(await hitsFor(['docText'])).toContain(importedId)
  expect(await hitsFor(['name'])).toEqual([])
  // 默认全勾选（面板实际下发形态）也必须命中
  expect(await hitsFor(['name', 'docText'])).toContain(importedId)
})

test('缺陷1：未知范围项不再被当成文件名，而是退回 FTS 路径', async () => {
  const page = await getMainWindow()
  // 词长必须 ≥3 字：photo_fts 是 trigram，2 字词在 FTS 路径上本来就命中不了
  const ids = await page.evaluate(async () =>
    (
      await window.api.photos.queryPhotosByRules({
        searchKeyword: '季度营收',
        searchScopes: ['notARealScope']
      })
    ).map((p) => p.id)
  )
  // FTS 覆盖 doc_text，所以仍能命中；若未知项被错当成 file_name，这里会是空
  expect(ids).toContain(importedId)
})

test('缺陷2/3：侧栏徽章与「未标签」视图都按 SQL 取数', async () => {
  const page = await getMainWindow()

  const counts = await page.evaluate(() => window.api.photos.getSidebarCounts())
  expect(counts.all).toBe(1)
  expect(counts.untagged).toBe(1)
  expect(counts.recentViewed).toBe(0)

  // 导入是直连 IPC 的，渲染层没被通知过 → 重开一次，让视图真的从 SQL 拉一遍池
  await page.evaluate(() => {
    location.hash = '#/photos'
  })
  await page.reload()
  await page.waitForFunction(() => !!document.querySelector('[data-photo-id]'), undefined, {
    timeout: 30_000
  })

  // 徽章真的进 DOM（计数为 0 时该行不显数字，所以这里必须是 1）
  const untaggedRow = page.getByRole('button', { name: /未标签/ })
  await expect
    .poll(() => untaggedRow.first().textContent(), { timeout: 15_000, intervals: [500] })
    .toMatch(/未标签\s*1$/)

  // 给这条打上标签 → 徽章与视图都应归零（同一条 untaggedOnly 谓词的两个消费端）
  await page.evaluate(
    async (id) => await window.api.photos.addTagToMultiple([id], '二十九轮验收'),
    importedId
  )
  await expect
    .poll(async () => (await page.evaluate(() => window.api.photos.getSidebarCounts())).untagged, {
      timeout: 15_000,
      intervals: [500]
    })
    .toBe(0)

  await untaggedRow.first().click()
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll('[data-photo-id]').length), {
      timeout: 15_000,
      intervals: [500]
    })
    .toBe(0)
})

test('G4：Office 文档经系统通路拿到真缩略图（此前只有扩展名字母卡）', async () => {
  const page = await getMainWindow()
  // importedId 就是 beforeAll 里导入的 sample.docx。
  // 断言用 colorDominant 而不是 width/height：主色只有在校好一张真预览 PNG 之后才算得出来，
  // 而文档本身不是位图，宽高留空是对的（Eagle 的文档卡同样不显示尺寸）
  await expect
    .poll(
      async () =>
        page.evaluate(
          async (id) => (await window.api.photos.getById(id))?.colorDominant ?? null,
          importedId
        ),
      { timeout: 40_000, intervals: [1000] }
    )
    .toMatch(/^#[0-9a-f]{6}$/i)

  const row = await page.evaluate((id) => window.api.photos.getById(id), importedId)
  expect(row.thumbStatus).toBe(1)
})

test('G3：color_close 在生产构建的主进程里注册成功（单测走的是另一处注册）', async () => {
  const page = await getMainWindow()
  // 仓库里的 photo.jpg 夹具是 14 字节文本占位，不是图像——用它永远等不到主色回填。
  // 这里用 sharp 现造一张纯色图，色值是已知的，正/负两侧断言都不用猜
  const png = join(work, 'solid-blue.png')
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 51, g: 102, b: 204 } }
  })
    .png()
    .toFile(png)

  const [imported] = await page.evaluate(async (p) => await window.api.photos.importPaths([p]), png)
  expect(imported).toBeTruthy()

  // 主色由后台分析管线回填，轮询等它出现
  await expect
    .poll(
      async () =>
        page.evaluate(
          async (id) => (await window.api.photos.getById(id))?.colorDominant ?? null,
          imported.id
        ),
      { timeout: 30_000, intervals: [500] }
    )
    .toBeTruthy()

  const hitsFor = async (hex) =>
    page.evaluate(
      async (h) =>
        (await window.api.photos.queryPhotosByRules({ colorClose: { hex: h, accuracy: 40 } })).map(
          (p) => p.id
        ),
      hex
    )

  // 同色必须命中：UDF 没注册的话这里直接抛 no such function
  expect(await hitsFor('#3366CC')).toContain(imported.id)
  // 红对这张纯蓝图 ΔE 远超 5，最宽档也不该捞到它
  expect(await hitsFor('#FF0000')).not.toContain(imported.id)
})
