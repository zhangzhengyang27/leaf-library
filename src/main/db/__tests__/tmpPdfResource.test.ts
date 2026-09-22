/** 临时验证:P3#16 pdfjs 资源配置后主进程渲染链路不回归(跑完即删) */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderPdfFirstPage } from '../../services/PdfRasterizer'
import { getPdfjsDistRoot } from '../../utils/pdfjsResources'

describe('pdfjs 资源定位', () => {
  it('getPdfjsDistRoot 命中含 cmaps/standard_fonts/wasm 的包根', () => {
    const root = getPdfjsDistRoot()
    expect(root).toBeTruthy()
    expect(existsSync(join(root!, 'cmaps', 'UniGB-UCS2-H.bcmap'))).toBe(true)
    expect(existsSync(join(root!, 'standard_fonts', 'LiberationSans-Regular.ttf'))).toBe(true)
    expect(existsSync(join(root!, 'wasm', 'openjpeg.wasm'))).toBe(true)
  })
})

describe('PdfRasterizer · 渲染不回归', () => {
  it('渲染最小 PDF 输出 PNG(资源参数传入后加载/渲染正常)', async () => {
    const content = 'BT /F1 36 Tf 72 720 Td (PDF RESOURCE TEST) Tj ET'
    const pdf = [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      `4 0 obj << /Length ${content.length} >> stream`,
      content,
      'endstream endobj',
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      'trailer << /Root 1 0 R >>',
      '%%EOF'
    ].join('\n')
    const dir = mkdtempSync(join(tmpdir(), 'leaf-pdf-verify-'))
    try {
      const pdfPath = join(dir, 't.pdf')
      const outPath = join(dir, 't.png')
      writeFileSync(pdfPath, pdf, 'latin1')
      const size = await renderPdfFirstPage(pdfPath, outPath)
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
      expect(statSync(outPath).size).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
