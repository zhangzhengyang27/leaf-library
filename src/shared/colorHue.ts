/**
 * Leaf · 主色 → 色相桶（shared：主进程构建筛选 WHERE 与渲染层共用同一实现）
 *
 * 图片处理管线把主色存为 color_dominant（#rrggbb），
 * 归入 9 个色相桶之一（Eagle/Picsee 颜色面板的简化版）。
 * 分页化阶段 3 起色相桶持久化到 photo_photos.color_hue（m016），筛选下推 SQL。
 */

export type HueBucket =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'gray'

export const HUE_BUCKETS: Array<{ key: HueBucket; label: string; css: string }> = [
  // 七轮：色值对齐 Eagle 标签圆点实测（app.asar style_*.css .color-* tag-circle）
  { key: 'red', label: '红色', css: '#FF6667' },
  { key: 'orange', label: '橙色', css: '#FFAA33' },
  { key: 'yellow', label: '黄色', css: '#F2D918' },
  { key: 'green', label: '绿色', css: '#7EE517' },
  { key: 'cyan', label: '青色', css: '#30F2D2' },
  { key: 'blue', label: '蓝色', css: '#1ABAFF' },
  { key: 'purple', label: '紫色', css: '#DAA6FF' },
  { key: 'pink', label: '粉色', css: '#FF99DD' },
  { key: 'gray', label: '灰阶', css: '#BDBEC0' }
]

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

/** 主色归入色相桶；无法解析时归入灰阶 */
export function hueBucketOf(hex: string | undefined | null): HueBucket {
  const rgb = hex ? hexToRgb(hex) : null
  if (!rgb) return 'gray'
  const { r, g, b } = rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2 / 255
  const d = max - min
  const s = max === 0 ? 0 : d / max

  // 近黑/近白/低饱和（相对饱和度 < 15%）→ 灰阶
  if (d < 12 || s < 0.15 || l < 0.08 || l > 0.94) return 'gray'

  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360

  if (h < 15 || h >= 345) return 'red'
  if (h < 45) return 'orange'
  if (h < 70) return 'yellow'
  if (h < 160) return 'green'
  if (h < 200) return 'cyan'
  if (h < 255) return 'blue'
  if (h < 290) return 'purple'
  return 'pink'
}

/** 小写扩展名（无扩展名 = ''）——m016 file_ext 列的取值函数（导入/迁移共用） */
export function extOfFileName(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : ''
}
