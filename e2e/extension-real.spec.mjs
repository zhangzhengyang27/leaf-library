/**
 * 浏览器剪藏扩展 · 真机全链路（MV3 加载 → 配置 → ping → fromUrl → fromBase64）
 *
 * ⚠ 这份是 2026-09-22 的**重建件**，不是原件。原件自恢复基线 `d2b91fb` 起就只剩 91 行
 * 且连文件头（imports/常量）都丢了，git 里只有那一个 blob、恢复池里也没有副本。
 * 保留下来的那 91 行的结构、注释与判据（token 必须走 `clipServer:getConfig` 而不是读
 * clip-server.json——落盘的是 safeStorage 密文）原样沿用；补全的是 options 之后的半段。
 *
 * 为什么值得有这条：ClipServer 的鉴权是「token + Origin 必须是 chrome-extension:// +
 * Host 必须是 127.0.0.1」三条一起判，用 curl（无 Origin）跑只会漏掉前两条里的一半。
 * 这里所有请求都从**扩展自己的页面**发出，Origin 是真的。
 *
 * 仍然测不到的：右键菜单/弹窗那套手势（自动化拿不到），与原 spec 的口径一致——
 * 网络半区由本文件覆盖，手势半区需要人点一次。
 *
 * 用法：pnpm build && pnpm exec playwright test e2e/extension-real.spec.mjs
 */
import { test, expect, chromium } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { createServer } from 'node:http'
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')
const EXT_PATH = join(ROOT, 'extension', 'chrome')

let app = null
let clipCfg = null
let userDataDir = null
let leafWin = null // beforeAll 里等到的主窗口，测试段复用它查库

test.beforeAll(async () => {
  test.setTimeout(150_000)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  // 独立 userData：测试产生的 clip-server.json / 素材写入全部落在临时目录，
  // 不会污染开发者真实素材库
  userDataDir = await mkdtemp(join(tmpdir(), 'leaf-e2e-ext-'))
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })

  // 明文 token 必须走渲染层 IPC（审查修复）：clip-server.json 落盘的是
  // safeStorage 加密后的 token（P0-8），旧实现直接读文件当明文用 → 401。
  // window.api.photos.clipServer.getConfig() 与设置页展示同一条合法链路。
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
  leafWin = await getMainWindow()
  await leafWin.waitForFunction(
    () =>
      !!document.querySelector('#app .LeafAppShell') && document.getElementById('splash') === null,
    undefined,
    { timeout: 15_000 }
  )
  const deadline = Date.now() + 60_000
  let ready = false
  while (Date.now() < deadline && !ready) {
    // clipServer API 挂在 photos 命名空间下（与设置页展示 token 同一链路）
    clipCfg = await leafWin.evaluate(() => window.api.photos.clipServer.getConfig())
    if (!clipCfg?.port || !clipCfg?.token) {
      await new Promise((r) => setTimeout(r, 500))
      continue
    }
    ready = await fetch(`http://127.0.0.1:${clipCfg.port}/api/v1/ping`, {
      headers: { 'x-leaf-token': clipCfg.token }
    })
      .then((r) => r.ok)
      .catch(() => false)
    if (!ready) await new Promise((r) => setTimeout(r, 500))
  }
  if (!ready) throw new Error(`ClipServer 未在 60s 内可连（port=${clipCfg?.port}）`)
})

test.afterAll(async () => {
  if (app) await app.close()
  // 只删自己 mkdtemp 出来的那个根
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true })
})

test('扩展真机加载 → 配置 → ping → fromUrl → fromBase64 全链路', async () => {
  test.setTimeout(150_000)
  // 本地图片源（fromUrl 的下载目标，避免依赖外网）
  const img = await readFile(join(ROOT, 'extension', 'icons', 'icon128.png'))
  const imgServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' })
    res.end(img)
  })
  await new Promise((r) => imgServer.listen(0, '127.0.0.1', r))
  const imgUrl = `http://127.0.0.1:${imgServer.address().port}/test.png`

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true, // playwright ≥1.46 新 headless 支持扩展
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`]
  })

  try {
    // 1. MV3 service worker 激活 → 拿扩展 id
    let sw = context.serviceWorkers()[0]
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15_000 })
    const extensionId = new URL(sw.url()).host
    expect(extensionId).toMatch(/^[a-p]{32}$/)

    // 2. options 页配置 baseUrl/token（chrome/ 版 options：#baseUrl + #token → chrome.storage.local）
    const options = await context.newPage()
    await options.goto(`chrome-extension://${extensionId}/options.html`)
    await options.fill('#baseUrl', `http://127.0.0.1:${clipCfg.port}`)
    await options.fill('#token', clipCfg.token)
    await options.click('#save')
    await expect(options.locator('#status')).toContainText('已保存')

    // 3. 从扩展页面（真正的 chrome-extension:// Origin）探活：
    //    鉴权是 token + Origin + Host 三条一起判，缺了 Origin 这条就等于没测扩展这条路
    const ping = await options.evaluate(
      async ({ base, token }) =>
        fetch(`${base}/api/v1/ping`, { headers: { 'x-leaf-token': token } }).then((r) => r.json()),
      { base: `http://127.0.0.1:${clipCfg.port}`, token: clipCfg.token }
    )
    expect(ping.ok, JSON.stringify(ping)).toBe(true)

    // 4. fromUrl：扩展传一个 URL，Leaf 侧下载并入库
    const fromUrl = await options.evaluate(
      async ({ base, token, url }) =>
        fetch(`${base}/api/v1/photos/fromUrl`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-leaf-token': token },
          body: JSON.stringify({ url, title: '扩展收的一张' })
        }).then((r) => r.json()),
      { base: `http://127.0.0.1:${clipCfg.port}`, token: clipCfg.token, url: imgUrl }
    )
    expect(fromUrl.ok, JSON.stringify(fromUrl)).toBe(true)
    expect(typeof fromUrl.id).toBe('string')

    // 5. fromBase64：无 URL 的位图（右键「收藏这张图」那一档的数据形状）
    const b64 = img.toString('base64')
    const fromBase64 = await options.evaluate(
      async ({ base, token, data }) =>
        fetch(`${base}/api/v1/photos/fromBase64`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-leaf-token': token },
          body: JSON.stringify({ data, ext: 'png', title: '扩展贴的一张' })
        }).then((r) => r.json()),
      { base: `http://127.0.0.1:${clipCfg.port}`, token: clipCfg.token, data: b64 }
    )
    expect(fromBase64.ok, JSON.stringify(fromBase64)).toBe(true)

    // 6. 错 token 必须 401（否则前面那两条的鉴权判据就是空的）
    const denied = await options.evaluate(
      async (base) =>
        fetch(`${base}/api/v1/ping`, { headers: { 'x-leaf-token': 'wrong-token-value' } }).then(
          (r) => r.status
        ),
      `http://127.0.0.1:${clipCfg.port}`
    )
    expect(denied).toBe(401)

    // 7. 真落库：两条素材都能在 Leaf 里查到，字节确实进了库的 clips/ 目录
    const ids = [fromUrl.id, fromBase64.id]
    const rows = []
    for (const id of ids) {
      const p = await leafWin.evaluate(async (pid) => await window.api.photos.getById(pid), id)
      rows.push(p)
    }
    for (const p of rows) {
      expect(p, '剪藏进来的素材必须查得到').toBeTruthy()
      expect(existsSync(p.filePath), `落盘文件必须在：${p.filePath}`).toBe(true)
      // Electron 的 userData 会把 /var 解析成 /private/var，两侧都 realpath 再比
      expect(
        dirname(realpathSync(p.filePath)),
        `剪藏的文件要落在库的 clips/ 里：${p.filePath}`
      ).toBe(realpathSync(join(userDataDir, 'clips')))
    }
    const clipFiles = readdirSync(join(userDataDir, 'clips')).filter((f) => f.endsWith('.png'))
    expect(clipFiles.length, 'clips/ 里应该正好这两张').toBeGreaterThanOrEqual(2)
  } finally {
    await context.close()
    imgServer.close()
  }
})
