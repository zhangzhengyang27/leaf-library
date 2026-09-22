/**
 * 视频预览的同目录字幕（P1，Eagle 的「自动挂同目录 SRT/VTT」）
 *
 * 渲染层拿到的是一段 WebVTT 文本，自己包成 blob: URL 喂 `<track src>`：
 *  - CSP 的 `media-src` 已经放行 blob:（index.html），不用为新协议开口子；
 *  - blob: 与文档同源，Chromium 对跨源文本轨的 CORS 检查在这里不会咬人
 *    （真机踩过的是 `<video crossorigin>` 那条，两回事）。
 *
 * 换素材/卸载时必须 revokeObjectURL：预览是按 `:key` 重建元素的，
 * 只增不销的话一次浏览几十个视频就把整段字幕文本留在内存里。
 */
import { ref, watch, onUnmounted, type Ref } from 'vue'

export interface VideoSubtitleTrack {
  /** blob: URL，直接进 <track src> */
  src: string
  label: string
  srclang?: string
  default: boolean
}

export function useVideoSubtitles(photoId: () => string | undefined): {
  subtitleTracks: Ref<VideoSubtitleTrack[]>
} {
  const subtitleTracks = ref<VideoSubtitleTrack[]>([])
  let liveUrls: string[] = []
  // 连按方向键翻视频时后到的响应会覆盖先到的；用序号把过期结果丢掉
  let seq = 0

  function revoke(): void {
    for (const url of liveUrls) URL.revokeObjectURL(url)
    liveUrls = []
  }

  async function load(id: string | undefined): Promise<void> {
    const mine = ++seq
    revoke()
    subtitleTracks.value = []
    if (!id) return
    let list: Awaited<ReturnType<typeof window.api.video.subtitles>>
    try {
      list = await window.api.video.subtitles(id)
    } catch {
      return // 探测失败不该影响播放本身
    }
    if (mine !== seq) return
    const tracks: VideoSubtitleTrack[] = []
    for (const t of list) {
      const url = URL.createObjectURL(new Blob([t.vtt], { type: 'text/vtt' }))
      liveUrls.push(url)
      tracks.push({ src: url, label: t.label, srclang: t.srclang, default: t.isDefault })
    }
    subtitleTracks.value = tracks
  }

  watch(photoId, (id) => void load(id), { immediate: true })
  onUnmounted(revoke)

  return { subtitleTracks }
}
