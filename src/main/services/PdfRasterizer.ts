import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas } from '@napi-rs/canvas'
import { getPdfjsDistRoot } from '../utils/pdfjsResources'

/**
 * PDF/AI 首页栅格化（六期实测补路）。
 *
 * 实测结论：bundled libvips 虽在 sharp.format 中列出 magick/pdf，但对 PDF 解码
 * 抛 "Input file contains unsupported image format"（预编译包未含 poppler/pdfium）。
 * 因此 PDF 与 AI（PDF 兼容格式）走纯 JS 的 pdfjs-dist 渲染 + @napi-rs/canvas
 * （N-API 稳定 ABI，Electron main / vitest(纯 Node) 均可加载）。
 * PSD 无纯 JS 合成图解码器，不支持缩略图，由上层卡片兜底。
 */

const PDF_EXTENSIONS = new Set(['.pdf', '.ai'])

export function isPdfLikeFile(fileName: string): boolean {
  const idx = fileName.lastIndexOf('.')
  if (idx < 0) return false
  return PDF_EXTENSIONS.has(fileName.slice(idx).toLowerCase())
}

/** 渲染 PDF 首页为 PNG 文件，返回渲染后像素尺寸（长边不超过 maxEdge） */
export async function renderPdfFirstPage(
  pdfPath: string,
  outPngPath: string,
  maxEdge = 2048
): Promise<{ width: number; height: number }> {
  const data = new Uint8Array(await readFile(pdfPath))
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // v6 起销毁接口在 loadingTask 上（doc.destroy 已移除）
  // 主进程是 Node 环境：NodeBinaryDataFactory 直接 fs.readFile(baseUrl + filename)，
  // 资源 URL 传「以 / 结尾的文件系统路径」——CJK cmap/标准字体/wasm 解码器齐全，
  // 否则含 CJK 或非嵌入字体的 PDF 缩略图缺字、JPEG2000/JBIG2 图像解不出
  const resRoot = getPdfjsDistRoot()
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    ...(resRoot
      ? {
          cMapUrl: `${join(resRoot, 'cmaps')}/`,
          standardFontDataUrl: `${join(resRoot, 'standard_fonts')}/`,
          wasmUrl: `${join(resRoot, 'wasm')}/`,
          iccUrl: `${join(resRoot, 'iccs')}/`
        }
      : {})
  })
  const doc = await loadingTask.promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(maxEdge / Math.max(base.width, base.height), 2)
    const viewport = page.getViewport({ scale })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    // pdfjs 的渲染参数类型面向 DOM Canvas，napi-canvas 结构兼容、按边界转换
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport
    }).promise
    await writeFile(outPngPath, canvas.toBuffer('image/png'))
    return { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) }
  } finally {
    await loadingTask.destroy().catch(() => {})
  }
}
