/**
 * 导入链真机验收（镜像建夹 / 挂载点 / 粘贴位图 / 侧栏计数 / 文档正文开关 / 剪贴板路径解析）
 *
 * 为什么必须真跑：这一整片在 09-21 桌面误删后的恢复里被整段丢掉，而**服务层与仓库层都还在**
 * （`ImportFolderTree.test.ts` 7 条、`repoFixes.test.ts` 的 sidebarCounts 全绿），
 * 单测绿 + 构建绿 + 界面坏的：缺的是 `ipcMain.handle` 那几行接线。
 * 同理，`getClipboardFiles` 的中文路径回归也只有在真主进程里量得到——
 * 它切的是系统剪贴板里的 plist，纯函数测试拿不到那个字节。
 *
 * 判别性：实测过三段退回——拔掉 importFolderTree 注册 → 停在第 1 条；只拔掉
 * importBlob 及其后 → 红在第 4 条（No handler registered）；再只拔掉侧栏计数及其后 →
 * 红在第 5 条。每一段都跑到了它该跑的位置，所以前面那几条不是空断言。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/import-chain.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')

let app = null
let userDataDir = null
let libraryDir = null

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

/** 1×1 透明 PNG */
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AABQAB/gEBXAIGtAAAAABJRU5ErkJggg=='

test('导入目录镜像建夹 → 挂载点 → 粘贴位图 → 侧栏计数 → 文档正文开关', async () => {
  test.setTimeout(240_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-import-user-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-import-lib-'))
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

  // 素材源放在登记过的库根里面：目录扫描白名单只放行「对话框选过 / userData / 已登记库根」，
  // 真用户是从对话框进来的，探针没有对话框。
  // （别放 userData：macOS 上 tmpdir 是 /var/…，而 app.getPath('userData') 解析成
  //  /private/var/…，isInside 的相对路径判定会判成「外面」而全部拒掉）
  const srcRoot = join(libraryDir, '素材源')
  mkdirSync(join(srcRoot, '红色海报', '局部'), { recursive: true })
  writeFileSync(join(srcRoot, '顶层说明.txt'), '顶层的散装文件\n')
  writeFileSync(join(srcRoot, '红色海报', 'a1.txt'), '海报第一张的说明\n')
  writeFileSync(join(srcRoot, '红色海报', '局部', 'a2.txt'), '海报局部的说明\n')

  // 白名单外的一处目录（留给"必须拒"那条）
  const outsideDir = mkdtempSync(join(tmpdir(), 'leaf-import-outside-'))
  writeFileSync(join(outsideDir, 'secret.txt'), '不该被枚举\n')

  try {
    const page = await launch()

    // ── 1. 「导入文件夹」：镜像磁盘层级，每级文件归本级夹 ──
    const r = await page.evaluate(
      async (p) => await window.api.photos.importFolderTree(p, null),
      srcRoot
    )
    expect(r.fileCount).toBe(3)
    expect(r.photos.length).toBe(3)
    expect(r.truncated).toBe(false)

    const folders = await page.evaluate(() => window.api.photos.listPhotoFolders())
    // 先数"这次新建了 3 个夹"：findByName 一旦不回读同名夹，镜像会重复建整棵树，
    // 而下面按名字查的断言（Map 后写覆盖前写）对此完全无感
    expect(r.folders.length, '本次新建的文件夹数').toBe(3)
    expect(folders.length, '库里总共就该有这 3 个夹').toBe(3)
    expect(new Set(folders.map((f) => f.name)).size, '不许出现同名重复镜像').toBe(3)
    const byName = new Map(folders.map((f) => [f.name, f]))
    const rootFolder = byName.get('素材源')
    const mid = byName.get('红色海报')
    const leaf = byName.get('局部')
    expect(rootFolder, '镜像的根夹').toBeTruthy()
    expect(rootFolder.parentId ?? null, '根夹挂在侧栏根级').toBe(null)
    expect(mid.parentId).toBe(rootFolder.id)
    expect(leaf.parentId).toBe(mid.id)

    const all = await page.evaluate(() => window.api.photos.getAll())
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
    const fileIn = (name) => all.find((p) => p.fileName === name)
    expect(fileIn('顶层说明.txt').folderId, '散装文件归镜像根夹，不落未分类').toBe(rootFolder.id)
    expect(fileIn('a1.txt').folderId).toBe(mid.id)
    expect(fileIn('a2.txt').folderId).toBe(leaf.id)

    // ── 2. 目录扫描白名单：对话框没选过、又不在 userData/库内的目录必须拒 ──
    const rejected = await page
      .evaluate(async (p) => await window.api.photos.importFolderTree(p, null), outsideDir)
      .catch((e) => ({ err: String(e && e.message) }))
    expect(rejected.err ?? '', '越界目录必须报错而不是枚举').toContain('白名单')
    const stillThree = (await page.evaluate(() => window.api.photos.getAll())).length
    expect(stillThree, '被拒的目录一个字都没进库').toBe(3)

    // ── 3. 挂载点：在某个文件夹里导入，镜像树整体挂在它下面 ──
    const mount = await page.evaluate(() => window.api.photos.createPhotoFolder('挂载点', null))
    mkdirSync(join(libraryDir, '第二批', '子'), { recursive: true })
    writeFileSync(join(libraryDir, '第二批', '子', 'b1.txt'), '第二批的嵌套文件\n')
    writeFileSync(join(libraryDir, '散一个.txt'), '散装单个文件\n')
    const mirrored = await page.evaluate(
      async (arg) =>
        await window.api.photos.importPaths([arg.dir, arg.loose], arg.parentId ?? null),
      {
        dir: join(libraryDir, '第二批'),
        loose: join(libraryDir, '散一个.txt'),
        parentId: mount.id
      }
    )
    expect(mirrored.length, '目录 1 个 + 散装 1 个').toBe(2)
    const folders2 = await page.evaluate(() => window.api.photos.listPhotoFolders())
    const secondBatch = folders2.find((f) => f.name === '第二批')
    expect(secondBatch?.parentId, '镜像树根挂在挂载点下').toBe(mount.id)
    const all2 = await page.evaluate(() => window.api.photos.getAll())
    expect(all2.find((p) => p.fileName === 'b1.txt').folderId).toBe(
      folders2.find((f) => f.name === '子').id
    )
    expect(
      all2.find((p) => p.fileName === '散一个.txt').folderId,
      '拖进来的散装文件归当前文件夹视图，不是未分类'
    ).toBe(mount.id)

    // ── 4. ⌘V 粘贴内存位图（没有磁盘路径）：落库 clips/ 并入管线 ──
    const blob = await page.evaluate(
      async (b64) =>
        await window.api.photos.importBlob({
          mime: 'image/png',
          base64: b64
        }),
      PNG_1PX
    )
    expect(blob.ok, blob.error ?? '').toBe(true)
    const clips = readdirSync(join(libraryDir, 'clips')).filter((f) => f.endsWith('.png'))
    expect(clips.length, '位图确实落进了库的 clips/').toBe(1)
    expect(existsSync(join(libraryDir, 'clips', clips[0])), true)
    expect(blob.photo.filePath).toBe(join(libraryDir, 'clips', clips[0]))
    expect(blob.photo.kind, 'PNG 判成图片素材').toBe('image')

    // ── 5. 侧栏计数：走 SQL 聚合，不吃分页窗口 ──
    const counts = await page.evaluate(() => window.api.photos.getSidebarCounts())
    expect(counts.all, '全部 = 3 镜像 + 2 第二批 + 1 位图').toBe(6)
    expect(counts.untagged, '一条都没打标签').toBe(6)

    // ── 6. 文档正文抽取：开关 / 状态 / 手动跑批（后台一直在抽，界面读不到就是误导） ──
    const before = await page.evaluate(() => window.api.photos.docTextStatus())
    expect(before.enabled, '默认关').toBe(false)
    expect(typeof before.pendingTotal).toBe('number')
    const after = await page.evaluate(() => window.api.photos.setDocTextEnabled(true))
    expect(after.enabled).toBe(true)
    const queued = await page.evaluate(() => window.api.photos.runDocText())
    expect(queued.queued, '至少把待抽取的捞起来了').toBeGreaterThanOrEqual(1)
    const drained = await page.evaluate(async () => {
      for (let i = 0; i < 60; i++) {
        const s = await window.api.photos.docTextStatus()
        if (s.pendingTotal === 0) return s
        await new Promise((r) => setTimeout(r, 500))
      }
      return window.api.photos.docTextStatus()
    })
    expect(drained.pendingTotal, '队列必须真被排空（否则界面数字是假的）').toBe(0)
    // 排空 ≠ 抽到了正文：extract() 就算一律写空串也能让 pendingTotal 归 0，所以看内容
    const bodyRow = await page.evaluate(
      async (fid) => await window.api.photos.getById(fid),
      fileIn('a1.txt').id
    )
    expect(bodyRow.docText ?? '', '正文要真进库').toContain('海报第一张的说明')

    // ── 7. fontGlyphs 的守卫：只认已入库素材，码点必须合法 ──
    const notAsset = await page.evaluate(
      async () => await window.api.photos.fontGlyphs('/System/Library/Fonts/Helvetica.ttc', [65]),
      undefined
    )
    expect(notAsset.ok).toBe(false)
    expect(notAsset.error).toBe('素材未入库')
    const badCp = await page.evaluate(
      async (fp) => await window.api.photos.fontGlyphs(fp, [1.5]),
      join(libraryDir, 'clips', clips[0])
    )
    expect(badCp.ok).toBe(false)
    expect(badCp.error).toContain('码点')

    // ── 8. 剪贴板里的中文路径：真主进程写 NSFilenamesPboardType，再走 ⌘V 那条解析 ──
    const cnFile = join(srcRoot, '红色海报', '局部', 'a2.txt')
    // 这一段动的是**系统**剪贴板：先把用户的原内容存下来，无论断言成败都必须放回去
    const saved = await app.evaluate(({ clipboard }) => ({
      files: clipboard.readBuffer('NSFilenamesPboardType').toString('utf8'),
      text: clipboard.readText()
    }))
    let parsed = []
    try {
      await app.evaluate(({ clipboard }, pp) => {
        const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<plist><array><string>${pp}</string></array></plist>`
        clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist, 'utf8'))
      }, cnFile)
      parsed = await page.evaluate(() => window.api.photos.getClipboardFiles())
    } finally {
      await app.evaluate(({ clipboard }, prev) => {
        if (prev.files)
          clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(prev.files, 'utf8'))
        if (prev.text) clipboard.writeText(prev.text)
      }, saved)
    }
    expect(parsed, '中文路径必须整条解析出来（ASCII 白名单会把它截成三段废路径）').toContain(cnFile)
  } finally {
    if (app) await app.close()
    app = null
    // 只删自己 mkdtempSync 出来的那三个根（判空再删），绝不从文件路径反推父目录
    for (const d of [libraryDir, userDataDir, outsideDir]) {
      if (d) rmSync(d, { recursive: true, force: true })
    }
  }
})
