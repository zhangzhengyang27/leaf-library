/**
 * 跨进程共享 · 文件名基础名（不含扩展名）合法化。
 *
 * 替换 macOS / Windows 通配非法字符与控制字符为 '-'；供批量重命名
 * （F2，渲染端渲染 token 后兜底）与主进程 renameFiles（最终落盘前兜底）共用。
 */
export function sanitizeFileNameBase(name: string): string {
  // \p{Cc} = 控制字符（等价 \x00-\x1f\x7f；避免 no-control-regex 对字面控制的限制）
  const illegal = new RegExp('[\\\\/:*?"<>|\\p{Cc}]', 'gu')
  return name.replace(illegal, '-').trim()
}

/**
 * 批量重命名模板支持的 token（渲染端预览、主进程落盘求值、AI 产出闸口共用同一份词表）。
 *
 * P2 token 扩容：对齐 Eagle 4.0.0 批量重命名（asar 解包 batch-rename-modal.js，
 * 22 种 % 形态 token）。Eagle 用 %N/%D/%B/%M/%T/%F/*，Leaf 沿用自家 {} 命名风格，
 * 逐族映射见各 token 注释与 docs 调研；Eagle 没有的（大小/评分/时长/宽高/id/库名/拍摄日期）
 * 是 Leaf 侧增强，Eagle 的 HM/HMS 时分秒变体暂未跟进（见 BACKLOG 留点）。
 */
export const RENAME_TOKENS = [
  // —— 原有六种 ——
  '{name}', // 原文件名去扩展名（对应 Eagle 的 *）
  '{n}', // 序号（对应 Eagle %N，pad = 补零位数）
  '{date}', // 导入日期 YYYYMMDD（历史约定保留）
  '{time}', // 导入时间 HHmmss（历史约定保留）
  '{parent}', // 所在文件夹名（对应 Eagle %F 的单父简化）
  '{rand}', // 6 位随机串
  // —— P2 新增：日期族（格式对齐 Eagle：%D 家族用连字符、%B/%M 家族用下划线）——
  '{add date}', // 添加日期 YYYY-MM-DD = imported_at（Eagle 插入菜单「添加日期」标签语义）
  '{today}', // 今天 YYYY-MM-DD = 求值时刻（Eagle %D 代码实际取 now 的语义）
  '{create date}', // 创建日期 YYYY_MM_DD = 文件系统创建时间（Eagle %B；btime→mtime→now 回退链）
  '{modified date}', // 修改日期 YYYY_MM_DD = 文件系统修改时间（Eagle %M；mtime→now 回退链）
  '{taken date}', // 拍摄日期 YYYY_MM_DD = EXIF 拍摄时间（Eagle 无此 token；缺失展开空串）
  // —— P2 新增：属性族（Eagle 没有，Leaf 数据源都在 photo_photos）——
  '{size}', // 文件大小，人性化（如 1.5KB / 2MB）
  '{rating}', // 评分 0-5
  '{duration}', // 时长（如 42s / 3m05s / 1h02m03s），缺失展开空串
  '{width}', // 像素宽，缺失展开空串
  '{height}', // 像素高，缺失展开空串
  '{id}', // 素材 id
  '{tags}', // 标签名排序后 '-' 连接（Eagle %T 语义），无标签展开空串
  '{library}' // 库名（注册表取名，photo 库 DB 里没有）
] as const

/**
 * 校验一条命名模板是否可用：只允许已知 token + 合法字面文本。
 * 模型产出的 pattern 必须先过这道闸——它可能吐出 {ext}、{invalid} 甚至带 '/' 的东西，
 * 而批量重命名是直接改磁盘文件的动作。
 */
export function isSafeRenamePattern(pattern: string): boolean {
  const p = pattern.trim()
  if (!p || p.length > 120) return false
  const literal = p.replace(RENAME_TOKEN_NAME_RE, '')
  if (/[{}]/.test(literal)) return false
  return sanitizeFileNameBase(literal) === literal
}

/**
 * token 名匹配正则，从 RENAME_TOKENS 动态推导（单一事实源：加 token 不用改两处）。
 * 长名在前，避免 `{name}` 被 `n` 分支抢先吞掉前缀（正则交替的回溯能救，
 * 但显式按长度降序更不依赖实现细节）。只在模块内/同包使用，不对外。
 */
const RENAME_TOKEN_NAME_RE = buildTokenNameRe()
function buildTokenNameRe(): RegExp {
  const names = RENAME_TOKENS.map((t) => t.slice(1, -1)).sort((a, b) => b.length - a.length)
  return new RegExp(`\\{(${names.join('|')})\\}`, 'g')
}

/** 文件名去扩展名（无扩展名返回原名；点开头的隐藏文件不算扩展名） */
export function stripExt(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx > 0 ? fileName.slice(0, idx) : fileName
}

/**
 * token 求值上下文：渲染端预览与主进程落盘求值共用的**轻量**输入形状。
 * 只描述「求一个名字需要什么」，不要求整张 photo 行——
 * 缺失字段（可选属性）一律展开为**空串**（下面逐字段注明例外），
 * 让 `{taken date}-{name}` 在无 EXIF 时得到 `-IMG_1234` 这种可见的空洞，
 * 由用户在预览里自行调整模板，而不是悄悄编一个假日期。
 */
export interface RenameContext {
  /** 原文件名（含扩展名）；{name} 取去扩展名主干 */
  fileName: string
  /** 导入时间 epoch ms（{date}/{time}/{add date}）；photo_photos.imported_at NOT NULL，必有 */
  importedAt: number
  /** 序号值（{n}）；调用方把起始编号算好再传，主进程冲突跳过占号的语义在调用侧保持 */
  index: number
  /** {n} 补零位数，缺省 1（不补零） */
  pad?: number
  /** 所在文件夹名（{parent}）；缺失/空白回退「未分类」 */
  folderName?: string
  /**
   * 文件系统创建时间 epoch ms（{create date}）；Eagle %B 的回退链：
   * 缺失回退 fsModifiedAt，再缺回退求值时刻
   */
  fsCreatedAt?: number
  /** 文件系统修改时间 epoch ms（{modified date}）；Eagle %M：缺失回退求值时刻 */
  fsModifiedAt?: number
  /** EXIF 拍摄时间 epoch ms（{taken date}）；缺失（截图等无 EXIF 属常态）展开空串 */
  takenAt?: number
  /** 文件大小字节数（{size}）；缺失展开空串 */
  fileSize?: number
  /** 评分 0-5（{rating}）；缺失展开空串 */
  rating?: number
  /** 时长 ms（{duration}）；缺失/非正数展开空串 */
  durationMs?: number
  /** 像素宽（{width}）；缺失展开空串 */
  width?: number
  /** 像素高（{height}）；缺失展开空串 */
  height?: number
  /** 素材 id（{id}）；缺失展开空串 */
  id?: string
  /** 标签名（{tags}，排序后 '-' 连接，Eagle %T 语义）；缺失/空数组展开空串 */
  tags?: string[]
  /** 库名（{library}）；缺失展开空串 */
  libraryName?: string
  /** 求值时刻 epoch ms（{today} 及日期回退链终点）；缺省 Date.now()，测试注入用 */
  now?: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 本地时区 YYYY-MM-DD（Eagle %D 家族格式） */
function formatDateHyphen(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 本地时区 YYYY_MM_DD（Eagle %B/%M 家族格式，文件系统日期用下划线） */
function formatDateUnderscore(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}_${pad2(d.getMonth() + 1)}_${pad2(d.getDate())}`
}

/** 本地时区 HHmmss（既有 {time} 约定） */
function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

/**
 * 文件大小人性化（{size}）：确定性优先——同字节数永远得到同一个串，
 * 预览与落盘、两端之间才能严格一致。1024 进制，1 位小数去尾零。
 */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes}B`
  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let v = bytes
  let u = -1
  do {
    v /= 1024
    u++
  } while (v >= 1024 && u < units.length - 1)
  const text = v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')
  return `${text}${units[u]}`
}

/**
 * 时长人性化（{duration}）：42s / 3m05s / 1h02m03s。
 * 冒号是文件名非法字符，用字母单位；非正数视为无时长，展开空串。
 */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h${pad2(m)}m${pad2(s)}s`
  if (m > 0) return `${m}m${pad2(s)}s`
  return `${s}s`
}

/**
 * 单个 token → 值。日期格式对齐 Eagle：%D 家族（今天/添加日期）连字符、
 * %B/%M 家族（创建/修改）下划线；{taken date} 归入文件/内容侧用下划线。
 */
function renderToken(token: string, ctx: RenameContext): string {
  switch (token) {
    case 'name':
      return stripExt(ctx.fileName)
    case 'n':
      return String(ctx.index).padStart(Math.max(1, ctx.pad ?? 1), '0')
    case 'date': {
      // 既有约定保持：无分隔符 YYYYMMDD
      const d = new Date(ctx.importedAt)
      return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
    }
    case 'time':
      return formatTime(ctx.importedAt)
    case 'parent':
      return ctx.folderName?.trim() || '未分类'
    case 'rand':
      // 预览与实际值会不同（Eagle 随机命名同理），已在帮助文案注明
      return Math.random().toString(36).slice(2, 8).padEnd(6, '0')
    case 'add date':
      return formatDateHyphen(ctx.importedAt)
    case 'today':
      return formatDateHyphen(ctx.now ?? Date.now())
    case 'create date': {
      // Eagle %B 回退链：btime → mtime → now
      const ts = ctx.fsCreatedAt ?? ctx.fsModifiedAt ?? ctx.now ?? Date.now()
      return formatDateUnderscore(ts)
    }
    case 'modified date': {
      // Eagle %M 回退链：mtime → now
      return formatDateUnderscore(ctx.fsModifiedAt ?? ctx.now ?? Date.now())
    }
    case 'taken date':
      return ctx.takenAt ? formatDateUnderscore(ctx.takenAt) : ''
    case 'size':
      return ctx.fileSize === undefined ? '' : formatSize(ctx.fileSize)
    case 'rating':
      return ctx.rating === undefined ? '' : String(Math.round(ctx.rating))
    case 'duration':
      return ctx.durationMs === undefined ? '' : formatDuration(ctx.durationMs)
    case 'width':
      return ctx.width === undefined ? '' : String(ctx.width)
    case 'height':
      return ctx.height === undefined ? '' : String(ctx.height)
    case 'id':
      return ctx.id ?? ''
    case 'tags':
      // Eagle %T：排序后 '-' 连接；无标签空串（连分隔符都不留）
      return ctx.tags && ctx.tags.length > 0 ? [...ctx.tags].sort().join('-') : ''
    case 'library':
      return ctx.libraryName ?? ''
    default:
      // 类型上到不了这里（RENAME_TOKENS 全覆盖），保底按未知 token 原样保留
      return `{${token}}`
  }
}

/**
 * token 求值纯函数：pattern 里所有已知 token 换成值，未知 {x} 原样保留
 * （安全闸 isSafeRenamePattern 会拦住含未知花括号的模型产出；用户手输的
 * 未知 token 落成字面量，预览可见，与既有约定一致）。
 * 只做 token 展开——正则替换、大小写、合法化兜底在调用侧按固定顺序接力。
 */
export function evaluateRenameTokens(pattern: string, ctx: RenameContext): string {
  return pattern.replace(RENAME_TOKEN_NAME_RE, (_, token: string) => renderToken(token, ctx))
}
