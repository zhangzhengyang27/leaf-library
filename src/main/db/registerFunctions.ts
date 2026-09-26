/**
 * Leaf · 自定义 SQL 函数注册
 *
 * 颜色相似度这类感知度量没法用关系代数表达（CIEDE2000 有三角函数与分段权重），
 * 但又不该退回「整表捞回 JS 里逐行筛」——那等于放弃分页下推。
 * 注册成标量函数后它就是普通 WHERE 片段，分页/智能文件夹/保存筛选共用同一条路径。
 * D-023 起这里还注册 regexp()（SQLite 无原生 regexp，正则算子下推的唯一入口）。
 *
 * 生产连接（database.ts）与测试库（__tests__/testDb.ts）都要调用：
 * 只在一处注册的话，单测里的 color_close 会报 no such function。
 */
import type Database from 'better-sqlite3'
import { accuracyToMaxDelta, colorListCloseTo, parseColorList } from '@shared/colorMatch'

export function registerSqlFunctions(db: Database.Database): void {
  /**
   * color_close(dominant, palette_json, target_hex, accuracy) → 0/1
   * 命中条件：主色或色板里任一色与目标色的 ΔE2000 ≤ 准确度换算出的上限。
   * accuracy 走 Eagle 的方向（越大越严），映射单源在 accuracyToMaxDelta。
   */
  db.function(
    'color_close',
    (dominant: string | null, palette: string | null, target: string, accuracy: number) => {
      if (!target) return 0
      const colors = [...parseColorList(dominant), ...parseColorList(palette)]
      if (colors.length === 0) return 0
      return colorListCloseTo(colors, String(target), accuracyToMaxDelta(Number(accuracy))) ? 1 : 0
    }
  )

  // ── D-023 正则算子下推 ──
  // SQLite 无原生 regexp：注册后 `regexp(?, file_name)` 就是普通 WHERE 片段，
  // 分页/计数/与其他谓词的组合下推全部保留（JS 过滤路径在真实分页形态下慢 3–5 倍，
  // 基准数据见 docs/DECISIONS.md D-023 与 scripts/_probes/smart-album-regex-bench.mjs）。
  //
  // 安全面（与编辑器/引擎的分工）：
  // - 模式经**绑定参数**传入，无 SQL 注入面（用户正则里的 ( * \ 反斜杠都是数据不是 SQL）；
  // - 编译结果按模式串缓存（智能夹全表扫时同一模式只 new 一次；5 万行回调开销 ~0.2µs/行）；
  // - 非法模式这里返回 0（不命中）而不是抛穿 SQL 执行——明确报错是编译期
  //   checkRegexPattern（编辑器行内 + buildSmartAlbumWhere）的职责，此处只做纵深防御：
  //   手改 rules_json 绕过编译校验的路径不存在，但也不能靠「不存在」保证行为。
  const REGEX_CACHE_LIMIT = 100
  const regexCache = new Map<string, RegExp | null>()
  db.function('regexp', (pattern: unknown, value: unknown) => {
    if (typeof pattern !== 'string' || pattern === '') return 0
    let entry = regexCache.get(pattern)
    if (entry === undefined) {
      try {
        entry = new RegExp(pattern)
      } catch {
        entry = null
      }
      if (regexCache.size >= REGEX_CACHE_LIMIT) regexCache.clear()
      regexCache.set(pattern, entry)
    }
    if (entry === null) return 0
    try {
      // 无 flags 参数 → 无 g/y 状态问题；test 即部分匹配语义（Eagle 正则同口径）
      return typeof value === 'string' && entry.test(value) ? 1 : 0
    } catch {
      return 0
    }
  })
}
