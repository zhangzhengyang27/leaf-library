/**
 * P3#16 配套:pdfjs 辅助资源(CJK cmap / 标准字体 / wasm 解码器)定位回归。
 *
 * getPdfjsDistRoot 在 dev(require.resolve)与打包(asar 内 node_modules)两种
 * 形态下都必须命中包根,否则:
 * - 主进程缩略图(NodeBinaryDataFactory fs.readFile)与渲染端预览(pdfres://)
 *   的 CJK/非嵌入字体 PDF 缺字、JPEG2000/JBIG2 图像解不出。
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getPdfjsDistRoot } from '../../utils/pdfjsResources'

describe('pdfjsResources · getPdfjsDistRoot', () => {
  it('命中含 cmaps/standard_fonts/wasm/iccs 的 pdfjs-dist 包根', () => {
    const root = getPdfjsDistRoot()
    expect(root).toBeTruthy()
    expect(existsSync(join(root!, 'cmaps', 'UniGB-UCS2-H.bcmap'))).toBe(true)
    expect(existsSync(join(root!, 'standard_fonts', 'LiberationSans-Regular.ttf'))).toBe(true)
    expect(existsSync(join(root!, 'wasm', 'openjpeg.wasm'))).toBe(true)
    expect(existsSync(join(root!, 'iccs'))).toBe(true)
  })
})
