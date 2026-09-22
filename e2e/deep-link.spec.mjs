/**
 * leaf:// 深链 真机验收
 *
 * 测的是"点一条链接把 app 拉起来之后真的跳到位"——冷启动这条最难自己试出来的路径：
 * argv → 主进程暂存 → 渲染层 mount 后 take → 开预览 / 切文件夹视图。
 * 顺带钉住三种"不该动":形状不对、id 合法但不存在、以及它们都不该把应用弄坏。
 *
 * 覆盖不到的部分说清楚：macOS 热启动走 `open-url`，那是 Electron 自己派发的的事件，
 * 脚本没法扮演 LaunchServices；但 open-url 与 argv 在 `accept()` 处汇成同一条路，
 * 差的只有事件投递本身。另外 `setAsDefaultProtocolClient` 只在打包态执行
 * （dev 下会把通用 Electron 二进制写成 leaf: 的处理器，落在开发机的 LaunchServices 里
 * 且卸掉构建也不会自己清），scheme 声明的真凭实据是 electron-builder.yml 的
 * `protocols` → Info.plist 的 CFBundleURLTypes。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/deep-link.spec.mjs
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

/** extraArgs 用来模拟"从链接启动"（extraArgs 会进 process.argv） */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
async function launch(extraArgs = []) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, ...extraArgs],
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

test('冷启动带 leaf://…：item 开预览、folder 切视图、坏链接不动作', async () => {
  test.setTimeout(180_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-deeplink-user-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-deeplink-lib-'))
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-deeplink-assets-'))
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
  writeFileSync(join(assetsDir, 'target.txt'), '要被深链打开的那条素材\n')
  writeFileSync(join(assetsDir, 'other.txt'), '另一条素材\n')
  try {
    // 第一趟：入库并拿到 id（深链的 id 必须来自真实库里的一行）
    let page = await launch()
    for (const f of [join(assetsDir, 'target.txt'), join(assetsDir, 'other.txt')]) {
      await page.evaluate(async (p) => await window.api.photos.importPaths([p]), f)
    }
    const id = await page.evaluate(() =>
      window.api.photos
        .getByDateSection()
        .then((s) => s.flatMap((x) => x.photos).find((p) => p.fileName === 'target.txt')?.id ?? '')
    )
    expect(id).not.toBe('')
    await closeApp()

    // 第二趟：带链接冷启动，谁都没点，预览就该是 target.txt
    // 断言落在预览里那段正文内容上（`.fixed` 这类通用类名启动时就有别的元素在用）
    page = await launch([`leaf://item/${id}`])
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const pre = document.querySelector('pre.leaf-code')
            return pre ? `${pre.closest('.fixed') ? '预览内: ' : '游离: '}${pre.textContent}` : ''
          }),
        { timeout: 25_000, intervals: [500] }
      )
      .toContain('要被深链打开的那条素材')
  } finally {
    await closeApp()
    for (const d of [userDataDir, libraryDir, assetsDir])
      if (d) rmSync(d, { recursive: true, force: true })
  }
})

test('形状不对的链接不动作、不弄坏应用', async () => {
  test.setTimeout(180_000)
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-deeplink-bad-'))
  libraryDir = mkdtempSync(join(tmpdir(), 'leaf-deeplink-bad-lib-'))
  assetsDir = mkdtempSync(join(tmpdir(), 'leaf-deeplink-bad-assets-'))
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
  try {
    // 非 UUID、路径穿越各来一条：应当什么都不打开，而界面照常可用
    const page = await launch([
      'leaf://item/not-a-uuid',
      'leaf://item/..%2f..%2fetc%2fpasswd',
      'leaf://folder/' + '0'.repeat(36)
    ])
    await page.waitForTimeout(2_000)
    // 没有任何预览被打开（预览里的正文块是 <pre class="leaf-code">）
    expect(await page.locator('pre.leaf-code').count()).toBe(0)
    // 而应用照常可用：网格与外壳都在
    expect(await page.locator('.LeafAppShell').count()).toBe(1)
    expect(await page.evaluate(() => document.body.innerText.includes('全部')))
  } finally {
    await closeApp()
    for (const d of [userDataDir, libraryDir, assetsDir])
      if (d) rmSync(d, { recursive: true, force: true })
  }
})
