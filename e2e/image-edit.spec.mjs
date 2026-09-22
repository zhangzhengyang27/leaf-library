/**
 * P1 · 图片就地编辑真机验收（收库内副本 + 派生数据重算）
 *
 * 这条测的是单测碰不到的那一半：materialize 与"改完之后一切是否跟着变"。
 * 两者都依赖真库布局，所以 e2e 里预置一个**非 legacy** 的 libraries.json——
 * 用户当前那个库是 legacy（素材直接指向桌面原文件），而 legacy 下 materialize
 * 必须明确抛错而不是就地改他的文件，这条也一并断言。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/image-edit.spec.mjs
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')

let app = null
let userDataDir = null
let libraryDir = null
let assetsDir = null

/** 左上黑、其余白的非对称图：旋转后黑块位置唯一确定结果 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function makeAsymJpg(path, w = 60, h = 20) {
  const px = Buffer.alloc(w * h * 3, 255)
  for (let y = 0; y < h / 2; y++)
    for (let x = 0; x < w / 2; x++) {
      const i = (y * w + x) * 3
      px[i] = px[i + 1] = px[i + 2] = 0
    }
  await sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg().toFile(path)
  return path
}

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

/** 起一个实例：libraryMode='modern' 用非 legacy 库，'legacy' 用 userData 旧布局 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launch(libraryMode) {
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-edit-e2e-'))
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-edit-assets-'))
  if (libraryMode === 'modern') {
    libraryDir = mkdtempSync(join(tmpdir(), 'leaf-edit-lib-'))
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
  }
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
  for (const d of [userDataDir, libraryDir, assetsDir]) {
    if (d) rmSync(d, { recursive: true, force: true })
  }
}

test('非 legacy 库：旋转先收副本，原文件不动，派生数据全部跟上', async () => {
  test.setTimeout(240_000)
  const page = await launch('modern')
  try {
    const src = await makeAsymJpg(join(assetsDir, 'asym.jpg'))
    const srcBefore = readFileSync(src)
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), src)
    const id = await page.evaluate(() =>
      window.api.photos.getByDateSection().then((s) => s.flatMap((x) => x.photos)[0]?.id ?? '')
    )
    expect(id).not.toBe('')
    // 基线要等处理管线回填完宽高再取：导入只保证行存在，尺寸/缩略图是异步补的
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
    const waitProcessed = (want) =>
      expect
        .poll(
          () =>
            page.evaluate(
              async (pid) => window.api.photos.getById(pid).then((x) => x?.thumbStatus ?? -1),
              id
            ),
          { timeout: 60_000, intervals: [500] }
        )
        .toBe(want)
    await waitProcessed(1)
    const before = await page.evaluate(async (pid) => {
        const x = await window.api.photos.getById(pid)
        return { filePath: x.filePath, width: x.width, height: x.height }
      },
      id
    )
    expect([before.width, before.height]).toEqual([60, 20])
    // 导入是"引用"：素材此刻还指着 assets 目录里的原文件
    expect(before.filePath).toBe(src)

    const r = await page.evaluate(async (pid) => await window.api.edit.rotate(pid, 90), id)
    expect(r.ok).toBe(true)
    // ① 原文件字节完全没动（这是整条设计的前提）
    expect(readFileSync(src).equals(srcBefore)).toBe(true)
    // ② 等"重算后的终态"：thumbStatus 回到 1 且宽高已换向。
    //    不能先等 0 再等 1 —— 小图管线几十毫秒就跑完，0 那个窗口会被整个跳过（真 flaky 过一次）
    await expect
      .poll(
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
        async () =>
          page.evaluate(async (pid) => {
            const x = await window.api.photos.getById(pid)
            return x && x.thumbStatus === 1 && x.width === 20 && x.height === 60
          }, id),
        { timeout: 60_000, intervals: [500] }
      )
      .toBe(true)

    const after = await page.evaluate(
      async (pid) => {
        const x = await window.api.photos.getById(pid)
        return {
          filePath: x.filePath,
          sourcePath: x.sourcePath,
          width: x.width,
          height: x.height,
          fileSize: x.fileSize
        }
      },
      id
    )
    // ③ 素材改指库内副本，sourcePath 记下出处
    expect(after.filePath).not.toBe(src)
    expect(after.filePath.startsWith(libraryDir)).toBe(true)
    expect(existsSync(after.filePath)).toBe(true)
    expect(after.sourcePath).toBe(src)
    // ④ 宽高换了向（90°），文件大小被刷新（它只在导入时算一次，漏刷就是旧数值）
    expect([after.width, after.height]).toEqual([20, 60])
    expect(after.fileSize).toBe(statSync(after.filePath).size)
    // ⑤ 库内那份像素确实是转过的（不是只改了数据库字段）
    const m = await sharp(after.filePath).metadata()
    expect([m.width, m.height]).toEqual([20, 60])
  } finally {
    await closeApp()
  }
})

test('legacy 库（素材直接指向用户桌面原文件）：明确拒绝，绝不就地改', async () => {
  test.setTimeout(180_000)
  const page = await launch('legacy')
  try {
    const src = await makeAsymJpg(join(assetsDir, 'asym.jpg'))
    const srcBefore = readFileSync(src)
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), src)
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.api.photos.getByDateSection().then((s) => s.flatMap((x) => x.photos).length)
          ),
        { timeout: 40_000, intervals: [1000] }
      )
      .toBe(1)
    const id = await page.evaluate(() =>
      window.api.photos.getByDateSection().then((s) => s.flatMap((x) => x.photos)[0].id)
    )
    const r = await page.evaluate(async (pid) => await window.api.edit.rotate(pid, 90), id)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/旧版库布局|不支持/)
    // 关键断言：失败必须是"什么都没发生"，原文件与素材指向都不变
    expect(readFileSync(src).equals(srcBefore)).toBe(true)
    const still = await page.evaluate(
      async (pid) => window.api.photos.getById(pid).then((p) => p.filePath),
      id
    )
    expect(still).toBe(src)
  } finally {
    await closeApp()
  }
})

test('IPC 边界：degrees 与 axis 走白名单，路径渲染层传不进来', async () => {
  test.setTimeout(180_000)
  const page = await launch('modern')
  try {
    const src = await makeAsymJpg(join(assetsDir, 'asym.jpg'))
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), src)
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.api.photos.getByDateSection().then((s) => s.flatMap((x) => x.photos).length)
          ),
        { timeout: 40_000, intervals: [1000] }
      )
      .toBe(1)
    const id = await page.evaluate(() =>
      window.api.photos.getByDateSection().then((s) => s.flatMap((x) => x.photos)[0].id)
    )
    const before = readFileSync(src)
    for (const bad of [0, 45, -90, 360, '90x', null]) {
      const r = await page.evaluate(
        async ([pid, d]) => await window.api.edit.rotate(pid, d),
        [id, bad]
      )
      expect(r.ok).toBe(false)
    }
    for (const bad of ['diagonal', '', null, 1]) {
      const r = await page.evaluate(
        async ([pid, a]) => await window.api.edit.flip(pid, a),
        [id, bad]
      )
      expect(r.ok).toBe(false)
    }
    // 全被挡掉之后，磁盘上什么都没变
    expect(readFileSync(src).equals(before)).toBe(true)
    const notMine = await page.evaluate(
      async () => await window.api.edit.rotate('/etc/hosts', 90)
    )
    expect(notMine.ok).toBe(false)
  } finally {
    await closeApp()
  }
})

test('HEIC/RAW 这类格式拒绝就地编辑（重编码等于毁原始信息）', async () => {
  test.setTimeout(180_000)
  const page = await launch('modern')
  try {
    const fake = join(mkdtempSync(join(tmpdir(), 'leaf-heic-')), 'shot.heic')
    await makeAsymJpg(fake)
    writeFileSync(join(dirname(fake), 'note.txt'), 'x')
    copyFileSync(fake, join(dirname(fake), 'keep.txt'))
    await page.evaluate(async (p) => await window.api.photos.importPaths([p]), fake)
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.api.photos.getByDateSection().then((s) => s.flatMap((x) => x.photos).length)
          ),
        { timeout: 40_000, intervals: [1000] }
      )
      .toBe(1)
    const id = await page.evaluate(() =>
      window.api.photos.getByDateSection().then((s) => s.flatMap((x) => x.photos)[0].id)
    )
    const gate = await page.evaluate(async (pid) => await window.api.edit.canEdit(pid), id)
    expect(gate.ok).toBe(false)
    expect(gate.reason).toMatch(/不支持/)
    const r = await page.evaluate(async (pid) => await window.api.edit.rotate(pid, 90), id)
    expect(r.ok).toBe(false)
    rmSync(dirname(fake), { recursive: true, force: true })
  } finally {
    await closeApp()
  }
})
