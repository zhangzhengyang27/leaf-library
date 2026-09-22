/**
 * F18 ZIP 浏览纯函数单测：路径安全过滤。
 */
import { describe, expect, it } from 'vitest'
import { zipEntryPathSafe } from '../zipBrowse'

describe('zipEntryPathSafe', () => {
  it('正常相对路径通过', () => {
    expect(zipEntryPathSafe('images/a.png')).toBe(true)
    expect(zipEntryPathSafe('a.png')).toBe(true)
    expect(zipEntryPathSafe('deep/dir/file.txt')).toBe(true)
  })

  it('拒绝绝对路径与盘符', () => {
    expect(zipEntryPathSafe('/etc/passwd')).toBe(false)
    expect(zipEntryPathSafe('C:/windows/x.png')).toBe(false)
  })

  it('拒绝 .. 穿越', () => {
    expect(zipEntryPathSafe('../secrets.txt')).toBe(false)
    expect(zipEntryPathSafe('a/../../b.png')).toBe(false)
    expect(zipEntryPathSafe('a/..b/c.png')).toBe(true) // "..b" 是普通目录名
  })

  it('拒绝反斜杠与空名', () => {
    expect(zipEntryPathSafe('a\\b.png')).toBe(false)
    expect(zipEntryPathSafe('')).toBe(false)
  })
})
