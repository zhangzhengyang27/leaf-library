/**
 * Leaf · 借 macOS 系统能力出「代表图」（G4 格式面）
 *
 * 目标是 Eagle 那批我们没有任何解码器的文件：相机 RAW、Office、设计/矢量、mindmap。
 * Eagle 自己也不是自己解——macOS 上第一档就是 `nativeImage.createThumbnailFromPath`
 * （ImageIO/QuickLook），第二档才轮到 dcraw/uc 之类。这里同构：sips（ImageIO）→ qlmanage（QuickLook）。
 *
 * **超时是硬要求，不是保险丝**：实测 `qlmanage -t` 对一个 .hdr 直接不返回（挂满 2 分钟无产物），
 * 而缩略图管线是队列串行消费的，一次挂起会卡住后面所有素材。
 *
 * 已实测可用：.docx → 246×400 真 PNG。未实测（本机没有样本，不做能力声明）：相机 RAW、
 * .ai/.indd/.sketch 等需要相应 QuickLook 生成器在位的场景——失败一律走原扩展名徽章兜底。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { platform } from 'node:os'

const execFileAsync = promisify(execFile)

/** 小于这个字节数的"PNG"基本是空图/占位图，不算成功（与字母卡兜底等价，别当真图用） */
const MIN_VALID_BYTES = 1024

function looksLikeImage(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).size >= MIN_VALID_BYTES
  } catch {
    return false
  }
}

/** sips 档：ImageIO 支持的范围（含多数相机 RAW 的内嵌预览、HEIC、PDF 等） */
async function viaSips(filePath: string, outPng: string, px: number): Promise<boolean> {
  try {
    // execFile + 数组参数：文件名可能含 $(...) / 反引号，绝不走 shell
    await execFileAsync(
      'sips',
      ['-s', 'format', 'png', '-Z', String(px), filePath, '--out', outPng],
      { timeout: 12_000 }
    )
    return looksLikeImage(outPng)
  } catch {
    return false
  }
}

/** QuickLook 档：Finder 里能看到缩略图的都在这里（Office/设计/CAD/mindmap） */
async function viaQuickLook(filePath: string, outPng: string, px: number): Promise<boolean> {
  const outDir = mkdtempSync(join(tmpdir(), 'leaf-ql-'))
  try {
    await execFileAsync('qlmanage', ['-t', '-s', String(px), '-o', outDir, filePath], {
      timeout: 10_000
    })
    const produced = join(outDir, `${basename(filePath)}.png`)
    if (!looksLikeImage(produced)) return false
    copyFileSync(produced, outPng)
    return looksLikeImage(outPng)
  } catch {
    return false
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

/**
 * 出一张不超过 px 边长的 PNG 到 outPng。
 * @returns 成功与否；失败时调用方保持原样（字母卡），不落"坏图"
 */
export async function renderSystemPreview(
  filePath: string,
  outPng: string,
  px = 1024
): Promise<boolean> {
  if (platform() !== 'darwin') return false
  rmSync(outPng, { force: true })
  if (await viaSips(filePath, outPng, px)) return true
  rmSync(outPng, { force: true })
  if (await viaQuickLook(filePath, outPng, px)) return true
  rmSync(outPng, { force: true })
  return false
}
