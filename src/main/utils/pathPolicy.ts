/**
 * 路径白名单策略（安全加固）：渲染层传入的「打开/显示」类路径必须属于
 * - userData / 应用安装目录
 * - 已登记资源库根目录
 * - 已入库素材路径（引用模式的素材可在库外任意位置）
 *
 * 防渲染层 XSS 借 shell.openPath（=可执行）/ showItemInFolder 触达磁盘任意位置。
 */
import { app } from 'electron'
import { isAbsolute, relative } from 'node:path'
import { listLibraries } from '../modules/libraryRegistry'
import { photoRepository } from '../db/repos'
import { log } from '../services/LogService'

/** child 是否位于 parent 目录内（或就是 parent 本身） */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function isOpenPathAllowed(p: string): boolean {
  try {
    if (isInside(p, app.getPath('userData')) || isInside(p, app.getAppPath())) return true
    for (const lib of listLibraries()) {
      if (isInside(p, lib.path)) return true
    }
    // 必须用含软删行的判定：回收站素材（引用模式下文件在库外）仍允许
    // 「在访达中打开」——getPhotoByPath 会把它们漏掉
    if (photoRepository.hasPhotoByPath(p)) return true
  } catch (e) {
    log.warn('system', `openPath allowlist check failed: ${(e as Error).message}`)
  }
  return false
}

// ── 目录扫描白名单（审查 P2-2）──
// getFilesFromFolder / watched:add 这类「递归枚举目录」入口接受的路径必须是
// 用户在主进程对话框里选过的（本会话内）或已登记库根，防被利用的 renderer
// 借扫描接口枚举任意目录文件清单。
const sessionScanDirs = new Set<string>()

/** 主进程对话框返回目录后登记（photos:selectFolder 等） */
export function grantScanDir(dir: string): void {
  if (dir) sessionScanDirs.add(dir)
}

export function isScanDirAllowed(dir: string): boolean {
  try {
    if (sessionScanDirs.has(dir)) return true
    if (isInside(dir, app.getPath('userData'))) return true
    for (const lib of listLibraries()) {
      if (isInside(dir, lib.path)) return true
    }
  } catch (e) {
    log.warn('system', `scanDir allowlist check failed: ${(e as Error).message}`)
  }
  return false
}

// ── 应用包（macOS bundle）识别 ──
// 目录扫描把 .app 等包按「单个素材项」收集（不进包内枚举），而入库守卫只放
// 普通文件——两处规则必须同源，否则扫出来的 bundle 会被守卫静默丢掉。
const BUNDLE_DIR_SUFFIXES = ['.app', '.framework', '.bundle', '.kext', '.plugin']

/** 路径最后一段是否应用包目录 */
export function isBundlePath(p: string): boolean {
  const segs = p.split(/[\\/]/).filter(Boolean)
  const base = (segs[segs.length - 1] ?? '').toLowerCase()
  return BUNDLE_DIR_SUFFIXES.some((suffix) => base.endsWith(suffix))
}

// ── 敏感文件导入黑名单 ──
// 入库接口（importPaths/addMultiple/add）本身接受渲染层传来的任意路径——这是
// 拖拽/粘贴导入的固有信任模型（与 Eagle 一致）。但它同时构成「先入库、再经
// image://rawfile:// 协议读内容」的绕过链（协议白名单只校验“已入库素材”）。
// 无法在主进程区分真实用户手势与被利用的 renderer 调用，因此按内容敏感度
// 兜底：已知凭据/私钥类文件拒绝入库，读取链对这些文件不再成立。
const SENSITIVE_BASENAMES = new Set([
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'netrc',
  '.netrc',
  'env',
  '.env',
  'credentials',
  'secure-note'
])
const SENSITIVE_EXTS = new Set(['env', 'pem', 'p12', 'pfx', 'jks', 'keystore', 'kdbx'])
const SENSITIVE_DIR_SEGMENTS = new Set(['.ssh', '.gnupg', '.aws', '.kube', '.docker'])
// 单段判据漏得的凭据位：~/.config/gh/hosts.yml 存 GitHub token，而 .yml 在
// readTextFile 的文本扩展名集里——「入库再读回」对它就是通的
const SENSITIVE_DIR_PAIRS: Array<[string, string]> = [
  ['.config', 'gh'],
  ['.config', 'gcloud']
]

/** 是否属于凭据/私钥类敏感文件（拒绝导入；.pub 公钥放行） */
export function isSensitiveImportPath(p: string): boolean {
  const segs = p.split(/[\\/]/).filter(Boolean)
  const lowerSegs = segs.map((s) => s.toLowerCase())
  if (lowerSegs.some((s) => SENSITIVE_DIR_SEGMENTS.has(s))) return true
  for (const [parent, child] of SENSITIVE_DIR_PAIRS) {
    const i = lowerSegs.indexOf(parent)
    if (i >= 0 && lowerSegs[i + 1] === child) return true
  }
  const base = segs[segs.length - 1] ?? ''
  const lower = base.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot > 0 ? lower.slice(dot + 1) : ''
  if (ext === 'pub') return false
  if (SENSITIVE_EXTS.has(ext)) return true
  const stem = dot > 0 ? lower.slice(0, dot) : lower
  return SENSITIVE_BASENAMES.has(lower) || SENSITIVE_BASENAMES.has(stem)
}
