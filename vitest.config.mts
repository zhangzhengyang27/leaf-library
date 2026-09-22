// ⚠ 2026-09-22 桌面删除事故后重建的配置，非原件。原件从未进入任何快照/会话记录。
// 依据：同作者姊妹仓 electron-tools 的 vitest.config.ts 全文（已恢复）+ 本仓 src 下 10 个 __tests__ 目录
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@components': resolve(__dirname, 'src/renderer/src/components'),
      '@composables': resolve(__dirname, 'src/renderer/src/composables'),
      '@utils': resolve(__dirname, 'src/renderer/src/utils'),
      '@views': resolve(__dirname, 'src/renderer/src/views')
    }
  },
  plugins: [vue()],
  test: {
    exclude: ['e2e/**', 'scripts/**', '**/node_modules/**', 'references/**']
  }
})
