/**
 * Leaf · 颜色相似度（shared：主进程 SQL UDF 与渲染层取色面板共用同一实现）
 *
 * Eagle 的颜色档不是「9 个色相桶精确相等」，而是从色板里取一个色 + 准确度滑杆做
 * 感知色差匹配（它用的是 delta-e 对 palettes[{color,ratio}]）。这里补同一形态：
 * 色相桶走 color_hue 等值（快路径），相似度走 color_close() UDF（见 database.ts）。
 *
 * 色差用 CIEDE2000 而不是 CIE76：76 在蓝区把人眼看不出的差值算得很大、
 * 在中低饱和区又把看得出的差值算小，桶匹配会明显偏。
 */

import { hexToRgb } from './colorHue'

export interface Lab {
  L: number
  a: number
  b: number
}

const toRad = (deg: number): number => (deg * Math.PI) / 180
const toDeg = (rad: number): number => (rad * 180) / Math.PI

/** sRGB(0-255) → CIE Lab（D65） */
export function rgbToLab(r: number, g: number, b: number): Lab {
  // sRGB 逆压缩 → 线性 → XYZ(D65)
  const lin = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883

  // XYZ → Lab（D65 白点归一后 f(t) 分段）
  const f = (t: number): number => (t > 0.008856451679 ? Math.cbrt(t) : 7.787037037 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

/** #rrggbb（可省 #）→ Lab；解析不出返回 null */
export function hexToLab(hex: string | null | undefined): Lab | null {
  const rgb = hex ? hexToRgb(hex) : null
  return rgb ? rgbToLab(rgb.r, rgb.g, rgb.b) : null
}

/**
 * CIEDE2000 色差。常数按原论文（Sharma et al. 2005），kL=kC=kH=1。
 * 参考实现自测用例见 colorMatch.test.ts（同一组期望值来自论文附表）。
 */
export function deltaE2000(l1: Lab, l2: Lab): number {
  const avgL = (l1.L + l2.L) / 2
  const c1 = Math.hypot(l1.a, l1.b)
  const c2 = Math.hypot(l2.a, l2.b)
  const avgC = (c1 + c2) / 2
  const g7 = Math.pow(avgC, 7)
  const G = 0.5 * (1 - Math.sqrt(g7 / (g7 + 6103515625))) // 25^7
  const a1p = (1 + G) * l1.a
  const a2p = (1 + G) * l2.a
  const c1p = Math.hypot(a1p, l1.b)
  const c2p = Math.hypot(a2p, l2.b)
  const avgCp = (c1p + c2p) / 2

  const h1p = l1.b === 0 && a1p === 0 ? 0 : (toDeg(Math.atan2(l1.b, a1p)) + 360) % 360
  const h2p = l2.b === 0 && a2p === 0 ? 0 : (toDeg(Math.atan2(l2.b, a2p)) + 360) % 360
  // 论文的两个退化分支：任一侧彩度为 0 时色相无定义——
  // Δh' 取 0（否则 atan2 出来的 190° 差值会凭空造出一个色相差），
  // H̄' 取 h1'+h2' 而不是均值（它决定 T 与 RT，均值会把中性对算偏）
  const neutralPair = c1p * c2p === 0
  const dhp = neutralPair
    ? 0
    : Math.abs(h1p - h2p) <= 180
      ? h2p - h1p
      : h2p > h1p
        ? h2p - h1p - 360
        : h2p - h1p + 360
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(toRad(dhp / 2))
  let avgHp = (h1p + h2p) / 2
  if (neutralPair) avgHp = h1p + h2p
  else if (Math.abs(h1p - h2p) > 180) avgHp += avgHp < 180 ? 180 : -180

  const T =
    1 -
    0.17 * Math.cos(toRad(avgHp - 30)) +
    0.24 * Math.cos(toRad(2 * avgHp)) +
    0.32 * Math.cos(toRad(3 * avgHp + 6)) -
    0.2 * Math.cos(toRad(4 * avgHp - 63))
  const dLp = l2.L - l1.L
  const dCp = c2p - c1p
  const sl = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2))
  const sc = 1 + 0.045 * avgCp
  const sh = 1 + 0.015 * avgCp * T
  const avgCp7 = Math.pow(avgCp, 7)
  const rt =
    -2 *
    Math.sqrt(avgCp7 / (avgCp7 + 6103515625)) *
    Math.sin(toRad(60 * Math.exp(-Math.pow((avgHp - 275) / 25, 2))))
  return Math.sqrt(
    Math.pow(dLp / sl, 2) +
      Math.pow(dCp / sc, 2) +
      Math.pow(dHp / sh, 2) +
      rt * (dCp / sc) * (dHp / sh)
  )
}

/**
 * 准确度滑杆 → ΔE2000 上限。
 * Eagle 的「准确度」是反的（越大越严），量程 5–40：这里映成 ΔE ≤ 45 − 准确度，
 * 即准确度 40 ≈ 只要近乎同色，准确度 5 ≈ 允许很宽的色相漂移。
 */
export function accuracyToMaxDelta(accuracy: number): number {
  const a = Math.min(Math.max(Number(accuracy) || 0, 5), 40)
  return 45 - a
}

/** 解析 color_close 的候选串：palette 的 JSON 数组、裸 hex、或两者混合 */
export function parseColorList(raw: string | null | undefined): string[] {
  if (!raw) return []
  const t = raw.trim()
  if (t.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(t)
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  return [t]
}

/**
 * 候选色集里是否存在与 target 感知色差 ≤ maxDelta 的色。
 * target 解析失败时返回 false（不放宽成「全都算命中」）。
 */
export function colorListCloseTo(colors: string[], targetHex: string, maxDelta: number): boolean {
  const target = hexToLab(targetHex)
  if (!target) return false
  for (const c of colors) {
    const lab = hexToLab(c)
    if (lab && deltaE2000(lab, target) <= maxDelta) return true
  }
  return false
}
