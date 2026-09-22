/**
 * Leaf · Photo 渲染端类型
 *
 * 单一来源。views/photos 下所有组件统一 import。
 * 与主进程 src/main/db/repos/PhotoRepository.ts 的 Photo 字段一致
 * （主进程存的是 SQLite row，前端展示层是对象）。
 */

export interface Photo {
  id: string
  filePath: string
  fileName: string
  fileSize: number
  width?: number
  height?: number
  createdAt: number
  takenAt?: number
  importedAt: number
  modifiedAt: number
  tags: string[]
  isFavorite: boolean
  dateSection: string
  rating: number
  description?: string
  source: string
  thumbStatus: number
  kind: 'image' | 'video' | 'audio' | 'font' | 'text' | 'file' | 'bookmark'
  durationMs?: number
  folderId?: string
  sourceUrl?: string | null // 来源 URL（书签；六轮起检查器可编辑，null=已清除）
  phash?: string
  colorDominant?: string
  /** 主色板（006，检查器色点行，Eagle 多色板形态） */
  palette?: string[]
  cameraModel?: string
  lensModel?: string
  iso?: number
  aperture?: number
  shutter?: string
  focalLength?: number
  latitude?: number
  longitude?: number
  hash?: string
  /** 最近查看时间（打开素材/视图时写入，驱动「最近查看」固定入口） */
  lastViewedAt?: number
  /** 文件系统创建时间（003，排列「创建日期」） */
  fsCreatedAt?: number
  /** 文件系统修改时间（003，排列「修改日期」） */
  fsModifiedAt?: number
  /** 置顶时间（004，置顶项视图内优先） */
  pinnedAt?: number
  /** F11：copy 模式导入时的原始路径 */
  sourcePath?: string
  /** F11：断链标记（原文件丢失；重定位/恢复后清除） */
  missingAt?: number
  /** F12：图片内文字（OCR；undefined=未识别，''=识别过但无文字） */
  ocrText?: string
  /** 文档正文抽取（018，代码/文本/office 类素材；与 ocrText 同属「可搜的正文」但来源不同） */
  docText?: string
  /** 视频实测帧率（022，逐帧步进按它挪时间） */
  fps?: number
  /** 音频 BPM（024；主进程只在测出正数时挂上，检查器据此决定显不显示） */
  bpm?: number
}

export interface PhotoSection {
  dateSection: string
  photos: Photo[]
}

/**
 * 智能收藏夹规则：类型单源在 @shared/smartAlbumRules（主进程的 buildSmartAlbumWhere
 * 与这里必须是同一份，否则渲染层能填、主进程不认）。此前本文件另有一份只到
 * D-012 的副本，二十六轮之后的谓词（形状/比例/标签按名/近似色/语义档…）
 * 全都不在里面，导致消费方按 shared 的字段写、类型检查却报错。
 */
import type { SmartAlbumRules as SharedSmartAlbumRules } from '@shared/smartAlbumRules'

export type SmartAlbumRules = SharedSmartAlbumRules

export interface SmartAlbum {
  id: string
  name: string
  rules: SmartAlbumRules
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/** 素材文件夹（photo_folders，五期） */
export interface PhotoFolder {
  id: string
  name: string
  parentId: string | null
  photoCount: number
  createdAt: number
  updatedAt: number
  /** m004：是否设置了密码（加密体不下发渲染层） */
  hasPassword?: boolean
  /** m004：文件夹封面素材 id */
  coverPhotoId?: string
  /** m004：文件夹描述 */
  description?: string
  /** 十二轮：视图覆盖（m005；undefined=跟随全局） */
  viewLayout?: string
  viewSort?: string
  viewDisplay?: string
  /** 十五轮 D19：文件夹颜色（'#rrggbb'；undefined=自动色） */
  color?: string
  /** 二十四轮：emoji 图标（undefined=默认图形） */
  icon?: string
}

/** 手动相册（photo_albums，四期） */
export interface Album {
  id: string
  name: string
  coverPhotoId: string | null
  sortOrder: number
  photoCount: number
  createdAt: number
  updatedAt: number
}

/** 全局标签字典行（tag_tags，见 window.api.tags） */
export interface TagSummary {
  id: string
  name: string
  color?: string | null
  icon?: string | null
  parentId?: string | null
  usageCount?: number
}

export interface ProcessingProgress {
  photoId: string
  status: 'done' | 'failed'
  done: number
  total: number
}
