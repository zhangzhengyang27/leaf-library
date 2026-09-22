/**
 * F8 剪贴板路径解析单测：file:// 解码 / 存在性过滤 / 去重 / 上限。
 */
import { describe, expect, it } from 'vitest'
import { extractPathsFromText } from '../clipboardPaths'

const ALL_EXIST = (): boolean => true
const NONE_EXIST = (): boolean => false

describe('extractPathsFromText', () => {
  it('解析裸绝对路径（多行）', () => {
    const out = extractPathsFromText('/tmp/a.png\n/tmp/b.jpg\n', ALL_EXIST)
    expect(out).toEqual(['/tmp/a.png', '/tmp/b.jpg'])
  })

  it('file:// URL 解码为本地路径', () => {
    const out = extractPathsFromText('file:///Users/me/%E7%85%A7%E7%89%87%20a.png', ALL_EXIST)
    expect(out).toEqual(['/Users/me/照片 a.png'])
  })

  it('不存在的路径被过滤', () => {
    const out = extractPathsFromText('/tmp/a.png\n/tmp/b.png', (p) => p === '/tmp/b.png')
    expect(out).toEqual(['/tmp/b.png'])
  })

  it('非路径文本（普通文字/相对路径/网址）不产生结果', () => {
    expect(extractPathsFromText('hello world\nrelative/path.png\nhttps://x.com/a.png', ALL_EXIST)).toEqual([])
  })

  it('去重', () => {
    const out = extractPathsFromText('/tmp/a.png\n/tmp/a.png\n /tmp/a.png ', ALL_EXIST)
    expect(out).toEqual(['/tmp/a.png'])
  })

  it('max 上限生效', () => {
    const text = Array.from({ length: 10 }, (_, i) => `/tmp/f${i}.png`).join('\n')
    expect(extractPathsFromText(text, ALL_EXIST, 3)).toHaveLength(3)
  })

  it('全部不存在时返回空数组', () => {
    expect(extractPathsFromText('/a\n/b', NONE_EXIST)).toEqual([])
  })
})
