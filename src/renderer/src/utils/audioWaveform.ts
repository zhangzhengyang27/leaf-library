/**
 * 音频波形的纯计算（ canvas 之外都可测，happy-dom 没有 2D 上下文，故渲染留组件里）
 *
 * 库里 2,328 条音频入库时已经算好波形（迁移 024，400 个峰值 0–255），这里只做两件事：
 * 把 400 个峰值映射到画布的像素列、以及把指针位置换算成播放进度。两者都有会静默出错
 * 的边界（宽度 0 除出 NaN 会把 currentTime 弄坏；降采样用均值会把鼓点抹平），所以抽出来。
 */

/**
 * 指针 → 进度 [0,1]。
 *
 * `width <= 0` 必须返回 0 而不是除一下：折叠面板 / display:none 时 getBoundingClientRect
 * 宽度是 0，除完得 NaN，`audio.currentTime = NaN * duration` 会让元素进入坏状态。
 */
export function seekRatioFromPointer(
  left: number,
  width: number,
  clientX: number
): number {
  if (!(width > 0)) return 0
  const r = (clientX - left) / width
  return r < 0 ? 0 : r > 1 ? 1 : r
}

/**
 * 把 `peaks`（0–255）重采样成 `columns` 列、每列 0–1。
 *
 * 降采样（peaks 比列多）取**区间最大值**，不是平均：波形是包络，平均会把 3 个采样里
 * 唯一的峰抹掉，听感上"这里有一记鼓"而图上看不出来。升采样取最近列（没有信息可插）。
 */
export function columnPeaks(
  peaks: ArrayLike<number> | null | undefined,
  columns: number
): number[] {
  const n = peaks?.length ?? 0
  const cols = Math.max(0, Math.floor(columns))
  const out = new Array<number>(cols)
  if (n === 0 || cols === 0) return out
  for (let c = 0; c < cols; c++) {
    const a = Math.floor((c * n) / cols)
    const b = Math.max(a + 1, Math.floor(((c + 1) * n) / cols))
    let m = 0
    for (let i = a; i < b && i < n; i++) if (peaks![i] > m) m = peaks![i]
    out[c] = m / 255
  }
  return out
}
