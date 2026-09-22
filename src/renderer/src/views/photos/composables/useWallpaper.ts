/**
 * Leaf 素材库 · 设为壁纸
 *
 * 三个入口（预览面板 / 右键菜单 / 检查器）共用一个口径：主进程负责按屏判定与出图，
 * 这里只负责取预检结果、摆策略菜单、把适配口径翻译成人话。
 */
import { useToast } from '@composables/useToast'
import { useContextMenu, type MenuItem } from '@composables/useContextMenu'
import type { FitAssessment, WallpaperAdapt, WallpaperMode } from '@shared/wallpaper'

const toast = useToast()
const { open: openMenuAt } = useContextMenu()

/** 三处入口共用同一组文案（index.vue 的右键子菜单也从这里取） */
export const MODE_LABEL: Record<WallpaperMode, string> = {
  auto: '自动适配',
  cover: '居中裁切填满',
  blurred: '模糊留白（不裁内容）',
  original: '原图直设（不处理）'
}

/** 入口只需要这三项，避免与 Photo 全量类型耦合 */
export interface WallpaperAsset {
  filePath: string
  fileName: string
}

const pct = (v: number): string => `${Math.round(v * 100)}%`

/** 菜单顶部的判定行（不可点的说明） */
function describeFit(fit: FitAssessment): string {
  const size = `${fit.screen.width}×${fit.screen.height}`
  if (fit.hasAlpha) return `${size}｜含透明区域，会补成主色底`
  if (fit.strategy === 'original') {
    return `${size}｜比例吻合${fit.upscaleNeed > 1.02 ? '（原图会被放大铺满）' : ''}`
  }
  if (fit.strategy === 'cover') return `${size}｜居中裁切会丢掉 ${pct(fit.cropPercent)}`
  // 竖图放横屏时 arDelta 与 cropPercent 数值相同，只报丢弃面积，别把同一个数说两遍
  return `${size}｜硬裁要丢掉 ${pct(fit.cropPercent)}，改用模糊留白`
}

/**
 * toast 文案分两段：标题不受宽度限制，描述区是 max-w-72 + truncate（288px 就省略号），
 * 所以「做了什么 + 出图尺寸」进标题，文件名与原因进描述区。
 */
function adaptTitle(adapt: WallpaperAdapt): string {
  const did: Record<'original' | 'cover' | 'blurred', string> = {
    original: '原图直设',
    cover: `居中裁切 ${pct(adapt.cropPercent)}`,
    blurred: '模糊留白'
  }
  // 原图直设没有出派生图，报屏幕尺寸会让人以为被重采样过
  const size = adapt.strategy === 'original' ? adapt.source : adapt.screen
  return `已设为桌面壁纸 · ${did[adapt.strategy]} ${size.width}×${size.height}`
}

function adaptNotes(adapt: WallpaperAdapt): string {
  const notes: string[] = []
  if (adapt.reasons.includes('transparency')) notes.push('透明区域落主色底')
  if (adapt.reasons.includes('resolution')) notes.push('原图低于屏幕')
  if (adapt.fromPreview) notes.push('按 1024 预览适配')
  return notes.length ? `｜${notes.join(' · ')}` : ''
}

export interface Wallpaper {
  set: (photo: WallpaperAsset, mode?: WallpaperMode) => Promise<boolean>
  openMenu: (photo: WallpaperAsset, x: number, y: number) => Promise<void>
}

export function useWallpaper(): Wallpaper {
  /** 设一张图为壁纸；mode 缺省为 auto（由主进程判定策略）。失败已在内部 toast，返回是否成功。 */
  async function set(photo: WallpaperAsset, mode: WallpaperMode = 'auto'): Promise<boolean> {
    try {
      const result = await window.api.setWallpaper(photo.filePath, undefined, { mode })
      if (!result?.ok) {
        toast.error('设置壁纸失败', { description: result?.error || '未知错误' })
        return false
      }
      const note = result.adapt ? adaptNotes(result.adapt) : ''
      toast.success(result.adapt ? adaptTitle(result.adapt) : '已设为桌面壁纸', {
        description: `${photo.fileName}${note}`
      })
      return true
    } catch (error) {
      toast.error('设置壁纸失败', { description: (error as Error).message })
      return false
    }
  }

  /** 在 (x, y) 展开策略菜单：先取预检结果，让菜单自己说明会裁掉多少 */
  async function openMenu(photo: WallpaperAsset, x: number, y: number): Promise<void> {
    let primary: FitAssessment | undefined
    try {
      const assessed = await window.api.assessWallpaper(photo.filePath)
      primary = assessed?.assessments?.[0]
    } catch {
      /* 预检失败只是少一行说明，不挡菜单 */
    }
    const items: MenuItem[] = []
    if (primary) {
      items.push({ key: 'fit-summary', label: describeFit(primary), disabled: true })
      items.push({ key: 'fit-divider', divider: true })
    }
    const modes: WallpaperMode[] = ['auto', 'cover', 'blurred', 'original']
    for (const mode of modes) {
      items.push({
        key: mode,
        label:
          mode === 'auto' && primary
            ? `自动适配 → ${MODE_LABEL[primary.strategy]}`
            : MODE_LABEL[mode]
      })
    }
    openMenuAt(x, y, items, (key) => {
      void set(photo, key as WallpaperMode)
    })
  }

  return { set, openMenu }
}
