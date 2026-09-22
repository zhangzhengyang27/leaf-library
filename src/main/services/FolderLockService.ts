/**
 * Leaf · 文件夹密码锁（D-012 二轮 R4，对齐 Eagle 文件夹「密码保护」）
 *
 * 口令经 safeStorage 加密后存 photo_folders.password（m004），不存明文。
 * safeStorage 不可用时明确报错，不静默降级为明文存储（与 PhotosLockService 一致）。
 */
import { safeStorage } from 'electron'
import { photoFolderRepository } from '../db/repos'

export function folderHasPassword(folderId: string): boolean {
  return photoFolderRepository.getPassword(folderId) != null
}

export function setFolderPassword(
  folderId: string,
  password: string,
  oldPassword?: string
): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前环境无法安全加密（safeStorage 不可用）')
  }
  // 已设密码时修改必须先验证旧密码（审查 P2-4）：否则被利用的 renderer 可静默重置锁
  if (folderHasPassword(folderId) && !verifyFolderPassword(folderId, oldPassword ?? '')) {
    throw new Error('修改密码需先验证当前密码')
  }
  photoFolderRepository.setPassword(
    folderId,
    safeStorage.encryptString(password).toString('base64')
  )
}

export function removeFolderPassword(folderId: string, password: string): boolean {
  if (!verifyFolderPassword(folderId, password)) return false
  photoFolderRepository.setPassword(folderId, null)
  return true
}

export function verifyFolderPassword(folderId: string, password: string): boolean {
  const raw = photoFolderRepository.getPassword(folderId)
  if (!raw) return true
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64')) === password
  } catch {
    return false
  }
}
