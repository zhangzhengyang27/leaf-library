/**
 * P1 · 视频同目录字幕 IPC
 *
 * 信任边界：只收 photoId。视频路径由主进程从库里取，渲染层传不进路径——
 * 这条链一旦收路径，就等于把任意目录的 readdir + 读文本开放给渲染层
 * （本模块第三次栽在同一类问题上，见 memory 里的 IPC 信任边界）。
 */
import { ipcMain } from 'electron'
import { photoRepository } from '../db/repos/PhotoRepository'
import { isAnnotationIdLike } from '@shared/annotations'
import { findSubtitleTracksAny } from '../services/SubtitleService'

export interface SubtitleTrackDto {
  label: string
  srclang?: string
  /** 归一化后的 WebVTT 文本；渲染层自己包成 blob: 喂 <track src> */
  vtt: string
  isDefault: boolean
}

/** 库里的素材是否真的有同目录字幕；任何异常都当"没有"，不打断预览 */
export function subtitlesForPhoto(photoId: unknown): SubtitleTrackDto[] {
  if (typeof photoId !== 'string' || photoId === '') return []
  try {
    const photo = photoRepository.getPhotoById(photoId)
    if (!photo || photo.kind !== 'video') return []
    // 库内路径 + 入库前的原始路径（copy 模式下字幕通常还留在外面），谁先有轨用谁
    return findSubtitleTracksAny([photo.filePath, photo.sourcePath]).map((t) => ({
      label: t.label,
      ...(t.srclang ? { srclang: t.srclang } : {}),
      vtt: t.vtt,
      isDefault: t.isDefault
    }))
  } catch {
    return []
  }
}

export interface AudioFactsDto {
  peaks: number[] | null
  durationMs: number
  bpm: number | null
}

/** 音频预览的事实数据：peaks 转成普通数组过 IPC（Uint8Array 结构化克隆到渲染层是 Uint8Array，
 *  但这里与 d.ts 的 number[] 契约对齐），任何异常都当「没有」不打断播放 */
export function audioFactsForPhoto(photoId: unknown): AudioFactsDto | null {
  if (!isAnnotationIdLike(photoId)) return null
  try {
    const photo = photoRepository.getPhotoById(photoId)
    if (!photo || photo.kind !== 'audio') return null
    const facts = photoRepository.getAudioFacts(photoId)
    if (!facts) return null
    return {
      peaks: facts.waveform ? Array.from(facts.waveform) : null,
      durationMs: facts.durationMs ?? 0,
      bpm: facts.bpm
    }
  } catch {
    return null
  }
}

export function registerMediaIpcHandlers(): void {
  ipcMain.handle('video:subtitles', (_e, photoId: unknown) => subtitlesForPhoto(photoId))
  ipcMain.handle('audio:waveform', (_e, photoId: unknown) => audioFactsForPhoto(photoId))
}
