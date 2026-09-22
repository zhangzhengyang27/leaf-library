/**
 * D-020 拷贝式入库真机验收（导入即复制 / 重复导入不拷第二份 / 清空回收站只删库内）
 *
 * 这条链单测测不了：PhotoDataStore 用的是仓库单例 + electron app 上下文（库根从
 * libraryRegistry 来），本仓 533 条单测没有一条能跑到 addPhotosInner 的拷贝分支
 * ——正因如此「设置里点了拷贝模式、默认库其实静默不生效」这件事在代码里躺了很久。
 *
 * 断言的是磁盘上的真事实：库内出现副本、原件字节不动、第二份没生成、
 * 清空回收站后库内副本没了而库外原件还在（后者是防「删素材顺删用户自己的文件」）。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/storage-copy.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')

let app = null
let userDataDir = null
let libraryDir = null
let outsideDir = null

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

test('导入即复制入库：库内有副本、原件不动、重复导入不拷第二份、清库不删库外原件', async () => {
  test.setTimeout(180_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-copy-user-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-copy-lib-'))
  outsideDir = mkdtempSync(join(tmpdir(), 'leaf-copy-outside-'))
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
  const original = join(outsideDir, '原始素材.txt')
  const originalBody = '用户自己磁盘上的文件，库不该动它\n'
  writeFileSync(original, originalBody)
  const referenced = join(outsideDir, '只登记不复制.md')
  writeFileSync(referenced, '# 引用式入库的旧形状\n')

  try {
    const page = await launch()

    // ── 1. 导入即复制：库内 images/<YYMM>/<uuid8>_原名，source_path 记下出处 ──
    const [photo] = await page.evaluate(
      async (p) => await window.api.photos.importPaths([p]),
      original
    )
    expect(photo.filePath, '副本落在库内').toContain(join(libraryDir, 'images'))
    expect(basename(photo.filePath), '副本保留原名（前缀乱码会直接出现在卡片标题上）').toBe(
      '原始素材.txt'
    )
    expect(photo.sourcePath, '原路径进 source_path').toBe(original)
    expect(readFileSync(photo.filePath, 'utf8'), '副本字节与原文件一致').toBe(originalBody)
    expect(existsSync(original), '原文件必须还在').toBe(true)

    // ── 2. 同一个原文件再导入一次：认旧行，不拷第二份、不建第二行 ──
    const again = await page.evaluate(
      async (p) => await window.api.photos.importPaths([p]),
      original
    )
    // addPhotos 只回「本次新建的行」，重复导入应该是空返回（渲染层据此提示 0 个）
    expect(again.length).toBe(0)
    const stillOne = await page.evaluate(() => window.api.photos.getAll())
    expect(stillOne.length, '库里还是那一条').toBe(1)
    expect(stillOne[0].id).toBe(photo.id)
    const yymmDirs = readdirSync(join(libraryDir, 'images'))
    const copies = yymmDirs.flatMap((d) => readdirSync(join(libraryDir, 'images', d)))
    expect(copies.length, `副本只该有一份，实际：${copies.join(',')}`).toBe(1)

    // ── 2b. 不同原文件但同名：库内靠「原名 (2)」共存，不许互相覆盖 ──
    mkdirSync(join(outsideDir, '隔壁'), { recursive: true })
    const twin = join(outsideDir, '隔壁', '原始素材.txt')
    writeFileSync(twin, '同名但内容不同的另一份\n')
    const twinImported = await page.evaluate(
      async (p) => await window.api.photos.importPaths([p]),
      twin
    )
    expect(twinImported.length).toBe(1)
    expect(basename(twinImported[0].filePath), 'uniqueFilePath 的重名形状是「名 2.ext」').toBe(
      '原始素材 2.txt'
    )
    expect(readFileSync(photo.filePath, 'utf8'), '第一份副本不能被覆盖').toBe(originalBody)
    expect(readFileSync(twin, 'utf8'), '两份原件都还在原处').toBe('同名但内容不同的另一份\n')

    // ── 3. 旧形状（引用式）的素材：迁移器 dryRun 要把它数成 candidate ──
    const refPhoto = await page.evaluate(async (p) => await window.api.photos.add(p), referenced)
    expect(refPhoto.filePath, '单条 add 仍是指向原文件（这就是被迁移的对象）').toBe(referenced)
    const dry = await page.evaluate(() => window.api.storage.migrateIntoLibrary(true))
    expect(dry.ok, dry.error ?? '').toBe(true)
    expect(dry.candidates, '库里那条引用素材要数到').toBe(1)
    expect(dry.copied, 'dryRun 不许多拷文件').toBe(0)
    expect(dry.totalSize, '体积要给出来（用户据此决定跑不跑）').toBeGreaterThan(0)

    // ── 4. 真迁移一次：引用素材换绑进库，原件仍在原处 ──
    const moved = await page.evaluate(() => window.api.storage.migrateIntoLibrary(false))
    expect(moved.copied).toBe(1)
    expect(existsSync(referenced), '迁移是拷贝不是移动，原文件不动').toBe(true)
    const afterMove = await page.evaluate(() => window.api.photos.getAll())
    const migrated = afterMove.find((p) => p.fileName === '只登记不复制.md')
    expect(migrated.filePath).toContain(join(libraryDir, 'images'))
    expect(migrated.sourcePath).toBe(referenced)

    // ── 5. 清空回收站：库内副本删掉，任何库外文件一个字都不碰 ──
    const outsideBefore = readdirSync(outsideDir).sort()
    const ids = afterMove.map((p) => p.id)
    await page.evaluate((list) => window.api.photos.deleteMultiple(list), ids)
    expect(await page.evaluate(() => window.api.photos.getRecycleBin().then((l) => l.length))).toBe(
      ids.length
    )
    await page.evaluate(() => window.api.photos.clearRecycleBin())
    const copiesAfterPurge = readdirSync(join(libraryDir, 'images'))
      .flatMap((d) => readdirSync(join(libraryDir, 'images', d)))
      .filter((f) => !f.startsWith('.'))
    expect(copiesAfterPurge, '库内副本随彻底删除一起走').toEqual([])
    expect(readdirSync(outsideDir).sort(), '库外原件绝不跟着陪葬').toEqual(outsideBefore)
  } finally {
    if (app) await app.close()
    app = null
    // 只删本次 mkdtempSync 出来的根，不从素材路径反推父目录
    rmSync(libraryDir, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(outsideDir, { recursive: true, force: true })
  }
})
