/**
 * Leaf · IPC Contract
 *
 * 单一事实源：所有 IPC 名称 + 请求/响应类型都登记在这里。
 * 一旦在这里登记，preload 自动暴露 `window.api.<key>(req)` 给渲染进程。
 * 删除登记 → TS 编译失败，避免悄悄丢失 API。
 */

export interface IpcContract {
  // ─────────── 截图（窗口交互由 electron-screenshots 提供；Leaf 侧只有设置/入库/贴图） ───────────
  'screenshot.save': {
    req: ScreenshotSaveRequest
    res: ScreenshotSaveResult
  }
  'screenshot.settings.get': { req: void; res: ScreenshotSettings }
  'screenshot.settings.set': { req: Partial<ScreenshotSettings>; res: ScreenshotSettings }
  'screenshot.pin.close': { req: { id: string }; res: { ok: boolean } }
  'screenshot.pin.drag': { req: { dx: number; dy: number }; res: { ok: boolean } }
  'screenshot.pin.payload': {
    req: { id: string }
    res: { ok: boolean; dataUrl?: string; width?: number; height?: number }
  }

  // ─────────── 录屏（旧 screenRecorder 通道，暂保留；见 docs/modules/07-screen-recorder.md） ───────────
  'screenRecorder.start': {
    req: { sources: { screen?: string; camera?: string }; mic: boolean }
    res: { recordingId: string }
  }
  'screenRecorder.stop': {
    req: { recordingId: string }
    res: { ok: boolean }
  }
  'screenRecorder.addMarker': {
    req: { recordingId: string; timeMs: number; label?: string }
    res: { markerId: string }
  }

  // ─────────── 图片管理 ───────────
  'photos.list': {
    req: { limit?: number; offset?: number }
    // 注：Photo 类型在 src/preload/index.d.ts 中 declared（不是 module export），
    // 通过 import type 无法直接拿到，使用 unknown 占位；运行后再迁移到共享类型。
    res: { items: unknown[]; total: number }
  }
  'photos.import': {
    req: { folderPath: string }
    res: { added: number }
  }

  // ─────────── 主题 ───────────
  'preferences.getTheme': {
    req: void
    res: 'light' | 'dark' | 'system'
  }
  'preferences.setTheme': {
    req: { theme: 'light' | 'dark' | 'system' }
    res: { saved: boolean }
  }

  // ─────────── 日志 / 反馈 ───────────
  'feedback.exportLog': {
    req: { sinceMs?: number }
    res: { filePath: string; entries: number }
  }

  // ─────────── 更新 ───────────
  'updater.check': {
    req: void
    res: { hasUpdate: boolean; version?: string; releaseNotes?: string }
  }
  'updater.download': {
    req: void
    res: { ok: boolean }
  }
  'updater.install': {
    req: void
    res: { ok: boolean }
  }

  // ─────────── 录制（1.0 新通道；基于 SQLite repos；旧 recording-history:* / recording-settings:* /
  //                   screen-recorder:* 暂保留 6 个月，见 docs/modules/07-screen-recorder.md）───────────
  'recording.list': {
    req: {
      filter?: {
        status?: RecordingStatus | RecordingStatus[]
        search?: string
        sinceMs?: number
        untilMs?: number
      }
      limit?: number
      offset?: number
    }
    res: { items: RecordingSummary[]; total: number }
  }
  'recording.get': {
    req: { id: string }
    res: { recording: RecordingSummary | null }
  }
  'recording.delete': {
    req: { id: string; hard?: boolean; deleteFile?: boolean }
    res: { ok: boolean }
  }
  'recording.markers.list': {
    req: { recordingId: string }
    res: { items: Array<{ id: string; timeMs: number; label: string | null; createdAt: number }> }
  }
  'recording.markers.add': {
    req: { recordingId: string; timeMs: number; label?: string | null }
    res: { markerId: string }
  }
  'recording.markers.remove': {
    req: { markerId: string }
    res: { ok: boolean }
  }
  'recording.markers.rename': {
    req: { markerId: string; label: string }
    res: { ok: boolean }
  }
  'recording.settings.get': {
    req: void
    res: RecordingDefaultSettings
  }
  'recording.settings.patch': {
    req: Partial<RecordingDefaultSettings>
    res: RecordingDefaultSettings
  }
  'recording.settings.reset': {
    req: void
    res: RecordingDefaultSettings
  }
  'recording.recovery.scan': {
    req: void
    res: {
      orphans: Array<{
        recordingId: string | null
        filePath: string
        fileSize: number
        mtimeMs: number
      }>
    }
  }
  'recording.recovery.recover': {
    req: { filePath: string }
    res: { recordingId: string }
  }
  'recording.recovery.discard': {
    req: { filePath: string }
    res: { ok: boolean }
  }
  // ── PR-3: 暂停/恢复段管理 ─────────────────────────────────────
  'recording.start': {
    req: { fileName: string; defaultSavePath?: string | null }
    res: { recordingId: string }
  }
  'recording.finalize': {
    req: {
      recordingId: string
      finalFilePath: string
      fileSize: number
      durationMs: number
    }
    res: { ok: boolean }
  }
  'recording.segments.open': {
    req: { recordingId: string }
    res: { segmentId: number; segIndex: number; startedAt: number }
  }
  'recording.segments.close': {
    req: { recordingId: string; segmentId?: number }
    res: { ok: boolean; reason?: 'no open segment' }
  }
  'recording.segments.list': {
    req: { recordingId: string }
    res: {
      items: Array<{
        id: number
        segIndex: number
        startedAt: number
        endedAt: number | null
        state: 'committed' | 'discarded'
      }>
    }
  }
  'recording.segments.totalDuration': {
    req: { recordingId: string; asOf?: number }
    res: { totalMs: number }
  }
  // ── PR-4: 区域选择 / 系统音频探测 ─────────────────────────────
  'recording.region.open': {
    req: void
    res: { region: { x: number; y: number; width: number; height: number } }
  }
  'recording.region.openForDisplay': {
    req: { displayId: number }
    res: {
      region: { x: number; y: number; width: number; height: number }
      displayId: number
      crossDisplay: boolean
    }
  }
  'recording.region.openCrossDisplay': {
    req: void
    res: {
      region: { x: number; y: number; width: number; height: number }
      displayId: number
      crossDisplay: boolean
    }
  }
  'recording.region.listDisplays': {
    req: void
    res: Array<{
      id: number
      bounds: { x: number; y: number; width: number; height: number }
      workArea: { x: number; y: number; width: number; height: number }
      scaleFactor: number
      isPrimary: boolean
    }>
  }
  'recording.region.cancel': {
    req: void
    res: { ok: boolean }
  }
  'recording.systemAudio.probe': {
    req: {
      devices: Array<{ kind: string; deviceId: string; label: string }>
    }
    res: {
      available: boolean
      matches: string[]
      recommendedDeviceId?: string
    }
  }
  // cursor 位置通过 webContents.send 单向推送：
  //   'cursor:position' { x, y }
  //   'cursor:stop' void
  'recording.cursor.start': {
    req: void
    res: { ok: boolean }
  }
  'recording.cursor.stop': {
    req: void
    res: { ok: boolean }
  }
  // PR-5b: 单录制导出（转码）
  'recording.export.start': {
    req: {
      recordingId: string
      sourcePath: string
      outputPath: string
      format: 'mp4' | 'webm' | 'gif'
      resolution: 720 | 1080 | 1440 | 2160
      fps: 30 | 60
      videoBitrateKbps?: number
      audioBitrateKbps?: number
      // PR-6
      introPath?: string
      outroPath?: string
      backgroundMusic?: { path: string; volume?: number }
      transition?: 'fade' | 'cut' | 'slide'
      fadeDurationSec?: number
      // PR-7c
      gifPreset?: 'compact' | 'standard' | 'high'
    }
    res: { jobId: string }
  }
  'recording.export.cancel': {
    req: { jobId: string }
    res: { ok: boolean }
  }
  'recording.export.getInfo': {
    req: { filePath: string }
    res: {
      ok: boolean
      durationSec?: number
      width?: number
      height?: number
      error?: string
    }
  }
  // PR-7a: 全局快捷键
  'recording.shortcut.getConfig': {
    req: void
    res: {
      enabled: boolean
      start: string
      togglePause: string
    }
  }
  'recording.shortcut.setConfig': {
    req: {
      enabled?: boolean
      start?: string
      togglePause?: string
    }
    res: {
      enabled: boolean
      start: string
      togglePause: string
    }
  }
  'recording.shortcut.registered': {
    req: void
    res: { accels: string[] }
  }
  'recording.shortcut.attach': {
    req: void
    res: { ok: boolean }
  }
  'recording.shortcut.detach': {
    req: void
    res: { ok: boolean }
  }
  // PR-7a: pause/resume toggle（由全局快捷键 togglePause 触发）
  'recording.togglePause': {
    req: void
    res: { ok: boolean; paused?: boolean }
  }
  // PR-7b: 倒计时
  'recording.countdown.start': {
    req: { seconds: number; reason: 'recording' }
    res: { ok: true } | { ok: false; error: string }
  }
  'recording.countdown.cancel': {
    req: void
    res: { ok: true }
  }
}

// ─────────── 录制契约专用类型（递归引用 OK；放置在 IpcContract 之后） ───────────
export type RecordingStatus =
  | 'recording'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'recovered'
  | 'discarded'

export interface RecordingSummary {
  id: string
  filePath: string
  fileName: string
  durationMs: number
  fileSize: number
  width: number | null
  height: number | null
  fps: number
  hasCamera: boolean
  hasMic: boolean
  hasSystemAudio: boolean
  status: RecordingStatus
  quality: 'low' | 'medium' | 'high' | 'source'
  cursorStyle: 'halo' | 'highlight' | 'click-ring' | null
  startedAt: number
  endedAt: number | null
  recoveredAt: number | null
  thumbnailPath: string | null
  description: string | null
}

export interface RecordingDefaultSettings {
  fps: 30 | 60
  quality: 'low' | 'medium' | 'high' | 'source'
  cursor: 'halo' | 'highlight' | 'click-ring'
  defaultSavePath: string | null
  micDefault: string | null
  systemDefault: string | null
  hasCamera: boolean
  hasMic: boolean
  hasSystemAudio: boolean
}

// ─────────── 截图契约专用类型 ───────────
export interface ScreenshotRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenshotSettings {
  shortcutEnabled: boolean
  format: 'png' | 'jpg'
  /** 1-100，仅 jpg 有效 */
  quality: number
  /** 空串 = <当前资源库>/screenshots */
  saveDir: string
  /** 入库时自动添加「截图」标签 */
  autoTag: boolean
}

export interface ScreenshotSaveRequest {
  dataUrl: string
  displayId: number
  region: ScreenshotRegion
  actions: { library: boolean; clipboard: boolean; file: boolean; pin: boolean }
}

export interface ScreenshotSaveRequest {
  dataUrl: string
  displayId: number
  region: ScreenshotRegion
  actions: { library: boolean; clipboard: boolean; file: boolean; pin: boolean }
}

export interface ScreenshotSaveResult {
  ok: boolean
  error?: string
  filePath?: string
  photoId?: string
  pinId?: string
}

// ─────────── 截图契约专用类型 ───────────
export interface ScreenshotRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenshotSettings {
  shortcutEnabled: boolean
  format: 'png' | 'jpg'
  /** 1-100，仅 jpg 有效 */
  quality: number
  /** 空串 = <当前资源库>/screenshots */
  saveDir: string
  /** 入库时自动添加「截图」标签 */
  autoTag: boolean
}

export interface ScreenshotSaveResult {
  ok: boolean
  error?: string
  filePath?: string
  photoId?: string
  pinId?: string
}

export type IpcKey = keyof IpcContract
export type IpcRequest<K extends IpcKey> = IpcContract[K]['req']
export type IpcResponse<K extends IpcKey> = IpcContract[K]['res']

/**
 * 注册每个 IPC 通道。
 * 主进程模块用它来声明一个 channel 必须有 req/res 类型。
 */
export interface IpcRegistration<K extends IpcKey = IpcKey> {
  channel: K
  handler: (req: IpcRequest<K>) => Promise<IpcResponse<K>> | IpcResponse<K>
}
