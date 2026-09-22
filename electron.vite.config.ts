// ⚠ 2026-09-22 桌面删除事故后重建，非原件。
// 依据：事故前的 `cat electron.vite.config.ts` 输出残片里有 main/preload/renderer 三段 alias 原文，
// 本文件按那些残片 + electron-vite 标准骨架还原；未残片的字段用模板默认值。
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@preload': resolve('src/preload')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@components': resolve('src/renderer/src/components'),
        '@composables': resolve('src/renderer/src/composables'),
        '@utils': resolve('src/renderer/src/utils'),
        '@views': resolve('src/renderer/src/views'),
        '@preload': resolve('src/preload'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [vue()]
  }
})
