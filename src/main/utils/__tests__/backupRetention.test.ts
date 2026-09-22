/**
 * F16 备份保留策略单测。
 */
import { describe, expect, it } from 'vitest'
import { selectBackupsToDelete, type BackupFileInfo } from '../backupRetention'

const mk = (name: string, mtimeMs: number): BackupFileInfo => ({ name, mtimeMs })

describe('selectBackupsToDelete', () => {
  it('按 mtime 降序保留前 keep 份，其余删除（删除列表按新→旧序）', () => {
    const files = [mk('a', 100), mk('c', 300), mk('b', 200)]
    expect(selectBackupsToDelete(files, 2)).toEqual(['a'])
    expect(selectBackupsToDelete(files, 1)).toEqual(['b', 'a'])
  })

  it('keep >= 数量时不删除任何文件', () => {
    const files = [mk('a', 1), mk('b', 2)]
    expect(selectBackupsToDelete(files, 5)).toEqual([])
  })

  it('keep=0 全删', () => {
    expect(selectBackupsToDelete([mk('a', 1)], 0)).toEqual(['a'])
  })

  it('空列表安全', () => {
    expect(selectBackupsToDelete([], 3)).toEqual([])
  })
})
