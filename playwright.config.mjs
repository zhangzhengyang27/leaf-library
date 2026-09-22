/**
 * Leaf · Playwright E2E 配置
 *
 * 仅本地跑，不进 CI（Linux runner 需 xvfb 包装 + 重新设计）。
 * 跑前先 `pnpm build` 产生 out/main/index.js。
 */

import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  retries: process.env.CI ? 2 : 1, // use.trace=on-first-retry 依赖 retries 才有意义
  use: {
    trace: 'on-first-retry'
  },
  // electron 项目没有 webServer，由 beforeAll 里 _electron.launch 启动
  projects: [
    {
      name: 'electron'
    }
  ]
})
