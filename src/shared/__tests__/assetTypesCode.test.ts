/**
 * 代码类素材的四条闸（预览 / 索引 / kind / 待抽取清单）
 *
 * 这四条必须分开：isTextFile 决定"能不能按文本预览"（宽），isDocTextFile 决定
 * "正文进不进全文索引"（窄，只收人写的），kindOfExt 决定类型筛选维度（**不收代码**，
 * 否则同一扩展名在旧素材='file'、新素材='text' 之间分叉），
 * 而 listDocTextPending 的 SQL 只能按扩展名粗筛（比 isDocTextFile 宽）。
 * 四条口径一旦有人"顺手统一"，界面就会出现要么代码没预览、要么 d.ts 淹了搜索结果。
 */
import { describe, it, expect } from 'vitest'
import {
  CODE_EXTENSIONS,
  DOC_TEXT_QUERY_EXTENSIONS,
  isDocTextFile,
  isIndexableCodeFile,
  isTextFile,
  kindOfExt
} from '../assetTypes'

describe('预览闸（isTextFile）', () => {
  it('代码与原有文本都算可预览文本', () => {
    for (const f of ['a.js', 'b.d.ts', 'c.sh', 'd.css', 'e.toml', 'notes.txt', 'readme.md'])
      expect(isTextFile(f)).toBe(true)
  })

  it('二进制/图片类不是文本（svg 归图片，不按代码预览）', () => {
    for (const f of ['a.png', 'b.zip', 'c.mp4', 'd.woff2', 'icon.svg'])
      expect(isTextFile(f)).toBe(false)
    expect(isTextFile('LICENSE')).toBe(false)
  })
})

describe('索引闸（isIndexableCodeFile / isDocTextFile）', () => {
  it('手写代码进索引', () => {
    for (const f of ['module.js', 'useFoo.ts', 'app.sh', 'theme.css', 'schema.sql'])
      expect(isIndexableCodeFile(f)).toBe(true)
    expect(isDocTextFile('module.js')).toBe(true)
  })

  it('机器产物不进索引：d.ts / d.mts / min / bundle', () => {
    for (const f of [
      'lib.dom.d.ts',
      'index.d.mts',
      'vendor.min.js',
      'app.bundle.js',
      'reset.min.css'
    ])
      expect(isDocTextFile(f)).toBe(false)
  })

  it('source map 与 lockfile 从一开始就不在代码组里', () => {
    expect(isTextFile('a.js.map')).toBe(false)
    expect(isDocTextFile('yarn.lock')).toBe(false)
    expect(CODE_EXTENSIONS).not.toContain('map')
    expect(CODE_EXTENSIONS).not.toContain('lock')
  })

  it('原有文本与 office 组不受影响（txt/md 仍在索引里）', () => {
    expect(isDocTextFile('note.txt')).toBe(true)
    expect(isDocTextFile('readme.md')).toBe(true)
    expect(isDocTextFile('doc.docx')).toBe(true)
  })
})

describe('kind 不分叉', () => {
  it('代码扩展名一律仍是 file（改了就会新旧素材分两种 kind）', () => {
    for (const ext of CODE_EXTENSIONS) expect(kindOfExt(`x.${ext}`)).toBe('file')
    // 例外：这些扩展名在别的组里有既定归属，本条只保证代码组自己不改判
    const owned = CODE_EXTENSIONS.filter((e) => kindOfExt(`x.${e}`) !== 'file')
    expect(owned).toEqual([])
  })
})

describe('待抽取清单的 SQL 口径', () => {
  it('比 isDocTextFile 宽：包含全部代码扩展名（窄判由服务侧做）', () => {
    expect(DOC_TEXT_QUERY_EXTENSIONS).toContain('ts')
    expect(DOC_TEXT_QUERY_EXTENSIONS).toContain('js')
    for (const e of CODE_EXTENSIONS) expect(DOC_TEXT_QUERY_EXTENSIONS).toContain(e)
    // d.ts 的扩展名是 ts：会被 SQL 捞进来，再由 DocTextService 判掉
    expect(isDocTextFile('x.d.ts')).toBe(false)
  })

  it('office 与文本组都在这份清单里（不漏旧口径）', () => {
    for (const e of ['docx', 'pdf', 'txt', 'md', 'json'])
      expect(DOC_TEXT_QUERY_EXTENSIONS).toContain(e)
  })
})
