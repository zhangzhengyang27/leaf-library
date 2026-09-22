/**
 * F2 批量重命名模板引擎单测：token 展开 / 补零 / 合法化 / 兜底。
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderRenameBase, stripExt } from '../renamePattern'

const BASE_CTX = {
  fileName: 'IMG_1234.jpg',
  folderName: '旅行',
  importedAt: new Date(2026, 8, 16, 9, 5, 3).getTime(), // 本地 2026-09-16 09:05:03
  index: 1,
  pad: 3
}

describe('stripExt', () => {
  it('去扩展名；无扩展名返回原名', () => {
    expect(stripExt('a.b.c.png')).toBe('a.b.c')
    expect(stripExt('noext')).toBe('noext')
    // 点开头是隐藏文件名（.gitignore），不算扩展名
    expect(stripExt('.gitignore')).toBe('.gitignore')
  })
})

describe('renderRenameBase token', () => {
  it('{name} = 原文件名去扩展名', () => {
    expect(renderRenameBase('{name}', BASE_CTX)).toBe('IMG_1234')
  })

  it('{n} 按 index + pad 补零', () => {
    expect(renderRenameBase('{n}', BASE_CTX)).toBe('001')
    expect(renderRenameBase('{n}', { ...BASE_CTX, index: 12, pad: 4 })).toBe('0012')
    expect(renderRenameBase('{n}', { ...BASE_CTX, pad: undefined as unknown as number })).toBe('1')
  })

  it('{date} = 本地 YYYYMMDD', () => {
    expect(renderRenameBase('{date}', BASE_CTX)).toBe('20260916')
  })

  it('{time} = 本地 HHmmss', () => {
    expect(renderRenameBase('{time}', BASE_CTX)).toBe('090503')
  })

  it('{parent} = 文件夹名；空回退「未分类」', () => {
    expect(renderRenameBase('{parent}', BASE_CTX)).toBe('旅行')
    expect(renderRenameBase('{parent}', { ...BASE_CTX, folderName: '  ' })).toBe('未分类')
    expect(renderRenameBase('{parent}', { ...BASE_CTX, folderName: undefined })).toBe('未分类')
  })

  it('{rand} = 6 位小写字母数字', () => {
    const out = renderRenameBase('{rand}', BASE_CTX)
    expect(out).toMatch(/^[a-z0-9]{6}$/)
  })

  it('未识别 token 保持字面量', () => {
    expect(renderRenameBase('{x}{n}', BASE_CTX)).toBe('{x}001')
  })

  it('组合：{name}-{date}-{n}', () => {
    expect(renderRenameBase('{name}-{date}-{n}', BASE_CTX)).toBe('IMG_1234-20260916-001')
  })

  it('非法字符替换为 -', () => {
    expect(renderRenameBase('a<b>c:d', BASE_CTX)).toBe('a-b-c-d')
    expect(renderRenameBase('照片/1:name', BASE_CTX)).toBe('照片-1-name')
  })

  it('结果为空时回退原文件名主干', () => {
    expect(renderRenameBase('   ', BASE_CTX)).toBe('IMG_1234')
  })

  it('扩展名不参与渲染（由主进程保留）', () => {
    expect(renderRenameBase('{name}-v2', { ...BASE_CTX, fileName: 'logo.jpeg' })).toBe('logo-v2')
  })
})
