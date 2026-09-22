import { describe, expect, it } from 'vitest'
import {
  IMAGE_EXTENSIONS,
  RASTER_EXTENSIONS,
  VIDEO_EXTENSIONS,
  isArchiveFile,
  isPlayableVideoFile,
  isRasterFile,
  kindOfExt
} from '@shared/assetTypes'
import { imageWhitelistGaps, sharpReadableExtensions } from '../formatCapability'

/**
 * 这一组用例守的是同一个坑的两种复发方式：
 * ① 把 sharp.format[k].input（对象，恒真）当布尔读 → 假绿灯；
 * ② 往 IMAGE/RASTER 白名单加了扩展名，但四条解码通道一条都覆盖不到。
 */
describe('sharp 真实解码面', () => {
  const readable = sharpReadableExtensions()

  it('覆盖主流位图，avif 经 heif 登记', () => {
    for (const e of ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'gif', 'svg', 'avif']) {
      expect(readable).toContain(e)
    }
  })

  it('不把 sharp 解不了的格式报成可用（.input 是对象不是布尔）', () => {
    for (const e of ['heic', 'heif', 'jxl', 'pdf', 'ai', 'psd', 'exr', 'tga', 'hdr']) {
      expect(readable).not.toContain(e)
    }
  })
})

describe('白名单与解码通道一致性', () => {
  it('IMAGE + RASTER 里每个扩展名都有通道（否则要么补档要么移出白名单）', () => {
    expect(imageWhitelistGaps()).toEqual([])
  })

  it('贴图组归类为图片并命中 ffmpeg 兜底档', () => {
    for (const e of ['bmp', 'exr', 'tga', 'dpx', 'sgi', 'jp2']) {
      expect(isRasterFile(`a.${e}`)).toBe(true)
      expect(kindOfExt(`a.${e}`)).toBe('image')
    }
  })

  it('IMAGE 与 RASTER 两组不重叠（重叠会让格式筛选出现重复项）', () => {
    const overlap = IMAGE_EXTENSIONS.filter((e) => RASTER_EXTENSIONS.includes(e))
    expect(overlap).toEqual([])
  })

  it('归档只认 zip，kind 仍是 file', () => {
    expect(isArchiveFile('pack.zip')).toBe(true)
    expect(isArchiveFile('pack.rar')).toBe(false)
    expect(kindOfExt('pack.zip')).toBe('file')
  })
})

describe('视频容器可播性（Chromium 140 实测清单）', () => {
  it('可播容器', () => {
    for (const e of ['mp4', 'm4v', 'mov', 'webm', 'mkv', '3gp']) {
      expect(isPlayableVideoFile(`a.${e}`)).toBe(true)
    }
  })
  it('播不了的容器仍归视频（有封面，无内联播放）', () => {
    for (const e of ['avi', 'wmv', 'flv', 'mpeg', 'mpg', 'm2ts', 'hevc']) {
      expect(isPlayableVideoFile(`a.${e}`)).toBe(false)
      expect(kindOfExt(`a.${e}`)).toBe('video')
    }
  })

  it('.ts / .mts 是 TypeScript，不能被 Eagle 的 MPEG-TS 表拉进视频组', () => {
    for (const e of ['ts', 'mts']) {
      expect(VIDEO_EXTENSIONS).not.toContain(e)
      expect(kindOfExt(`index.${e}`)).toBe('file')
    }
  })
})
