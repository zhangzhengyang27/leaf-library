// ⚠ 2026-09-22 桌面删除事故后重建，非原件。
// 依据：事故前的 `cat electron.vite.config.ts` 输出残片里有 main/preload/renderer 三段 alias 原文，
// 本文件按那些残片 + electron-vite 标准骨架还原；未残片的字段用模板默认值。
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    // p-queue 必须打进主进程包，不能外部化：它 7.x 起是纯 ESM（"type":"module"），
    // 而 main 产物是 CJS —— require('p-queue') 拿到的是命名空间对象，
    // `new PQueue(...)` 直接 "PQueue is not a constructor"，应用启动即崩。
    // 依据：事故前的构建产物（build-snapshot-2026-09-21T2122/out/main/index.js）里
    // 是 p-queue 的 v9 类源码内联、0 次 require，说明原件就是把内走的。
    plugins: [externalizeDepsPlugin({ exclude: ['p-queue'] })],
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
