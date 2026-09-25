/**
 * 跨库合并真机验收（D-020：合并必须把字节一起搬进当前库）
 *
 * 修之前的形状：mergeFrom 只把源库的 DB 行插进当前库，`file_path` 仍指着**源库目录**，
 * 既不拷字节也不记 source_path。于是两条路都会把合并过来的素材当场删空：
 *  1) 在源库里把该素材丢进回收站并清空（清空回收站会删库内副本）；
 *  2) 源库被移动或删除（D-020 之前库里全是引用行时这只是"断链"，现在是"字节没了"）。
 * 这条链单测测不了：merge 走的是 better-sqlite3 双库 + electron userData 注册表。
 *
 * 三次启动是为了不手写 INSERT SQL：A 建库 → 切 B 建库并真的导入一条（D-020 会拷进 B）→
 * 切回 A 合并。判别性：把 copyIntoLibrary 那段短路掉，第 1 条断言（合并行的 file_path
 * 在 A 里）立刻红。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/library-merge.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')

let app = null
let userDir = null
let libA = null
let libB = null
let srcDir = null

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
function writeRegistry(activeId) {
  writeFileSync(
    join(userDir, 'libraries.json'),
    JSON.stringify({
      activeLibraryId: activeId,
      libraries: [
        { id: 'aa', name: '库A', path: libA, legacy: false, createdAt: 1, lastOpenedAt: 1 },
        { id: 'bb', name: '库B', path: libB, legacy: false, createdAt: 1, lastOpenedAt: 1 }
      ]
    })
  )
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launch(activeId) {
  writeRegistry(activeId)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDir}`],
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
async function close() {
  if (app) await app.close()
  app = null
}

test('合并把字节一起搬进当前库：源库不再被依赖，重复合并不产生第二行', async () => {
  test.setTimeout(240_000)
  userDir = mkdtempSync(join(tmpdir(), 'leaf-merge-user-'))
  libA = mkdtempSync(join(tmpdir(), 'leaf-merge-a-'))
  libB = mkdtempSync(join(tmpdir(), 'leaf-merge-b-'))
  srcDir = mkdtempSync(join(tmpdir(), 'leaf-merge-src-'))
  const origin = join(srcDir, '合并素材.png')
  copyFileSync(join(ROOT, 'extension', 'icons', 'icon128.png'), origin)
  const originBytes = readFileSync(origin)

  try {
    // 1) A 先建库（跑完迁移），再切 B 建库并真导入一条 —— D-020 下这条会拷进 B
    await (await launch('aa')).waitForTimeout(500)
    await close()
    const pageB = await launch('bb')
    const [inB] = await pageB.evaluate(
      async (p) => await window.api.photos.importPaths([p]),
      origin
    )
    await expect
      .poll(
        () =>
          pageB.evaluate(
            async (p) => (await window.api.photos.getById(p))?.thumbStatus ?? -1,
            inB.id
          ),
        {
          timeout: 60_000,
          intervals: [500]
        }
      )
      .toBe(1)
    expect(inB.filePath, '导入即拷进 B').toContain(join(libB, 'images'))
    expect(inB.sourcePath).toBe(origin)
    await close()

    // 2) 切回 A 合并 B
    const pageA = await launch('aa')
    const merged = await pageA.evaluate(() => window.api.libraries.mergeFrom('bb'))
    expect(merged.photosAdded, 'B 里那条要并进来').toBe(1)
    const rows = await pageA.evaluate(() => window.api.photos.getAll())
    const inA = rows.find((r) => r.fileName === '合并素材.png')
    expect(inA, 'A 里查得到').toBeTruthy()
    expect(dirname(dirname(inA.filePath)), '字节必须已经落在 A 里，而不是仍指着 B 的目录').toBe(
      join(libA, 'images')
    )
    expect(inA.sourcePath, '合并行的出处记的是它在 B 里的那份路径').toBe(inB.filePath)
    expect(readFileSync(inA.filePath).equals(originBytes), 'A 里的字节与原文件一致').toBe(true)
    expect(existsSync(inB.filePath), 'B 里那份原件不动').toBe(true)

    // 3) 再合并一次：按 source_path 认旧行，不产生第二行、也不多拷一份
    const again = await pageA.evaluate(() => window.api.libraries.mergeFrom('bb'))
    expect(again.photosAdded, '重复合并不该再加行').toBe(0)
    expect(again.photosSkipped).toBeGreaterThanOrEqual(1)
    const rows2 = await pageA.evaluate(() => window.api.photos.getAll())
    expect(rows2.filter((r) => r.fileName === '合并素材.png')).toHaveLength(1)

    // 4) 在 A 里彻底删除：只该删掉 A 的副本，B 与最初的原件都还在
    await pageA.evaluate((ids) => window.api.photos.deleteMultiple(ids), [inA.id])
    await pageA.evaluate(() => window.api.photos.clearRecycleBin())
    expect(existsSync(inA.filePath), 'A 的副本随彻底删除一起走').toBe(false)
    expect(existsSync(inB.filePath), 'B 里那份不能被这次删除牵连').toBe(true)
    expect(readFileSync(origin).equals(originBytes), '最初的桌面级原文件不动').toBe(true)
  } finally {
    await close()
    for (const d of [userDir, libA, libB, srcDir]) {
      if (d) rmSync(d, { recursive: true, force: true })
    }
  }
})
