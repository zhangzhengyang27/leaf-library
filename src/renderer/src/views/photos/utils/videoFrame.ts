/**
 * 视频逐帧步进的算术（纯函数，便于单测）。
 *
 * 单独拎出来是因为 PhotoPreview.vue 里这两行曾硬编码 `1/30`：24fps 素材一次跳
 * 1.25 帧、60fps 一次跳半帧，按钮上写着「前进一帧」但挪的不是一个帧。
 */

/** 库里没探到帧率时的回落值（与旧行为一致，不至于把步进变成 1 秒） */
export const FALLBACK_FPS = 30

/** 一帧多长（秒）。fps 缺失/为 0/NaN 一律回落到 30 */
export function frameSeconds(fps?: number): number {
  const f = typeof fps === 'number' && Number.isFinite(fps) && fps > 0 ? fps : FALLBACK_FPS
  return 1 / f
}

/**
 * 步进后的时间点：夹在 [0, duration] 里。
 * duration 未知（元数据还没到，为 NaN）时不加上界，否则会把时间挪成 NaN。
 */
export function stepTime(
  current: number,
  duration: number,
  direction: 1 | -1,
  fps?: number
): number {
  const next = current + direction * frameSeconds(fps)
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, next)
  return Math.min(Math.max(0, next), duration)
}
