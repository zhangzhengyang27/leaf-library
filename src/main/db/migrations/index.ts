import type Database from 'better-sqlite3'

/**
 * Leaf 素材库 · 独立版迁移链（自工具箱 001–017 演进态合并而来）。
 * 独立项目从 version 1 重新起算，见 001_library_init.ts。
 */

export interface Migration {
  version: number
  name: string
  up(db: Database.Database): void
}

import { m001_library_init } from './001_library_init'
import { m002_photo_gaps } from './002_photo_gaps'
import { m003_file_dates } from './003_file_dates'
import { m004_folder_cover_pin } from './004_folder_cover_pin'
import { m005_folder_view_settings } from './005_folder_view_settings'
import { m006_photo_palette } from './006_photo_palette'
import { m007_folder_color } from './007_folder_color'
import { m008_folder_icon_auto_tags } from './008_folder_icon_auto_tags'
import { m009_freeform_positions } from './009_freeform_positions'
import { m010_storage_copy } from './010_storage_copy'
import { m012_ocr_text } from './012_ocr_text'
import { m013_file_path_index } from './013_file_path_index'
import { m014_photo_fts } from './014_photo_fts'
import { m015_deleted_at_index } from './015_deleted_at_index'
import { m016_color_hue_ext } from './016_color_hue_ext'
import { m017_pin_sort_index } from './017_pin_sort_index'
import { m018_doc_text } from './018_doc_text'
import { m019_drop_photo_embeddings } from './019_drop_photo_embeddings'
import { m020_normalize_ocr_text } from './020_normalize_ocr_text'
import { m021_photo_vectors } from './021_photo_vectors'
import { m022_photo_fps } from './022_photo_fps'
import { m023_photo_annotations } from './023_photo_annotations'
import { m024_audio_facts } from './024_audio_facts'
import { m025_source_path_index } from './025_source_path_index'
import { m026_smart_album_parent } from './026_smart_album_parent'
import { m027_drop_manual_albums } from './027_drop_manual_albums'
import { m028_tag_starred_sort } from './028_tag_starred_sort'

export const migrations: Migration[] = [
  m001_library_init,
  m002_photo_gaps,
  m003_file_dates,
  m004_folder_cover_pin,
  m005_folder_view_settings,
  m006_photo_palette,
  m007_folder_color,
  m008_folder_icon_auto_tags,
  m009_freeform_positions,
  m010_storage_copy,
  m012_ocr_text,
  m013_file_path_index,
  m014_photo_fts,
  m015_deleted_at_index,
  m016_color_hue_ext,
  m017_pin_sort_index,
  m018_doc_text,
  m019_drop_photo_embeddings,
  m020_normalize_ocr_text,
  m021_photo_vectors,
  m022_photo_fps,
  m023_photo_annotations,
  m024_audio_facts,
  m025_source_path_index,
  m026_smart_album_parent,
  m027_drop_manual_albums,
  m028_tag_starred_sort
]
