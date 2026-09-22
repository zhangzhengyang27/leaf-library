import { database } from '../db/database'

/**
 * GeoCoder — 反地理编码（城市级，六期）。
 *
 * 数据源 Nominatim（OSM）。用量政策（wiki.openstreetmap.org/wiki/Nominatim）：
 * - 必须带可联系到的 User-Agent
 * - 绝对 ≤1 req/s → 串行节流 1.1s
 * - 结果缓存：geo_cache 表（migration 017），坐标按 2 位小数（≈1.1km）量化，
 *   同格只请求一次；负结果也缓存（海外无人区不反复打）
 * 网络失败不写缓存，下次自动重试；离线一律返回 null（UI 静默降级为坐标展示）。
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'Leaf/1.0 (local desktop asset library)'

export interface CityInfo {
  city: string
  displayName: string
}

interface NominatimAddress {
  name?: string
  display_name?: string
  address?: {
    city?: string
    town?: string
    village?: string
    municipality?: string
    county?: string
    state?: string
  }
}

let lastRequestAt = 0

// 审查修复：检查-等待-更新非原子，并发 IPC 会同时放行违反 1 req/s 政策——
// 用 promise 链把所有排队者串行化，间隔计算在轮到自己时才做
let throttleChain: Promise<void> = Promise.resolve()

function throttled(): Promise<void> {
  const run = throttleChain.then(async () => {
    const wait = 1_100 - (Date.now() - lastRequestAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
  })
  throttleChain = run.catch(() => {}) // 链上不传播失败，后续请求照常排队
  return run
}

function getCached(key: string): CityInfo | null | undefined {
  try {
    const row = database.handle
      .prepare('SELECT city, display_name FROM geo_cache WHERE key = ?')
      .get(key) as { city: string | null; display_name: string | null } | undefined
    if (row === undefined) return undefined
    if (row.city === null) return null
    return { city: row.city, displayName: row.display_name ?? row.city }
  } catch {
    return undefined
  }
}

function putCache(key: string, info: CityInfo | null): void {
  try {
    database.handle
      .prepare(
        'INSERT OR REPLACE INTO geo_cache (key, city, display_name, cached_at) VALUES (?, ?, ?, ?)'
      )
      .run(key, info?.city ?? null, info?.displayName ?? null, Date.now())
  } catch {
    // 缓存写失败不影响主流程
  }
}

/** 城市级反地理编码；失败/离线返回 null */
export async function reverseGeocode(lat: number, lon: number): Promise<CityInfo | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`

  const cached = getCached(key)
  if (cached !== undefined) return cached

  try {
    await throttled()
    const url = `${NOMINATIM}?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&addressdetails=1&accept-language=zh`
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8_000)
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = (await resp.json()) as NominatimAddress
    const a = data.address ?? {}
    const city =
      a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? data.name ?? null
    const info: CityInfo | null = city ? { city, displayName: data.display_name ?? city } : null
    putCache(key, info)
    return info
  } catch {
    return null
  }
}
