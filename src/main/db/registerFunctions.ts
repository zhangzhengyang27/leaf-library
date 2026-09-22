/**
 * Leaf · 自定义 SQL 函数注册
 *
 * 颜色相似度这类感知度量没法用关系代数表达（CIEDE2000 有三角函数与分段权重），
 * 但又不该退回「整表捞回 JS 里逐行筛」——那等于放弃分页下推。
 * 注册成标量函数后它就是普通 WHERE 片段，分页/智能文件夹/保存筛选共用同一条路径。
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
}
