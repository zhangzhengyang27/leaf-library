/**
 * Leaf · E2E 烟雾测试（playwright + _electron）
 *
 * 启动 electron-vite preview 产物的 Electron 实例，验证：
 * 1. 主窗口出现（title 含 Leaf）
 * 2. 首屏渲染成功（DOM 可见 .leaf-onboarding 或 .LeafHome）
 * 3. 主题切换生效（IPC setTheme → document.documentElement.dataset.theme）
 *
 * 用法：
 *   - 终端先跑：pnpm build
 *   - 然后跑：pnpm exec playwright test e2e/launch-smoke.spec.mjs
 *
 * 限制（与本地差异）：
 * - 仅本地跑（CI 上 Linux runner 需要 xvfb 包装，暂未集成）
 * - 启动 out/main/index.js 是 production build 后的入口
 *
 * 来源：P4-2「真实 GUI E2E（playwright + electron.launch）」
 */

import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')
const MAIN_ENTRY = join(ROOT, 'out/main/index.js')

let app = null
let userDataDir = null

/**
 * 获取主窗口（按标题匹配）。
 * 不能用 app.firstWindow()：截图模块（electron-screenshots）启动时会先创建一个
 * 标题为 "Rsbuild App" 的隐藏窗口，firstWindow 存在竞态。
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
const getMainWindow = async () => {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      try {
        if (/本地工具箱|Leaf/.test(await w.title())) return w
      } catch {
        // 窗口可能已关闭
      }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return app.firstWindow()
}

test.beforeAll(async () => {
  // 关键修复：移除 ELECTRON_RUN_AS_NODE 环境变量
  // 否则 Electron 会把命令行参数当作 Node.js 参数而不是 Electron 参数
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  // 独立 userData（审查修复）：默认 userData 会撞上正在运行的实例的
  // 单实例锁（requestSingleInstanceLock 失败 → 新实例秒退 → _electron.launch
  // 永久等待），且测试会污染真实素材库
  userDataDir = mkdtempSync(join(tmpdir(), 'leaf-e2e-smoke-'))

  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    launchOptions: { env }
  })
}, 120000)

test.afterAll(async () => {
  if (app) await app.close()
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
})

test('主窗口启动 + 首屏可见', async () => {
  if (!app) throw new Error('app not launched')
  const page = await getMainWindow()

  // title 来自 src/renderer/index.html（a92d576 起产品名为「本地工具箱」）
  await expect(page).toHaveTitle(/本地工具箱|Leaf/)

  // Vue 挂载完成的可靠标记（旧断言的 .leaf-onboarding / .LeafHome 类名已不存在）：
  // 1) #app 内渲染出 AppShell 根（.LeafAppShell）
  // 2) 启动闪屏 #splash 已被 hideSplash 移除（挂载后 ~260ms）
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(
    () =>
      !!document.querySelector('#app .LeafAppShell') &&
      document.getElementById('splash') === null,
    undefined,
    { timeout: 15000 }
  )
})

test('主题切换：点击主题按钮后 html.dark 变化', async () => {
  if (!app) throw new Error('app not launched')
  const page = await getMainWindow()

  // 跳过 onboarding 走 Hub
  await page.evaluate(async () => {
    if (window.api?.preferences?.setOnboardingCompleted) {
      await window.api.preferences.setOnboardingCompleted()
    }
  })

  // 等 Hub 加载（路由跳到 /）
  await page.waitForTimeout(500)

  const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme)
  expect(['light', 'dark', 'auto']).toContain(initialTheme ?? 'auto')

  // 通过 IPC 切到 dark 测 setTheme 真的改变 DOM
  await page.evaluate(async () => {
    if (window.api?.preferences?.setTheme) {
      await window.api.preferences.setTheme('dark')
    }
  })
  await page.waitForTimeout(200)
  const darkTheme = await page.evaluate(() => document.documentElement.dataset.theme)
  expect(darkTheme).toBe('dark')

  // 切回 light
  await page.evaluate(async () => {
    if (window.api?.preferences?.setTheme) {
      await window.api.preferences.setTheme('light')
    }
  })
  await page.waitForTimeout(200)
  const lightTheme = await page.evaluate(() => document.documentElement.dataset.theme)
  expect(lightTheme).toBe('light')
})
