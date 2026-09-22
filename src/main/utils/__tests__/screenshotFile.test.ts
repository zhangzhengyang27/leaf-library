import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeDataUrl, screenshotFileName, uniqueFilePath } from '../screenshotFile'

describe('screenshotFileName', () => {
  it('格式为 Screenshot - YYYY-MM-DD HH.mm.ss', () => {
    const d = new Date(2026, 8, 17, 14, 30, 5)
    expect(screenshotFileName(d)).toBe('Screenshot - 2026-09-17 14.30.05')
  })
})

describe('decodeDataUrl', () => {
  it('解析 png dataURL', () => {
    const r = decodeDataUrl('data:image/png;base64,AAAA')
    expect(r?.ext).toBe('.png')
    expect(r?.mime).toBe('image/png')
    expect(Buffer.from(r!.buffer).toString()).toBe('\u0000\u0000\u0000')
  })
  it('解析 jpeg dataURL', () => {
    expect(decodeDataUrl('data:image/jpeg;base64,AAAA')?.ext).toBe('.jpg')
  })
  it('拒绝非图片 dataURL', () => {
    expect(decodeDataUrl('data:text/plain;base64,AAAA')).toBeNull()
    expect(decodeDataUrl('not-a-data-url')).toBeNull()
  })
})

describe('uniqueFilePath', () => {
  it('无重名时原样返回', () => {
    const dir = mkdtempSync(join(tmpdir(), 'leaf-shot-'))
    expect(uniqueFilePath(dir, 'Shot', '.png')).toBe(join(dir, 'Shot.png'))
  })
  it('重名自动追加序号', () => {
    const dir = mkdtempSync(join(tmpdir(), 'leaf-shot-'))
    writeFileSync(join(dir, 'Shot.png'), 'x')
    expect(uniqueFilePath(dir, 'Shot', '.png')).toBe(join(dir, 'Shot 2.png'))
    writeFileSync(join(dir, 'Shot 2.png'), 'x')
    expect(uniqueFilePath(dir, 'Shot', '.png')).toBe(join(dir, 'Shot 3.png'))
  })
})
