/**
 * filename.ts · 批量重命名 token 求值器单测（P2 token 扩容）。
 *
 * 逐 token 断言 + 缺失字段空串 + 未知 token 原样保留 + 安全闸（字面 { 的约定：
 * isSafeRenamePattern 拒绝花括号字面量，求值时未知 {x} 落成字面量）。
 * 日期期望值用本地时区构造（new Date(y, m, d)），与求值口径一致，不受 CI 时区影响。
 */
import { describe, expect, it } from 'vitest'
import {
  RENAME_TOKENS,
  evaluateRenameTokens,
  isSafeRenamePattern,
  sanitizeFileNameBase,
  stripExt
} from '../filename'

// 本地 2026-09-16 09:05:03（导入）/ 2026-09-26（今天，注入固定 now 消除测试易变性）
const IMPORTED = new Date(2026, 8, 16, 9, 5, 3).getTime()
const NOW = new Date(2026, 8, 26, 14, 30, 5).getTime()

const FULL_CTX = {
  fileName: 'IMG_1234.jpg',
  importedAt: IMPORTED,
  index: 7,
  pad: 3,
  folderName: '旅行',
  fsCreatedAt: new Date(2026, 0, 2, 8, 0, 0).getTime(),
  fsModifiedAt: new Date(2026, 2, 4, 12, 0, 0).getTime(),
  takenAt: new Date(2025, 11, 31, 23, 0, 0).getTime(),
  fileSize: 1536,
  rating: 4,
  durationMs: 95000,
  width: 1920,
  height: 1080,
  id: 'ph-001',
  tags: ['风景', '宠物'],
  libraryName: '我的库',
  now: NOW
}

describe('stripExt / sanitizeFileNameBase（既有约定不回归）', () => {
  it('去扩展名；无扩展名与隐藏文件返回原名', () => {
    expect(stripExt('a.b.c.png')).toBe('a.b.c')
    expect(stripExt('noext')).toBe('noext')
    expect(stripExt('.gitignore')).toBe('.gitignore')
  })

  it('非法字符替换为 -，控制字符同样处理', () => {
    expect(sanitizeFileNameBase('a<b>c:d')).toBe('a-b-c-d')
  })
})

describe('evaluateRenameTokens · 原有六种', () => {
  it('{name} = 原文件名去扩展名', () => {
    expect(evaluateRenameTokens('{name}', FULL_CTX)).toBe('IMG_1234')
  })

  it('{n} 按 index + pad 补零；pad 缺省不补零', () => {
    expect(evaluateRenameTokens('{n}', FULL_CTX)).toBe('007')
    expect(evaluateRenameTokens('{n}', { ...FULL_CTX, pad: undefined })).toBe('7')
  })

  it('{date}/{time} = 导入日期时间（无分隔符，既有约定）', () => {
    expect(evaluateRenameTokens('{date}', FULL_CTX)).toBe('20260916')
    expect(evaluateRenameTokens('{time}', FULL_CTX)).toBe('090503')
  })

  it('{parent} = 文件夹名；空白/缺失回退「未分类」', () => {
    expect(evaluateRenameTokens('{parent}', FULL_CTX)).toBe('旅行')
    expect(evaluateRenameTokens('{parent}', { ...FULL_CTX, folderName: '  ' })).toBe('未分类')
    expect(evaluateRenameTokens('{parent}', { ...FULL_CTX, folderName: undefined })).toBe('未分类')
  })

  it('{rand} = 6 位小写字母数字', () => {
    expect(evaluateRenameTokens('{rand}', FULL_CTX)).toMatch(/^[a-z0-9]{6}$/)
  })
})

describe('evaluateRenameTokens · P2 新增日期族（格式对齐 Eagle）', () => {
  it('{add date} = 导入日期 YYYY-MM-DD（Eagle %D 家族连字符）', () => {
    expect(evaluateRenameTokens('{add date}', FULL_CTX)).toBe('2026-09-16')
  })

  it('{today} = 求值时刻 YYYY-MM-DD（注入 now）', () => {
    expect(evaluateRenameTokens('{today}', FULL_CTX)).toBe('2026-09-26')
  })

  it('{create date} = 文件创建时间 YYYY_MM_DD（Eagle %B 下划线）', () => {
    expect(evaluateRenameTokens('{create date}', FULL_CTX)).toBe('2026_01_02')
  })

  it('{create date} 缺失回退 fsModifiedAt（Eagle btime→mtime 回退链）', () => {
    expect(evaluateRenameTokens('{create date}', { ...FULL_CTX, fsCreatedAt: undefined })).toBe(
      '2026_03_04'
    )
  })

  it('{modified date} = 文件修改时间 YYYY_MM_DD（Eagle %M）；缺失回退求值时刻', () => {
    expect(evaluateRenameTokens('{modified date}', FULL_CTX)).toBe('2026_03_04')
    expect(evaluateRenameTokens('{modified date}', { ...FULL_CTX, fsModifiedAt: undefined })).toBe(
      '2026_09_26'
    )
  })

  it('{taken date} = 拍摄日期 YYYY_MM_DD；缺失展开空串（截图无 EXIF 属常态）', () => {
    expect(evaluateRenameTokens('{taken date}', FULL_CTX)).toBe('2025_12_31')
    expect(evaluateRenameTokens('{taken date}', { ...FULL_CTX, takenAt: undefined })).toBe('')
    // 空串空洞对组合模板可见：用户在预览里自己调整
    expect(evaluateRenameTokens('{taken date}-{name}', { ...FULL_CTX, takenAt: undefined })).toBe(
      '-IMG_1234'
    )
  })
})

describe('evaluateRenameTokens · P2 新增属性族', () => {
  it('{size} = 人性化文件大小（确定性：同字节同串）', () => {
    expect(evaluateRenameTokens('{size}', { ...FULL_CTX, fileSize: 500 })).toBe('500B')
    expect(evaluateRenameTokens('{size}', { ...FULL_CTX, fileSize: 1024 })).toBe('1KB')
    expect(evaluateRenameTokens('{size}', FULL_CTX)).toBe('1.5KB')
    expect(evaluateRenameTokens('{size}', { ...FULL_CTX, fileSize: 5 * 1024 * 1024 })).toBe('5MB')
  })

  it('{rating} = 评分 0-5；缺失空串', () => {
    expect(evaluateRenameTokens('{rating}', FULL_CTX)).toBe('4')
    expect(evaluateRenameTokens('{rating}', { ...FULL_CTX, rating: undefined })).toBe('')
  })

  it('{duration} = 42s / 3m05s / 1h02m03s；缺失与非正数空串', () => {
    expect(evaluateRenameTokens('{duration}', { ...FULL_CTX, durationMs: 4200 })).toBe('4s')
    expect(evaluateRenameTokens('{duration}', { ...FULL_CTX, durationMs: 185000 })).toBe('3m05s')
    expect(evaluateRenameTokens('{duration}', { ...FULL_CTX, durationMs: 3723000 })).toBe(
      '1h02m03s'
    )
    expect(evaluateRenameTokens('{duration}', { ...FULL_CTX, durationMs: undefined })).toBe('')
    expect(evaluateRenameTokens('{duration}', { ...FULL_CTX, durationMs: 0 })).toBe('')
  })

  it('{width}/{height} = 像素尺寸；缺失空串', () => {
    expect(evaluateRenameTokens('{width}x{height}', FULL_CTX)).toBe('1920x1080')
    expect(evaluateRenameTokens('{width}x{height}', { ...FULL_CTX, width: undefined })).toBe(
      'x1080'
    )
  })

  it('{id} = 素材 id；缺失空串', () => {
    expect(evaluateRenameTokens('{id}', FULL_CTX)).toBe('ph-001')
    expect(evaluateRenameTokens('{id}', { ...FULL_CTX, id: undefined })).toBe('')
  })

  it('{tags} = 排序后 - 连接（Eagle %T 语义）；无标签空串', () => {
    expect(evaluateRenameTokens('{tags}', FULL_CTX)).toBe('宠物-风景')
    expect(evaluateRenameTokens('{tags}', { ...FULL_CTX, tags: [] })).toBe('')
    expect(evaluateRenameTokens('{tags}', { ...FULL_CTX, tags: undefined })).toBe('')
  })

  it('{library} = 库名；缺失空串', () => {
    expect(evaluateRenameTokens('{library}', FULL_CTX)).toBe('我的库')
    expect(evaluateRenameTokens('{library}', { ...FULL_CTX, libraryName: undefined })).toBe('')
  })
})

describe('evaluateRenameTokens · 组合与未知 token', () => {
  it('组合模板按序展开', () => {
    expect(evaluateRenameTokens('{parent}-{taken date}-{n}', FULL_CTX)).toBe('旅行-2025_12_31-007')
  })

  it('未知 token 原样保留（字面量落盘，预览可见）', () => {
    expect(evaluateRenameTokens('{x}{n}', FULL_CTX)).toBe('{x}007')
    expect(evaluateRenameTokens('{ext}-{name}', FULL_CTX)).toBe('{ext}-IMG_1234')
  })

  it('已知 token 名是完整匹配：{name2} 不被 {name} 吞掉', () => {
    expect(evaluateRenameTokens('{name2}', FULL_CTX)).toBe('{name2}')
  })
})

describe('isSafeRenamePattern（AI 产出与提交的安全闸）', () => {
  it('全部已知 token（含 P2 多词 token）通过', () => {
    for (const t of RENAME_TOKENS) {
      expect(isSafeRenamePattern(t)).toBe(true)
    }
    expect(isSafeRenamePattern('{parent}-{create date}-{rating}')).toBe(true)
  })

  it('拒绝未知 token / 字面花括号 / 路径与非法字符 / 空 / 超长', () => {
    expect(isSafeRenamePattern('{ext}')).toBe(false)
    expect(isSafeRenamePattern('{invalid}')).toBe(false)
    expect(isSafeRenamePattern('a{name}b}')).toBe(false)
    expect(isSafeRenamePattern('a/b')).toBe(false)
    expect(isSafeRenamePattern('')).toBe(false)
    expect(isSafeRenamePattern('x'.repeat(121))).toBe(false)
  })
})
