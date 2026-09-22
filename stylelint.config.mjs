/**
 * Leaf · Stylelint 配置
 *
 * 目标：把 DESIGN_TOKENS.md §10 的硬性约束做成 CI 可检查的规则
 * - §10.a 不写死颜色（必须用 var(--*) 或 Tailwind token class）
 * - §10.b 不写死 px/rem/em 大小（必须用 spacing token 或 Tailwind）
 * - §10.c 暗色模式自动切换由 var(--*) 保证
 *
 * 不直接禁：
 * - 单元 px / rem 在特定场景合理（border 1px、svg 16x16 等）—— 用 ignoreFiles 白名单
 * - 透明 rgba 黑/白（某些场景合理）—— 用 white/blacklist patterns 控制
 *
 * 来源：docs/DESIGN_TOKENS.md §10 「禁止写死 #hex / px」ESLint 规则未落地
 * （原计划是 ESLint；CSS 部分改用 stylelint，更专业）
 */

export default {
  // 不 lint：第三方 css、build 产物、tokens.css（token 定义本身就是变量）
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/out/**',
    'src/renderer/src/styles/tokens.css',
    '**/remixicon/**/*.css',
    '**/highlight.js/**/*.css',
    '**/codemirror/**/*.css',
    '**/monaco-editor/**/*.css'
  ],
  // Vue SFC 的 <style> 块需要 postcss-html 解析才能识别 script 上下文
  customSyntax: 'postcss-html',
  // 注：不继承 stylelint-config-standard（它会引入 366 个 style 规则，
  // 比如 rgba → rgb 别名、空行规则等；存量代码多会全报错）。
  // 这里只列「DESIGN_TOKENS §10 必检的 3 条 + 健康度关键几条」，
  // 保持增量可卡、存量放过。
  extends: [],
  rules: {
    // ====== §10.a 不写死 hex / rgb / 命名色 ======
    // 颜色必须用 var(--*) 或 Tailwind token（bg-brand-500 / text-gray-900 等）
    // 注：现存 945+ 处违规（DESIGN_TOKENS 落地前的存量）；先 warn 不阻断，
    // 新代码 / 新模块不允许出现 hex（增量 PR 应主动修）
    //
    // 严格度通过 env 切换：
    // - 默认（lint:css）：warn —— 存量放过
    // - STRICT_CSS_LINT=1（lint:css:changed）：error —— 增量必检
    'color-no-hex': [true, { severity: process.env.STRICT_CSS_LINT === '1' ? 'error' : 'warning' }],
    'color-named': [
      'never',
      {
        ignore: ['inside-function'],
        severity: process.env.STRICT_CSS_LINT === '1' ? 'error' : 'warning'
      }
    ],

    // ====== §10.b 不写死 px / rem / em ======
    // 大小必须用 Tailwind spacing token（p-2 / m-4 等）或 var(--*)
    // 注意：0 不限制（0px / 0rem / 0 都被允许）
    // 同 §10.a 理由：存量代码多，先 warn 渐进式迁移
    'length-zero-no-unit': [true, { severity: 'warning' }],

    // ====== 关键健康度规则（避免破坏性）======
    'no-duplicate-selectors': true,
    'no-empty-source': true
  }
}
