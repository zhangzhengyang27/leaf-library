import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'scripts/**', 'extension/**', 'native/**', 'src/main/db/migrations/**'] }, // migrations：历史 DDL 原样保留，格式化搅动会污染 diff // extension/：浏览器扩展独立产物，chrome 全局/JS 运行时不适用应用 TS 规则集 // native/：N-API 原生 addon（CommonJS require 合法）
  // 09-21 桌面误删后的恢复暂存池：里面是别的 app 的模块与反编译产物，不是源码。
  // 不忽略的话 `pnpm lint` 报 3061 个错（其中 src 里真错 0 个），门等于没有。
  { ignores: ['_recovered-usable/**', '_recovery-partials/**', '_compiled-from-cache/**', '_错位-src根/**', 'build-snapshot-*/**', '_恢复报告*.md'] },
  // 40 个 de-Vite 反编译参考件（每个都有对应的真实源文件，无人 import）。
  // 留着当恢复对照用，但它们不是源码：跑规则只会产出 no-empty/no-var 之类噪音。
  { ignores: ['**/*.bundle.ts'] },
  tseslint.configs.recommended,
  eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: 'ts'
          }
        }
      ],
      // 存量代码库严格度调整：降级为 warn，消除 lint error 阻塞，保留可见性
      // 后续增量代码建议遵循（新增文件可单独启用 error 级）
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },
  eslintConfigPrettier
)
