import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'scripts/**', 'extension/**', 'native/**', 'src/main/db/migrations/**'] }, // migrations：历史 DDL 原样保留，格式化搅动会污染 diff // extension/：浏览器扩展独立产物，chrome 全局/JS 运行时不适用应用 TS 规则集 // native/：N-API 原生 addon（CommonJS require 合法）
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
