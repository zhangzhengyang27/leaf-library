/**
 * 十五轮批5：素材动作宏（Eagle ✦ 动作系统的 Leaf 自研 MVP）
 *
 * - 动作 = 有序步骤集，对「当前选中」按序批量执行；定义存 localStorage（leaf.macros.v1）
 * - 步骤类型：重命名 / 添加标签 / 评分 / 备注 / 转 WebP / 移入文件夹
 * - 执行失败即中断并提示已完成进度；与 Eagle 的差异：无宏录制器（手工编排）、无全局快捷键绑定
 */
import { ref } from 'vue'
import { useToast } from './useToast'

export type MacroStep =
  | { type: 'rename'; pattern: string }
  | { type: 'addTags'; tags: string }
  | { type: 'rating'; value: number }
  | { type: 'description'; text: string }
  | { type: 'webp' }
  | { type: 'moveToFolder'; folderId: string }

export interface AssetMacro {
  id: string
  name: string
  steps: MacroStep[]
}

const STORAGE_KEY = 'leaf.macros.v1'

function load(): AssetMacro[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m): m is AssetMacro =>
        !!m &&
        typeof (m as AssetMacro).id === 'string' &&
        typeof (m as AssetMacro).name === 'string' &&
        Array.isArray((m as AssetMacro).steps)
    )
  } catch {
    return []
  }
}

const macros = ref<AssetMacro[]>(load())

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(macros.value))
  } catch {
    /* 忽略 */
  }
}

export function useAssetMacros(): {
  macros: typeof macros
  save: (macro: AssetMacro) => void
  remove: (id: string) => void
  runMacro: (macro: AssetMacro, ids: string[]) => Promise<boolean>
} {
  const toast = useToast()

  function save(macro: AssetMacro): void {
    const i = macros.value.findIndex((m) => m.id === macro.id)
    if (i >= 0) macros.value.splice(i, 1, macro)
    else macros.value.push(macro)
    persist()
  }

  function remove(id: string): void {
    macros.value = macros.value.filter((m) => m.id !== id)
    persist()
  }

  /** 对选中素材按序执行；失败中断，返回是否全部成功 */
  async function runMacro(macro: AssetMacro, ids: string[]): Promise<boolean> {
    if (ids.length === 0) {
      toast.warning('请先选中素材再运行动作')
      return false
    }
    const { usePhotoActions } = await import('@views/photos/composables/usePhotoActions')
    const actions = usePhotoActions()
    for (const [i, step] of macro.steps.entries()) {
      try {
        switch (step.type) {
          case 'rename':
            await window.api.photos.renamePhotos(
              ids.map((id, idx) => ({ id, pattern: step.pattern, start: idx + 1 }))
            )
            break
          case 'addTags': {
            const tags = step.tags
              .split(/[\s,，、]+/)
              .map((t) => t.trim())
              .filter(Boolean)
            for (const tag of tags) await actions.addTagToMany(ids, tag)
            break
          }
          case 'rating':
            await actions.handleBatchUpdate(ids, { rating: step.value })
            break
          case 'description':
            await actions.handleBatchUpdate(ids, { description: step.text })
            break
          case 'webp':
            await actions.handleConvertToWebP(ids)
            break
          case 'moveToFolder':
            await window.api.photos.assignPhotosToFolder(step.folderId, ids)
            break
        }
      } catch (error) {
        toast.error(`动作「${macro.name}」第 ${i + 1} 步失败`, {
          description: (error as Error).message
        })
        return false
      }
    }
    toast.success(`动作「${macro.name}」已应用于 ${ids.length} 项`)
    return true
  }

  return { macros, save, remove, runMacro }
}
