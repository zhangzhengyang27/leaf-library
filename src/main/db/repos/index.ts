/**
 * 仓储层统一导出（Leaf 素材库独立版：仅素材域）。
 */

export { PrefRepository, prefRepository } from './PrefRepository'
export { TagRepository, tagRepository, type TagRow } from './TagRepository'
export {
  PhotoRepository,
  photoRepository,
  type Photo,
  type PhotoProcessingResult
} from './PhotoRepository'
export { SmartAlbumRepository, smartAlbumRepository, type SmartAlbum } from './SmartAlbumRepository'
export {
  PhotoFolderRepository,
  photoFolderRepository,
  type PhotoFolder
} from './PhotoFolderRepository'
export { AlbumRepository } from './AlbumRepository'
