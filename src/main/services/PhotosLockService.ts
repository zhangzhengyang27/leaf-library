import { safeStorage } from 'electron'
import { prefRepository } from '../db/repos/PrefRepository'

/**
 * PhotosLockService — 素材库密码锁（六期）。
 *
 * 口令经 safeStorage（macOS Keychain / Windows DPAPI / Linux libsecret）加密后存
 * pref_preferences，不存明文、不存哈希——校验即解密比对。
 * safeStorage 不可用（无 Keychain 等环境）时明确报错，不静默降级为明文存储。
 * 上锁范围是素材库视图（渲染层锁屏），素材文件本身不加密（与 Eagle 行为一致）。
 */

const KEY = 'photos.lock.password.v1'

/** verify 失败退避（审查 P2-4）：主进程侧防暴力破解，内存计数即可 */
const verifyAttempts = { fails: 0, blockedUntil: 0 }
const VERIFY_MAX_FAILS = 5
const VERIFY_BACKOFF_MS = 30_000

/** 是否已启用锁 */
export function lockIsEnabled(): boolean {
  return prefRepository.get(KEY) != null
}

/** 设置/修改口令。主进程侧强制：已设密码时必须先 verify 旧密码（审查 P2-4） */
export function lockSetPassword(password: string, oldPassword?: string): void {
  if (!password) throw new Error('密码不能为空')
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统不支持安全存储（Keychain/DPAPI），无法启用密码锁')
  }
  if (lockIsEnabled() && !lockVerify(oldPassword ?? '')) {
    throw new Error('修改密码需先验证当前密码')
  }
  prefRepository.set(KEY, safeStorage.encryptString(password).toString('base64'))
}

/** 校验；未启用锁时恒为 true（无需解锁）。连续失败进入退避（审查 P2-4） */
export function lockVerify(password: string): boolean {
  const raw = prefRepository.get(KEY)
  if (raw == null) return true
  if (verifyAttempts.blockedUntil > Date.now()) return false
  let ok = false
  try {
    ok = safeStorage.decryptString(Buffer.from(raw, 'base64')) === password
  } catch {
    ok = false
  }
  if (!ok) {
    verifyAttempts.fails += 1
    if (verifyAttempts.fails >= VERIFY_MAX_FAILS) {
      verifyAttempts.blockedUntil = Date.now() + VERIFY_BACKOFF_MS
      verifyAttempts.fails = 0
    }
  } else {
    verifyAttempts.fails = 0
    verifyAttempts.blockedUntil = 0
  }
  return ok
}

/** 关闭锁（需验旧口令） */
export function lockClear(password: string): boolean {
  if (!lockVerify(password)) return false
  prefRepository.delete(KEY)
  return true
}
