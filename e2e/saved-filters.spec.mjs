/**
 * 筛选预设（SavedFiltersPopover）真机往返验收
 *
 * 为什么要这条：这颗入口在 09-22 的恢复对账里被误判成"丢了"，第二天又在另一会话的
 * 旧草稿存盘里真的被删了一次（挂载 + applySavedFilterRules + buildFiltersSpec 映射三处）。
 * 它没有 e2e，所以整条链消失时 540 条单测与 34 条电池全绿。
 * 这条钉的是完整往返：侧栏切到「未标签」→ 存成预设 → 切回「全部」→ 点预设应用 →
 * 网格必须回到只看未标签。中间任何一环（挂载、currentRules 的来源、应用时把规则摊回
 * tab 状态）断了都会红。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/saved-filters.spec.mjs
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
let srcDir = null

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

/** 网格里当前可见的卡片标题（按文件名比对，顺序不敏感） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
const visibleTitles = async (page) => {
  const texts = await page.locator('[data-photo-id]').allInnerTexts()
  const names = []
  for (const t of texts) {
    const hit = t
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.endsWith('.txt'))
    if (hit) names.push(hit)
  }
  return names.sort()
}

test('筛选预设：存下「仅未标签」→ 切走 → 应用后网格回到同一批', async () => {
  test.setTimeout(180_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-saved-user-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-saved-lib-'))
  srcDir = mkdtempSync(join(tmpdir(), 'leaf-saved-src-'))
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
          createdAt: 1,
          lastOpenedAt: 1
        }
      ]
    })
  )
  const tagged = join(srcDir, '甲-有标签.txt')
  const free = join(srcDir, '乙-未标签.txt')
  writeFileSync(tagged, '这条会被打上标签\n')
  writeFileSync(free, '这条保持未标签\n')

  try {
    const page = await launch()
    const rows = await page.evaluate(
      async (pair) => await window.api.photos.importPaths(pair),
      [tagged, free]
    )
    expect(rows).toHaveLength(2)
    await page.evaluate(async (arg) => await window.api.photos.addTag(arg.id, arg.tag), {
      id: rows.find((r) => r.fileName === '甲-有标签.txt').id,
      tag: '有标签'
    })

    // ── 1. 侧栏切到「未标签」：网格只剩乙 ──
    await page.getByText('未标签', { exact: true }).first().click()
    await expect.poll(() => visibleTitles(page), { timeout: 20_000 }).toEqual(['乙-未标签.txt'])

    // 筛选行默认收起（十八轮：Eagle 没有 chips 行，开关在应用菜单 ⌘⇧F）。
    // 那是**原生菜单**的 accelerator，page.keyboard 打到的是渲染层，截不到——
    // 改种 localStorage 旗标后 reload，走 composable 自己的读取路径。
    await page.evaluate(() => localStorage.setItem('leaf.filterbar-visible', '1'))
    await page.reload()
    await page.waitForFunction(() => !!document.querySelector('#app .LeafAppShell'), undefined, {
      timeout: 25_000
    })
    await expect(page.locator('button[title="筛选预设"]')).toBeVisible()

    // ── 2. 把当前筛选存成预设；摘要必须来自 buildFiltersSpec()，不是写死的文案 ──
    await page.locator('button[title="筛选预设"]').click()
    await page.locator('input[placeholder="把当前筛选存为预设…"]').fill('只看未标签')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    const row = page.locator('button[title="应用：只看未标签"]')
    await expect(row, '预设要落进列表').toHaveCount(1)
    // 「仅未标签」这串是 summarizeFilter(rules) 产出的——规则快照没带 untaggedOnly 就出不来
    await expect(row).toContainText('仅未标签')

    // ── 3. 切回「全部」：两条都在 ──
    await page.locator('button[title="筛选预设"]').click() // 关面板
    await page.getByText('全部', { exact: true }).first().click()
    await expect
      .poll(() => visibleTitles(page), { timeout: 20_000 })
      // 中文按码点排：乙(U+4E59) 在 甲(U+7532) 前，两边都过同一个 sort
      .toEqual(['甲-有标签.txt', '乙-未标签.txt'].sort())

    // ── 4. 应用预设：applySavedFilterRules 把规则摊回 tab 状态，网格回到只剩乙 ──
    await page.locator('button[title="筛选预设"]').click()
    await row.click()
    await expect
      .poll(() => visibleTitles(page), { timeout: 20_000 }, '点应用后必须重新只剩未标签那条')
      .toEqual(['乙-未标签.txt'])
  } finally {
    if (app) await app.close()
    app = null
    for (const d of [userDataDir, libraryDir, srcDir]) {
      if (d) rmSync(d, { recursive: true, force: true })
    }
  }
})
