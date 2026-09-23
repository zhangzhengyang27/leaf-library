/**
 * 断链素材批量处置真机验收（扫描出总数 → 移入回收站 → 清空回收站不牵连活文件）
 *
 * 为什么要这条：一次误删/换盘之后库里可能几千条 missing_at，而应用只给了
 * 每张卡上一个「⚠ 丢失」徽章 + 逐条「重新定位」，用户没有任何办法把这一堆清出视野。
 * 新加的批量入口走的是"软删进回收站"，所以必须钉住三件事：
 *  1) 数得对（scanMissing 的 remaining 是当前总数，不是本次新标记数）；
 *  2) 只带走断链的，活着的素材一条都不许被软删；
 *  3) 之后清空回收站时，D-020 那道"只删库内副本"的守卫不能把活素材的文件干掉。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/missing-triage.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

test('断链素材：扫描总数 → 移入回收站 → 清空回收站不牵连活文件', async () => {
  test.setTimeout(180_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-triage-user-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-triage-lib-'))
  srcDir = mkdtempSync(join(tmpdir(), 'leaf-triage-src-'))
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
  const alive = join(srcDir, '还在.txt')
  const lost = join(srcDir, '丢了.txt')
  writeFileSync(alive, '这条的文件一直在\n')
  writeFileSync(lost, '这条导入后会被删掉\n')

  try {
    const page = await launch()
    const rows = await page.evaluate(
      async (pair) => await window.api.photos.importPaths(pair),
      [alive, lost]
    )
    expect(rows).toHaveLength(2)
    // D-020：导入即拷进库，所以删原文件不影响；要模拟断链得删**库内那份副本**
    const copyOfLost = rows.find((r) => r.fileName === '丢了.txt').filePath
    const copyOfAlive = rows.find((r) => r.fileName === '还在.txt').filePath
    rmSync(copyOfLost, { force: true })

    // ── 1. 扫描：remaining 是当前断链总数 ──
    const scan = await page.evaluate(() => window.api.storage.scanMissing())
    expect(scan.ok, scan.error ?? '').toBe(true)
    expect(scan.remaining, '库里就这一条丢了').toBe(1)

    // ── 2. 批量移入回收站：只带走断链的 ──
    const moved = await page.evaluate(() => window.api.storage.moveMissingToTrash())
    expect(moved.ok, moved.error ?? '').toBe(true)
    expect(moved.removed).toBe(1)
    const active = await page.evaluate(() => window.api.photos.getAll())
    expect(
      active.map((p) => p.fileName),
      '活着的素材不能被连带软删'
    ).toEqual(['还在.txt'])
    const bin = await page.evaluate(() => window.api.photos.getRecycleBin())
    expect(bin.map((p) => p.fileName)).toEqual(['丢了.txt'])

    // 再点一次不该有副作用（清单已空）
    const again = await page.evaluate(() => window.api.storage.moveMissingToTrash())
    expect(again.removed).toBe(0)

    // ── 3. 清空回收站：missing 的行磁盘上本就没文件，但活素材的副本必须还在 ──
    await page.evaluate(() => window.api.photos.clearRecycleBin())
    expect(existsSync(copyOfAlive), '活素材的库内副本不许被这次清空牵连').toBe(true)
    expect(existsSync(copyOfLost), false)
    expect(await page.evaluate(() => window.api.photos.getRecycleBin().then((l) => l.length))).toBe(
      0
    )
  } finally {
    if (app) await app.close()
    app = null
    for (const d of [userDataDir, libraryDir, srcDir]) {
      if (d) rmSync(d, { recursive: true, force: true })
    }
  }
})
