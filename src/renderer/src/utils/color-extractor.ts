/**
 * 从图片中提取主要颜色的工具函数
 */

export interface RGB {
  r: number
  g: number
  b: number
}

export interface ColorPalette {
  dominant: RGB // 主要颜色
  vibrant: RGB // 鲜艳颜色
  muted: RGB // 柔和颜色
  darkVibrant: RGB // 深色鲜艳
  lightVibrant: RGB // 浅色鲜艳
}

/**
 * 从图片 URL 提取颜色
 */
export async function extractColorsFromImage(imageUrl: string): Promise<ColorPalette | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }

        // 设置画布大小（缩小以提高性能）
        const size = 100
        canvas.width = size
        canvas.height = size

        // 绘制图片
        ctx.drawImage(img, 0, 0, size, size)

        // 提取颜色
        const imageData = ctx.getImageData(0, 0, size, size)
        const colors = extractColors(imageData)

        resolve(colors)
      } catch (error) {
        console.error('提取颜色失败:', error)
        resolve(null)
      }
    }

    img.onerror = () => {
      console.error('图片加载失败:', imageUrl)
      resolve(null)
    }

    img.src = imageUrl
  })
}

/**
 * 从 ImageData 提取颜色
 */
function extractColors(imageData: ImageData): ColorPalette {
  const pixels = imageData.data
  const colorMap = new Map<string, number>()
  const colors: RGB[] = []

  // 统计颜色频率（忽略透明像素）
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const a = pixels[i + 3]

    // 跳过透明或接近透明的像素
    if (a < 128) continue

    // 量化颜色以减少颜色数量
    const quantizedR = Math.floor(r / 10) * 10
    const quantizedG = Math.floor(g / 10) * 10
    const quantizedB = Math.floor(b / 10) * 10

    const colorKey = `${quantizedR},${quantizedG},${quantizedB}`
    colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1)

    colors.push({ r, g, b })
  }

  // 找到主要颜色（出现频率最高的）
  let dominantColor: RGB = { r: 0, g: 0, b: 0 }
  let maxCount = 0
  colorMap.forEach((count, key) => {
    if (count > maxCount) {
      maxCount = count
      const [r, g, b] = key.split(',').map(Number)
      dominantColor = { r, g, b }
    }
  })

  // 计算平均颜色
  if (colors.length === 0) {
    return createDefaultPalette()
  }

  const avgR = Math.round(colors.reduce((sum, c) => sum + c.r, 0) / colors.length)
  const avgG = Math.round(colors.reduce((sum, c) => sum + c.g, 0) / colors.length)
  const avgB = Math.round(colors.reduce((sum, c) => sum + c.b, 0) / colors.length)

  // 计算亮度
  const brightness = (r: number, g: number, b: number) => (r * 299 + g * 587 + b * 114) / 1000

  // 计算饱和度
  const saturation = (r: number, g: number, b: number) => {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max === 0) return 0
    return (max - min) / max
  }

  // 找到鲜艳的颜色（高饱和度）
  let vibrantColor: RGB = dominantColor
  let maxSaturation = 0
  colors.forEach((color) => {
    const sat = saturation(color.r, color.g, color.b)
    if (sat > maxSaturation && sat > 0.3) {
      maxSaturation = sat
      vibrantColor = color
    }
  })

  // 找到柔和的颜色（低饱和度）
  let mutedColor: RGB = dominantColor
  let minSaturation = 1
  colors.forEach((color) => {
    const sat = saturation(color.r, color.g, color.b)
    const bright = brightness(color.r, color.g, color.b)
    if (sat < minSaturation && sat < 0.5 && bright > 50 && bright < 200) {
      minSaturation = sat
      mutedColor = color
    }
  })

  // 找到深色鲜艳的颜色
  let darkVibrantColor: RGB = dominantColor
  let maxDarkVibrant = 0
  colors.forEach((color) => {
    const sat = saturation(color.r, color.g, color.b)
    const bright = brightness(color.r, color.g, color.b)
    if (sat > 0.3 && bright < 150 && sat * (200 - bright) > maxDarkVibrant) {
      maxDarkVibrant = sat * (200 - bright)
      darkVibrantColor = color
    }
  })

  // 找到浅色鲜艳的颜色
  let lightVibrantColor: RGB = dominantColor
  let maxLightVibrant = 0
  colors.forEach((color) => {
    const sat = saturation(color.r, color.g, color.b)
    const bright = brightness(color.r, color.g, color.b)
    if (sat > 0.3 && bright > 150 && sat * bright > maxLightVibrant) {
      maxLightVibrant = sat * bright
      lightVibrantColor = color
    }
  })

  return {
    dominant: dominantColor,
    vibrant: vibrantColor,
    muted: mutedColor,
    darkVibrant: darkVibrantColor,
    lightVibrant: lightVibrantColor
  }
}

/**
 * 创建默认颜色调色板
 */
function createDefaultPalette(): ColorPalette {
  const defaultColor: RGB = { r: 59, g: 130, b: 246 } // blue-500
  return {
    dominant: defaultColor,
    vibrant: defaultColor,
    muted: defaultColor,
    darkVibrant: defaultColor,
    lightVibrant: defaultColor
  }
}

/**
 * RGB 转十六进制
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => {
    const hex = Math.round(n).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

/**
 * RGB 转 CSS rgba 字符串
 */
export function rgbToRgba(rgb: RGB, alpha: number = 1): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/**
 * 计算颜色的亮度
 */
export function getBrightness(rgb: RGB): number {
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
}

/**
 * 判断颜色是否为深色
 */
export function isDark(rgb: RGB): boolean {
  return getBrightness(rgb) < 128
}

/**
 * 调整颜色亮度
 */
export function adjustBrightness(rgb: RGB, factor: number): RGB {
  return {
    r: Math.max(0, Math.min(255, rgb.r * factor)),
    g: Math.max(0, Math.min(255, rgb.g * factor)),
    b: Math.max(0, Math.min(255, rgb.b * factor))
  }
}

/**
 * 混合两个颜色
 */
export function blendColors(color1: RGB, color2: RGB, ratio: number = 0.5): RGB {
  return {
    r: Math.round(color1.r * (1 - ratio) + color2.r * ratio),
    g: Math.round(color1.g * (1 - ratio) + color2.g * ratio),
    b: Math.round(color1.b * (1 - ratio) + color2.b * ratio)
  }
}
