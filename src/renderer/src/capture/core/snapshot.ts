import type { Rect } from './geometry'

export class CaptureError extends Error {}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new CaptureError('快照解码失败'))
    img.src = dataUrl
  })
}

/** 从整屏快照裁出选区（输出物理分辨率 canvas） */
export function cropImageToCanvas(
  img: HTMLImageElement,
  region: Rect,
  scale: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(region.width * scale))
  canvas.height = Math.max(1, Math.round(region.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new CaptureError('canvas 2d 不可用')
  ctx.drawImage(
    img,
    region.x * scale,
    region.y * scale,
    region.width * scale,
    region.height * scale,
    0,
    0,
    canvas.width,
    canvas.height
  )
  return canvas
}
