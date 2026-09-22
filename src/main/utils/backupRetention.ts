/**
 * F16：备份保留策略（纯函数）。
 *
 * 按 mtime 降序保留前 keep 份，其余删除。mtime 缺失视为最旧。
 */
export interface BackupFileInfo {
  name: string
  mtimeMs: number
}

export function selectBackupsToDelete(files: BackupFileInfo[], keep: number): string[] {
  if (keep <= 0) return files.map((f) => f.name)
  const sorted = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs)
  return sorted.slice(keep).map((f) => f.name)
}
