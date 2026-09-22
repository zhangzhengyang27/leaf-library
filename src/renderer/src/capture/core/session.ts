/**
 * capture.html 的 hash 参数解析——主进程创建遮罩/贴图窗时把会话参数编进 hash，
 * 渲染层零 IPC 即可拿到显示器信息（纯函数，可单测）。
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CaptureSessionSpec {
  displayId: number
  /** display.bounds（屏绝对坐标，仅日志用；选区一律用 display 本地坐标） */
  bounds: Rect
  scale: number
  mode: 'region' | 'fullscreen' | 'last'
  /** 初始选区（display 本地逻辑坐标）：region 模式为 0 尺寸，fullscreen/last 为实际区域 */
  initial: Rect
  /** 上次截图区域（主进程内存传递，displayId 不同则调用方忽略） */
  last: { displayId: number; region: Rect } | null
}

function parseQuery(hash: string, prefix: '#select?' | '#pin?'): URLSearchParams | null {
  if (!hash.startsWith(prefix)) return null
  return new URLSearchParams(hash.slice(prefix.length))
}

export function parseCaptureHash(hash: string): CaptureSessionSpec | null {
  const q = parseQuery(hash, '#select?')
  if (!q) return null
  const num = (key: string): number => Number(q.get(key) ?? 0)
  const rect = (prefix: string): Rect => ({
    x: num(`${prefix}x`),
    y: num(`${prefix}y`),
    width: num(`${prefix}w`),
    height: num(`${prefix}h`)
  })
  const lastDisplayId = num('ldid')
  return {
    displayId: num('did'),
    bounds: rect('b'),
    scale: num('s') || 1,
    mode: (q.get('mode') as CaptureSessionSpec['mode']) ?? 'region',
    initial: rect('i'),
    last: lastDisplayId > 0 ? { displayId: lastDisplayId, region: rect('l') } : null
  }
}

export function parsePinHash(hash: string): string | null {
  const q = parseQuery(hash, '#pin?')
  return q?.get('pid') ?? null
}
