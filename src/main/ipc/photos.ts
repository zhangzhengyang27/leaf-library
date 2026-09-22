  lockSetPassword,
  lockVerify
} from '../services/PhotosLockService'

// ── 目录递归收集（getFilesFromFolder / importPaths 拖拽目录分流共用）──
const SCAN_LIMIT = 5000
const JUNK = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '__macosx'])
const isJunk = (name: string): boolean => {
  const lower = name.toLowerCase()
  return lower.startsWith('.') || JUNK.has(lower) || lower.startsWith('~$')
}
const isBundleDir = (name: string): boolean =>
  ['.app', '.framework', '.bundle', '.kext', '.plugin'].some((suffix) =>
    name.toLowerCase().endsWith(suffix)
  )

/** 递归收集目录下的普通文件（异步 readdir，不阻塞主进程；软链跳过防环，
 *  .app 等应用包按单个文件项收集）。超 SCAN_LIMIT 截断并如实返回 truncated。 */
async function collectDirectoryFiles(
  root: string
): Promise<{ files: string[]; truncated: boolean; failedDirs: number }> {
  const files: string[] = []
  let truncated = false
  let failedDirs = 0
  const MAX_DEPTH = 16
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (files.length >= SCAN_LIMIT) {
      truncated = true
      return
    }
    let items: import('fs').Dirent[]
    try {
      items = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      failedDirs += 1
      return
    }
    for (const item of items) {
      if (files.length >= SCAN_LIMIT) {
        truncated = true
        return
      }
      if (isJunk(item.name)) continue
      const full = join(dir, item.name)
      if (item.isSymbolicLink()) continue
      if (item.isDirectory()) {
        if (isBundleDir(item.name)) {
          files.push(full)
          continue
        }
        if (depth < MAX_DEPTH) await walk(full, depth + 1)
      } else if (item.isFile()) {
        files.push(full)
      }
    }
  }
  await walk(root, 0)
  return { files, truncated, failedDirs }
}

export function registerPhotoIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  photoStore: PhotoDataStore,
  getAssetProcessing: () => AssetProcessingService | null
): void {
  // 直接映射到数据存储的方法
  registerPrefixedHandlers('photos', {
    getAll: () => photoStore.getPhotos(),
    // —— 六期：书签收集 / 反地理编码 / 素材库密码锁 ——
    addBookmark: (url: string, title?: string) => addBookmarkService(url, title),
    reverseGeocode: (lat: number, lon: number) => reverseGeocodeService(lat, lon),
    lockIsEnabled: () => lockIsEnabled(),
