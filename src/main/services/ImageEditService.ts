/**
 * Leaf · ImageEditService（P1：图片旋转/翻转）
 *
 * 两条硬规矩，都是这个库的真实形状逼出来的：
 *
 * 1. **编辑前先 materialize 成库内副本。** 库里 5,178 条素材有 5,152 条的 file_path
 *    直接指向用户桌面上的原文件（导入时没拷贝入库）。就地改写那些文件等于动用户
 *    自己磁盘上的东西，撤销不了。Eagle 的"就地编辑"之所以成立，是因为它的素材
 *    本来就在库里——所以要的是它语义，不是它的落点：先收副本，再改副本。
 *
 * 2. **改完必须让派生数据全部重算。** 缩略图、pHash、主色、色板、宽高、文件大小，
 *    以及图像向量（向量取自 256 缩略图）。少重算一样，就会出现"图已经转了 90°，
 *    颜色筛选还按旧主色命中、找相似还按旧哈希排"——这类不一致比报错更难查。
 *
 * 只允许 sharp 能原样写回的格式。HEIC/RAW（dng/cr2/nef/arw…）明确拒绝：
 * 把底片重编码成 JPEG 是毁数据，宁可让用户先去转格式。
 */
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import sharp, { type Sharp } from 'sharp'
import { EDITABLE_IMAGE_EXTENSIONS } from '@shared/assetTypes'
import { photoRepository } from '../db/repos'
import { getThumbnailService } from './ThumbnailService'
import { getAssetProcessingRef } from './assetProcessingRef'
import { photoStore } from '../stores'

// 白名单单源在 @shared/assetTypes：渲染层按它决定按钮显不显示，
// 这里按它挡写回，两边各一份就会出现"点了必然失败"的按钮
const EDITABLE = new Set<string>(EDITABLE_IMAGE_EXTENSIONS)

export type FlipAxis = 'horizontal' | 'vertical'

export function editableOrThrow(filePath: string): void {
  const ext = extname(filePath).toLowerCase()
  if (!EDITABLE.has(ext)) {
    throw new Error(
      `${ext || '该'}格式不支持就地编辑（HEIC/RAW/PSD 等重编码会毁掉原始信息，请先转成 JPG/PNG）`
    )
  }
}

/**
 * 变换一张图。
 *
 * 两遍 sharp 是必需的：第一遍 `.rotate()`（无参）按 EXIF 方向把像素摆正并丢掉
 * orientation 标记，第二遍才施加用户要的转角。只跑第二遍的话，一张 EXIF 标着
 * "需要转 90° 显示"的图会被转成看起来 180°——手机照片十有八九是这种。
 */
export async function transform(
  filePath: string,
  fn: (img: Sharp) => Sharp
): Promise<Buffer> {
  const oriented = await sharp(readFileSync(filePath)).rotate().toBuffer()
  let img = fn(sharp(oriented)).withMetadata()
  // 显式选编码器：不指定的话 sharp 会把 PNG/TIFF 也按 JPEG 吐出来。
  // JPEG 重编码给到 92，避免每次旋转都掉一档画质。
  const ext = extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') img = img.jpeg({ quality: 92 })
  else if (ext === '.png') img = img.png()
  else if (ext === '.webp') img = img.webp({ quality: 92 })
  else if (ext === '.tif' || ext === '.tiff') img = img.tiff()
  else if (ext === '.avif') img = img.avif({ quality: 92 })
  return img.toBuffer()
}

/** 原子写回：先落 .leaf-edit-tmp 再 rename，避免中途失败留下半截文件覆盖原图 */
export function writeBack(filePath: string, buf: Buffer): void {
  // 临时文件同目录同前缀：跨设备 rename 会失败，且崩溃残留也只在原图旁边
  const tmp = `${filePath}.leaf-edit-tmp`
  try {
    writeFileSync(tmp, buf)
    renameSync(tmp, filePath)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

/** 清掉所有派生结果并重新入队（缩略图 → pHash/主色/色板/宽高 → 向量） */
function invalidateDerived(photoId: string): void {
  const thumbs = getThumbnailService()
  for (const size of [256, 1024] as const) {
    rmSync(thumbs.pathFor(photoId, size), { force: true })
  }
  photoRepository.setThumbStatus(photoId, 0)
  getAssetProcessingRef()?.enqueue(photoId)
}

async function afterEdit(photoId: string, filePath: string): Promise<void> {
  // 尺寸与大小都必须当场写：处理管线不回填图片宽高（见 updateFileFacts 的说明）
  try {
    const meta = await sharp(filePath).metadata()
    photoRepository.updateFileFacts(photoId, {
      size: statSync(filePath).size,
      width: meta.width ?? null,
      height: meta.height ?? null
    })
  } catch (error) {
    console.warn('[imageEdit] 回写尺寸失败:', String(error))
  }
  invalidateDerived(photoId)
}

export const imageEdit = {
  /** degrees 取 90/180/270（顺时针，与 Eagle 的「向右旋转」一致） */
  async rotate(photoId: string, degrees: number): Promise<void> {
    const d = [90, 180, 270].includes(degrees) ? degrees : null
    if (d === null) throw new Error('只能旋转 90/180/270 度')
    const path = photoStore.materializeIntoLibrary(photoId)
    editableOrThrow(path)
    const buf = await transform(path, (img) => img.rotate(d))
    writeBack(path, buf)
    await afterEdit(photoId, path)
  },

  async flip(photoId: string, axis: FlipAxis): Promise<void> {
    if (axis !== 'horizontal' && axis !== 'vertical') {
      throw new Error('翻转方向只能是水平或垂直')
    }
    const path = photoStore.materializeIntoLibrary(photoId)
    editableOrThrow(path)
    const buf = await transform(path, (img) =>
      axis === 'horizontal' ? img.flop() : img.flip()
    )
    writeBack(path, buf)
    await afterEdit(photoId, path)
  },

  /** 供 UI 预判：这条素材现在能不能编辑（库外文件能，格式不行） */
  canEdit(photoId: string): { ok: boolean; reason?: string } {
    const photo = photoRepository.getPhotoById(photoId)
    if (!photo) return { ok: false, reason: '素材不存在' }
    if (!existsSync(photo.filePath)) return { ok: false, reason: '文件已丢失' }
    const ext = extname(photo.filePath).toLowerCase()
    if (!EDITABLE.has(ext)) {
      return { ok: false, reason: `${ext || '该'}格式不支持就地编辑` }
    }
    return { ok: true }
  }
}
