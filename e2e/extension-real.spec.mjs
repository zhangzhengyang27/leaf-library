let clipCfg = null
let userDataDir = null

// eslint-disable-next-line no-empty-pattern -- playwright 钩子签名要求
test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000)
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
  // window.api.clipServer.getConfig() 与设置页展示同一条合法链路。
  // 等 AppShell 挂载 + 启动闪屏退场后取值，端口变化时重取。
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
  const win = await getMainWindow()
  await win.waitForFunction(
    () => !!document.querySelector('#app .LeafAppShell') && document.getElementById('splash') === null,
    undefined,
    { timeout: 15000 }
  )
  const deadline = Date.now() + 60_000
  let ready = false
  while (Date.now() < deadline && !ready) {
    // clipServer API 挂在 photos 命名空间下（与设置页展示 token 同一链路）
    clipCfg = await win.evaluate(() => window.api.photos.clipServer.getConfig())
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
}, 120_000)

test.afterAll(async () => {
  if (app) await app.close()
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true })
})

test('扩展真机加载 → 配置 → ping → fromUrl → fromBase64 全链路', async () => {
  test.setTimeout(60_000)
  // 本地图片源（fromUrl 的下载目标，避免依赖外网）
  const img = await readFile(join(ROOT, 'extension', 'icons', 'icon128.png'))
  const imgServer = createServer((req, res) => {
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
