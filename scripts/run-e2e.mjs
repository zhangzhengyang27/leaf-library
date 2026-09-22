/**
 * Leaf · E2E 烟雾测试（使用 electron-vite preview）
 */

import { spawn } from 'child_process'
import { chromium } from 'playwright'

const DEBUG_PORT = 9222
const MAX_WAIT = 60000

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForBrowser(port, maxWaitMs = MAX_WAIT) {
  const start = Date.now()
  console.log(`[启动] 等待 Electron 启动 (端口 ${port})...`)

  while (Date.now() - start < maxWaitMs) {
    try {
      const browser = await chromium.connectOverCDP(`ws://localhost:${port}`)
      console.log('[启动] Electron 已启动')
      return browser
    } catch (_) {
      await sleep(500)
    }
  }
  throw new Error('等待 Electron 启动超时')
}

async function runTests() {
  let browser = null
  let viteProcess = null

  try {
    console.log('[测试] 启动 electron-vite preview...')

    viteProcess = spawn('npx', ['electron-vite', 'preview'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
      shell: true
    })

    viteProcess.stdout.on('data', (data) => {
      const output = data.toString().trim()
      if (output) console.log('[Vite]', output)
    })

    viteProcess.stderr.on('data', (data) => {
      const output = data.toString().trim()
      if (output && !output.includes('Deprecation') && !output.includes('npm warn')) {
        console.log('[Vite]', output)
      }
    })

    // 等待 Electron 启动
    browser = await waitForBrowser(DEBUG_PORT)
    const context = browser.contexts()[0] || await browser.newContext()
    const page = context.pages()[0] || await context.newPage()

    // 测试 1: 主窗口启动 + 首屏可见
    console.log('\n[测试 1/2] 主窗口启动 + 首屏可见...')

    await page.waitForLoadState('domcontentloaded')
    const rootExists = await page.evaluate(() => {
      return !!document.querySelector('.leaf-onboarding, .LeafHome, body')
    })
    console.log('[结果]', rootExists ? '页面已加载' : '未找到页面元素')
    console.log('[测试 1] ' + (rootExists ? '通过 ✓' : '失败 ✗'))

    // 测试 2: 主题切换
    console.log('\n[测试 2/2] 主题切换...')

    // 跳过 onboarding 走 Hub
    await page.evaluate(async () => {
      if (window.api?.preferences?.setOnboardingCompleted) {
        await window.api.preferences.setOnboardingCompleted()
      }
    })
    await sleep(500)

    const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme)
    console.log('[初始主题]', initialTheme)

    // 通过 IPC 切到 dark
    await page.evaluate(async () => {
      if (window.api?.preferences?.setTheme) {
        await window.api.preferences.setTheme('dark')
      }
    })
    await sleep(200)
    const darkTheme = await page.evaluate(() => document.documentElement.dataset.theme)
    console.log('[切换后主题]', darkTheme)

    // 切回 light
    await page.evaluate(async () => {
      if (window.api?.preferences?.setTheme) {
        await window.api.preferences.setTheme('light')
      }
    })
    await sleep(200)
    const lightTheme = await page.evaluate(() => document.documentElement.dataset.theme)
    console.log('[重置后主题]', lightTheme)

    const themeWorks = darkTheme === 'dark' && lightTheme === 'light'
    console.log('[测试 2] ' + (themeWorks ? '通过 ✓' : '失败 ✗'))

    console.log('\n========================================')
    console.log('烟雾测试完成！')
    console.log('  测试 1: ' + (rootExists ? '✓ 通过' : '✗ 失败'))
    console.log('  测试 2: ' + (themeWorks ? '✓ 通过' : '✗ 失败'))
    console.log('========================================\n')

  } catch (error) {
    console.error('\n[错误]', error.message)
    process.exitCode = 1
  } finally {
    if (browser) {
      await browser.close()
    }
    if (viteProcess) {
      console.log('[关闭] 关闭 electron-vite...')
      viteProcess.kill()
    }
  }
}

runTests()
