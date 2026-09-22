/**
 * 外网请求安全（代码审查 P0-3/P0-4）
 *
 * 书签截图（BookmarkService）与剪藏下载（ClipServer）都会用用户/扩展提供的 URL
 * 发起本机请求，若无校验即构成 SSRF：可打到云元数据（169.254.169.254）、
 * 内网服务，甚至同机的 ClipServer（127.0.0.1）与 MCP 写接口。
 *
 * 本模块统一提供「目标地址是否属于应封锁的私有/回环/链路本地段」判定。
 *
 * 已知局限：DNS rebinding（校验时解析到公网 IP，实际连接时解析到内网）无法靠
 * 单次 lookup 根除，需配合「校验后直连已解析 IP」或连接前后二次校验；当前实现
 * 可挡住绝大多数直接指向内网地址的攻击。
 */
import { lookup } from 'dns/promises'
import { isIP } from 'net'

/** IPv4 私有/回环/链路本地/CGNAT/保留段判定 */
function ipv4Blocked(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local / 云元数据
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // 组播 + 保留
  return false
}

function ipv6Blocked(ip: string): boolean {
  const v = ip.toLowerCase().split('%')[0]
  if (v === '::' || v === '::1') return true
  if (v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true
  // IPv4-mapped（::ffff:127.0.0.1）
  if (v.startsWith('::ffff:')) return ipv4Blocked(v.slice(7))
  return false
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return ipv4Blocked(ip)
  if (family === 6) return ipv6Blocked(ip)
  return true
}

/** 仅回环段判定（127.0.0.1 / ::1 / IPv4-mapped 回环） */
function isLoopback(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length === 4 && parts[0] === 127) return true
  const v = ip.toLowerCase().split('%')[0]
  if (v === '::1') return true
  if (v.startsWith('::ffff:127.')) return true
  return false
}

/**
 * 校验 URL 可安全发起外网请求：协议限 http(s)，且解析后的 IP 不在封锁段内。
 * 失败抛 Error（调用方负责转成用户可见提示）。
 *
 * opts.allowLoopback（审查修复）：仅放行回环目标（127.0.0.1/::1），其余
 * 私网/链路本地段依旧封锁。仅用于「请求已通过 token 鉴权」的 ClipServer
 * 剪藏下载——本地/内网图片剪藏是合法场景，且调用方已持 token（与设置页
 * 同级信任）；书签抓取等无鉴权语义的路径仍保持全段封锁。
 */
export async function assertPublicUrl(
  rawUrl: string,
  opts?: { allowLoopback?: boolean }
): Promise<void> {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error('无效的 URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`不支持的协议：${u.protocol}`)
  }
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const family = isIP(host)
  if (family !== 0) {
    if (isBlockedAddress(host)) {
      if (opts?.allowLoopback && isLoopback(host)) return
      throw new Error('目标地址为内网/本机地址，已拒绝')
    }
    return
  }
  try {
    const { address } = await lookup(host)
    if (isBlockedAddress(address)) {
      if (opts?.allowLoopback && isLoopback(address)) return
      throw new Error('目标地址解析到内网/本机地址，已拒绝')
    }
  } catch (err) {
    // 上层已判定为内网时原样抛出；DNS 失败单独提示
    if ((err as Error).message.includes('已拒绝')) throw err
    throw new Error(`域名解析失败：${host}`)
  }
}
