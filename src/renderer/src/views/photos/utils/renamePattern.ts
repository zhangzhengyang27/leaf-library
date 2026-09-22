/**
 * Leaf 素材库 · 批量重命名模板引擎（F2，对齐 Eagle「一键带入命名规则」）
 *
 * 纯渲染函数：token 在渲染端展开为最终基础名（不含扩展名），主进程只负责
 * 落盘前的合法化兜底与冲突跳过。扩展名由主进程按原文件自动保留。
 *
 * 支持token：
 * - {name}   原文件名（不含扩展名）
 * - {n}      序号（index 直传，配合 pad 补零；Eagle 计数器）
 * - {date}   导入日期 YYYYMMDD（本地时区）
 * - {time}   导入时间 HHmmss
 * - {parent} 所在文件夹名（根级/未分组 = 未分类）
 * - {rand}   6 位随机串（预览与实际值会不同，Eagle 随机命名同理）
 * 未识别的 {x} 保持字面量。
 */
import { sanitizeFileNameBase } from '@shared/filename'

export interface RenameTokenContext {
  /** 原文件名（含扩展名） */
  fileName: string
  /** 所在文件夹名；空 = 未分类 */
  folderName?: string
  /** 导入时间（epoch ms） */
  importedAt: number
  /** 序号值（调用方把起始编号加好再传） */
  index: number
  /** {n} 补零位数 */
  pad?: number
}

/** 大小写四态（Eagle 的「转换大小写」） */
export type CaseMode = 'none' | 'upper' | 'lower' | 'title'

/** 展开之后的两步后处理（Eagle 的「替换」与大小写档） */
export interface RenameOptions {
  /** 正则（全局匹配）；不合法时按不替换处理，并由 validateFindPattern 报原因 */
  find?: string
  /** 替换串，支持 $1 捕获组引用 */
  replacement?: string
  /** 大小写四态：不变 / 全大写 / 全小写 / 首字母大写 */
  caseMode?: CaseMode
}

/** 文件名去扩展名（无扩展名返回原名） */
export function stripExt(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx > 0 ? fileName.slice(0, idx) : fileName
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function renderRenameBase(
  pattern: string,
  ctx: RenameTokenContext,
  opts?: RenameOptions
): string {
  const stem = stripExt(ctx.fileName)
  const d = new Date(ctx.importedAt)
  const out = pattern.replace(/\{(name|n|date|time|parent|rand)\}/g, (_, token: string) => {
    switch (token) {
      case 'name':
        return stem
      case 'n':
        return String(ctx.index).padStart(Math.max(1, ctx.pad ?? 1), '0')
      case 'date':
        return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
      case 'time':
        return `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
      case 'parent':
        return ctx.folderName?.trim() || '未分类'
      case 'rand':
        return Math.random().toString(36).slice(2, 8).padEnd(6, '0')
      default:
        return _
    }
  })
  return sanitizeFileNameBase(applyPost(out, opts)) || stem
}

/**
 * 后处理两步的**固定顺序**：token 展开 → 正则替换 → 大小写。
 * 顺序写死并写在这里，是因为反过来会得到不同结果：
 * 先转大写再替换，替换串里手写的 `img_` 就匹配不上；
 * 先替换再转大小写，用户写的正则拿到的是原文件名的大小写。
 */
function applyPost(base: string, opts?: RenameOptions): string {
  let out = base
  if (opts?.find?.trim()) {
    // 非法正则不能抛：预览是逐行跑的，抛一次整个弹窗就崩了。
    // 判错交给 UI 在提交前用 validateFindPattern 单独提示
    try {
      out = out.replace(new RegExp(opts.find, 'g'), opts.replacement ?? '')
    } catch {
      /* 保持原样 */
    }
  }
  const mode = opts?.caseMode ?? 'none'
  if (mode === 'upper') return out.toUpperCase()
  if (mode === 'lower') return out.toLowerCase()
  if (mode === 'title') return titleCase(out)
  return out
}

/** 首字母大写：只在"词首"提升大小写，其余原样保留（不把 IMG_1234 变成 Img_1234 之外的样子） */
function titleCase(s: string): string {
  let atBoundary = true
  let out = ''
  for (const ch of s) {
    if (atBoundary) {
      if (/\p{L}/u.test(ch)) {
        out += ch.toUpperCase()
        atBoundary = false
      } else {
        out += ch
      }
    } else {
      out += ch
      // 分隔符（_ - 空格 . 数字等）之后的字母算下一个词的首字母
      if (!/\p{L}/u.test(ch)) atBoundary = true
    }
  }
  return out
}

/**
 * 提前校验用户写的正则，返回错误信息（合法则 null）。
 * UI 用它把"这条正则不合法"说清楚，而不是让替换静默不生效。
 */
export function validateFindPattern(find: string): string | null {
  const f = find.trim()
  if (f === '') return null
  try {
    new RegExp(f, 'g')
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
