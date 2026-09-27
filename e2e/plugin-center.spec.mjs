/**
 * 插件中心 P1（D-025）真 app e2e：
 * 运行期构造 .leafplugin 夹具（yazl）→ 经 api 桥导入 → 中心面板可见 → 禁用 →
 * 重启 app（同 userData）断言禁用态持久 → 卸载（过确认弹窗）→ 列表消失。
 * 独立 userData，不碰用户真库。
 */
import { test, expect } from 'playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yazl from 'yazl'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs 无法写 TS 返回类型
function makeLeafPlugin(zipPath, manifest) {
  const z = new yazl.ZipFile()
  z.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json')
  z.addBuffer(Buffer.from('<html><body>hello plugin</body></html>'), 'index.html')
  z.end()
  const out = writeFileSync // 占位避免 lint 未用告警
  void out
  const chunks = []
  z.outputStream.on('data', (c) => chunks.push(c))
  return new Promise((res, rej) => {
    z.outputStream.on('end', () => {
      writeFileSync(zipPath, Buffer.concat(chunks))
      res()
    })
    z.outputStream.on('error', rej)
  })
}

const MANIFEST = {
  id: 'e2e-hello',
  name: 'E2E Hello 插件',
  version: '1.0.0',
  category: 'inspector',
  entry: 'index.html',
  description: 'e2e 测试插件',
  permissions: ['photos:read']
}

test('插件中心：导入 → 启停持久 → 卸载', async () => {
  test.setTimeout(120000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'leaf-pc-e2e-'))
  const zip = join(userDataDir, 'hello.leafplugin')
  await makeLeafPlugin(zip, MANIFEST)
  // 预置非 legacy 库（照 annotations-chain 范式：不预置时启动走旧布局，网格停空态）
  const libraryDir = join(userDataDir, 'lib')
  mkdirSync(join(libraryDir, 'images'), { recursive: true })
  writeFileSync(
    join(userDataDir, 'libraries.json'),
    JSON.stringify({
      activeLibraryId: 'e2e',
      libraries: [
        {
          id: 'e2e',
          name: 'e2e 库',
          path: libraryDir,
          legacy: false,
          createdAt: Date.now(),
          lastOpenedAt: Date.now()
        }
      ]
    })
  )

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs
  const launch = () =>
    electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`], timeout: 30000 })

  let app = await launch()
  const win = await app.firstWindow()
  await win.waitForSelector('#app', { timeout: 15000 })

  // 导入（经桥，绕文件选择器；文件选择器链路由 Task 7 的 pickAndImport 承担）
  const imported = await win.evaluate(async (p) => window.api.plugins.importPlugin(p), zip)
  expect(imported.ok).toBe(true)
  await win.evaluate(() => window.location.reload())
  await win.waitForTimeout(1500)

  // 打开中心（TitleBar ⚡）
  await win.locator('button[aria-label="插件"]').click()
  await win.waitForSelector('[role="menu"], [class*="modal"]', { timeout: 5000 })
  await win.waitForTimeout(800)
  await expect(win.getByText('E2E Hello 插件').first()).toBeVisible()

  // 禁用（Eagle 形态：行内灰按钮「已安装」点击 → 切「禁用中」，无确认弹窗）
  const row = win.locator('.plugin-list .plugin', { hasText: 'E2E Hello 插件' }).first()
  await row.getByRole('button', { name: '已安装' }).click()
  await expect(row.getByRole('button', { name: '禁用中' })).toBeVisible({ timeout: 5000 })
  await win.waitForTimeout(500)
  // 关面板收状态，重启断言持久
  await app.close()

  app = await launch()
  const win2 = await app.firstWindow()
  await win2.waitForSelector('#app', { timeout: 15000 })
  const persisted = await win2.evaluate(async () => {
    const all = await window.api.plugins.listAll()
    return all.find((p) => p.id === 'e2e-hello')?.enabled
  })
  expect(persisted).toBe(false)

  // 卸载（经确认弹窗）：点插件行 → 滑入详情页 →「卸载」（danger）
  await win2.locator('button[aria-label="插件"]').click()
  await win2.waitForTimeout(800)
  await win2.getByText('E2E Hello 插件').first().click()
  await win2.getByText('插件介绍').waitFor({ timeout: 5000 })
  // 详情面板的「卸载」→ 确认弹窗内点确认（定位锚定在含确认文案的弹窗容器内，
  // 避免撞上中心面板自己的同名按钮——Teleport 次序会让 .last() 不可靠）
  await win2.getByRole('button', { name: '卸载', exact: true }).first().click()
  await win2.getByText('将删除「E2E Hello 插件」的安装副本').waitFor({ timeout: 5000 })
  await win2.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) =>
        b.textContent.trim() === '卸载' &&
        b.closest('div')?.parentElement?.textContent.includes('将删除「E2E Hello 插件」的安装副本')
    )
    btn.click()
  })
  let after = true
  for (let i = 0; i < 10 && after; i++) {
    await win2.waitForTimeout(500)
    after = await win2.evaluate(async () => {
      const all = await window.api.plugins.listAll()
      return all.some((p) => p.id === 'e2e-hello')
    })
  }
  expect(after).toBe(false)
  await app.close()
  rmSync(userDataDir, { recursive: true, force: true })
})
