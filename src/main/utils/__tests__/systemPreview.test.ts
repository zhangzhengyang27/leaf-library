/**
 * G4 · 借 macOS 系统能力出代表图
 *
 * 这个测试只在 darwin 跑：它验证的正是"sips/qlmanage 真的能出图"，
 * 换平台没有这条通路（Windows 侧 Eagle 用 Ghostscript/COM，本项目未做）。
 */
import { describe, it, expect } from 'vitest'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderSystemPreview } from '../systemPreview'
import { isSystemPreviewFile, CAMERA_RAW_EXTENSIONS } from '@shared/assetTypes'

const FIXTURE = join(
  process.cwd(),
  'src/main/services/__tests__/fixtures/sample.docx'
)

const isPng = (p: string): boolean => {
  const buf = readFileSync(p)
  return buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 && buf[4] === 0x0d
}

describe.skipIf(process.platform !== 'darwin')('renderSystemPreview（macOS 系统通路）', () => {
  it('Office 文档能借系统出一张真 PNG', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leaf-sysprev-'))
    try {
      const src = join(dir, 'sample.docx')
      const out = join(dir, 'out.png')
      copyFileSync(FIXTURE, src)
      const ok = await renderSystemPreview(src, out, 400)
      expect(ok).toBe(true)
      expect(existsSync(out)).toBe(true)
      expect(isPng(out)).toBe(true)
      expect(statSync(out).size).toBeGreaterThan(1024)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('系统也render不出来时返回 false 且不写坏文件（超时/降级）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leaf-sysprev-bad-'))
    try {
      // 扩展名在系统预览族内，内容却是垃圾：sips 与 qlmanage 都该失败而不是产出空图
      const src = join(dir, 'broken.ai')
      const out = join(dir, 'out.png')
      writeFileSync(src, 'not an illustrator file')
      const ok = await renderSystemPreview(src, out, 400)
      expect(ok).toBe(false)
      expect(existsSync(out)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 90_000)
})

describe('isSystemPreviewFile 的路由边界', () => {
  it('相机 RAW / 设计 / iWork 在列，普通图与普通文本不在', () => {
    expect(isSystemPreviewFile('a.cr3')).toBe(true)
    expect(isSystemPreviewFile('a.NEF')).toBe(true)
    expect(isSystemPreviewFile('a.key')).toBe(true)
    expect(isSystemPreviewFile('a.indd')).toBe(true)
    expect(isSystemPreviewFile('a.png')).toBe(false)
    expect(isSystemPreviewFile('a.txt')).toBe(false)
    // hdr 明确不在：实测 qlmanage 对 .hdr 直接不返回，不能挂在这条路上
    expect(isSystemPreviewFile('a.hdr')).toBe(false)
  })

  it('RAW 清单不含我们其实能解的格式（避免两条通道重复登记）', () => {
    for (const ext of ['heic', 'avif', 'psd', 'pdf']) {
      expect(CAMERA_RAW_EXTENSIONS).not.toContain(ext)
    }
  })
})
