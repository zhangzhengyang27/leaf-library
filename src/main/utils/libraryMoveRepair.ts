/**
 * F17：库目录移动后的引用修复计划（纯函数，便于单测）。
 *
 * 前提：库目录被整体挪动后，reference 模式下 file_path 仍指向旧根。
 * 对每个 missing 素材：求其在旧根下的相对路径（越界跳过），拼到新根下
 * 并用 exists 回调验证（默认 existsSync 语义，调用方注入）。
 */
import { isAbsolute, join, relative } from 'path'

export interface MoveRepairItem {
  id: string
  filePath: string
}

export interface MoveRepairPlanItem {
  id: string
  newPath: string
}

export function planLibraryMoveRepair(
  missing: MoveRepairItem[],
  oldRoot: string,
  newRoot: string,
  exists: (p: string) => boolean
): MoveRepairPlanItem[] {
  const oldNorm = oldRoot.replace(/[\\/]+$/, '')
  const newNorm = newRoot.replace(/[\\/]+$/, '')
  const out: MoveRepairPlanItem[] = []
  for (const it of missing) {
    const rel = relative(oldNorm, it.filePath)
    // 不在旧根内（越界/跨盘）→ 无法按相对结构映射
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue
    const candidate = join(newNorm, rel)
    if (candidate !== it.filePath && exists(candidate)) out.push({ id: it.id, newPath: candidate })
  }
  return out
}
