/**
 * 数据存储实例统一管理（Leaf 素材库独立版：仅素材域）。
 */

import { TagDataStore } from './TagDataStore'
import { PreferencesDataStore } from './PreferencesDataStore'
import { PhotoDataStore } from './PhotoDataStore'

export const tagStore = new TagDataStore()
export const preferencesStore = new PreferencesDataStore()
export const photoStore = new PhotoDataStore()
