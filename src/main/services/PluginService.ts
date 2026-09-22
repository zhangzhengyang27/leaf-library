/**
 * Leaf · PluginService（阶段 5.1 插件系统 MVP，D-014）
 *
 * - 插件 = 本地目录：userData/plugins/<id>/ 或自定义目录（pref key `plugins:extraDir`）
 * - 每个插件目录含 manifest.json：{ id, name, version, category, entry, permissions, formats }
 * - category：inspector（检查器区块）/ format（格式预览渲染器）/ window / development
 * - 沙箱：渲染层 sandbox iframe + postMessage 白名单桥（不开 nodeIntegration），本服务只负责
 *   扫描、manifest 解析与文件读取；运行环境全在渲染层 iframe。
 */
import {
  cpSync,
  readdirSync,
  readFileSync,
  existsSync,
  lstatSync,
  statSync,
  realpathSync
} from 'fs'
import { join, resolve, sep } from 'path'
import { app } from 'electron'
import { prefRepository } from '../db/repos/PrefRepository'
import type { PrefRepository } from '../db/repos/PrefRepository'

export type PluginCategory = 'inspector' | 'format' | 'window' | 'development'

export interface PluginManifest {
  id: string
  name: string
  version: string
  category: PluginCategory
  /** 相对插件目录的入口 HTML（如 index.html） */
  entry: string
  /** 声明的能力（保留字段，MVP 未执行） */
  permissions?: string[]
  /** format 类插件声明的扩展名（不含点，小写），如 ['txt','md'] */
  formats?: string[]
}

export interface InstalledPlugin {
  id: string
  name: string
  version: string
  category: PluginCategory
  entry: string
  formats: string[]
  dir: string
}

const PLUGIN_ROOT = 'plugins'
const EXTRA_DIR_PREF = 'plugins:extraDir'

function parseManifest(dir: string): PluginManifest | null {
  try {
    const raw = readFileSync(join(dir, 'manifest.json'), 'utf-8')
    const m = JSON.parse(raw) as Partial<PluginManifest>
    if (!m.id || !m.name || !m.version || !m.category || !m.entry) return null
    // category 枚举校验（审查 P3-11）：非法值会让渲染层 PluginCategory switch 静默落空
    const VALID_CATEGORIES: PluginCategory[] = ['inspector', 'format', 'window', 'development']
    if (!VALID_CATEGORIES.includes(m.category)) return null
    return {
      id: String(m.id),
      name: String(m.name),
      version: String(m.version),
      category: m.category,
      entry: String(m.entry),
      permissions: Array.isArray(m.permissions) ? m.permissions.map(String) : [],
      formats: Array.isArray(m.formats) ? m.formats.map((f) => f.toLowerCase()) : []
    }
  } catch {
    return null
  }
}

function listPluginDirs(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const name of readdirSync(root)) {
    const p = join(root, name)
    try {
      if (statSync(p).isDirectory()) out.push(p)
    } catch {
      /* ignore */
    }
  }
  return out
}

export class PluginService {
  constructor(
    private readonly userDataPath?: string,
    private readonly prefs: Pick<PrefRepository, 'get' | 'set'> = prefRepository,
    private readonly builtinRoot?: string
  ) {}

  private get root(): string {
    return this.userDataPath ?? join(app.getPath('userData'), PLUGIN_ROOT)
  }

  /**
   * 内置插件目录（打包后 = resources/plugins，extraResources 带入）。
   *
   * 开发态不能只信 app.getAppPath()：它返回的是主入口所在目录——
   * `pnpm dev` 下是仓库根，而 `electron out/main/index.js` / `electron-vite preview`
   * 下是 out/main，于是内置插件市场整个扫空。按候选顺序取第一个真实存在的目录。
   */
  private get builtin(): string {
    if (this.builtinRoot) return this.builtinRoot
    const candidates = app.isPackaged
      ? [join(process.resourcesPath, PLUGIN_ROOT)]
      : [
          join(app.getAppPath(), PLUGIN_ROOT),
          join(process.cwd(), PLUGIN_ROOT),
          // out/main 或 out/ 启动时回到仓库根
          join(__dirname, '..', '..', '..', PLUGIN_ROOT),
          join(__dirname, '..', '..', PLUGIN_ROOT)
        ]
    const hit = candidates.find((p) => existsSync(p))
    return hit ?? join(app.getAppPath(), PLUGIN_ROOT)
  }

  getExtraDir(): string {
    return this.prefs.get(EXTRA_DIR_PREF) ?? ''
  }

  setExtraDir(dir: string): void {
    this.prefs.set(EXTRA_DIR_PREF, dir.trim().replace(/\/+$/, ''))
  }

  /** 扫描全部插件目录（默认 + 自定义），返回解析成功的插件列表 */
  list(): InstalledPlugin[] {
    const roots = [this.root]
    const extra = this.getExtraDir()
    if (extra) roots.push(extra)
    const out: InstalledPlugin[] = []
    const seen = new Set<string>()
    for (const root of roots) {
      for (const dir of listPluginDirs(root)) {
        const m = parseManifest(dir)
        if (!m || seen.has(m.id)) continue
        seen.add(m.id)
        out.push({ ...m, formats: m.formats ?? [], dir })
      }
    }
    return out
  }

  /** 市场：内置插件清单（仓库 plugins/ 或打包资源） */
  listBuiltin(): InstalledPlugin[] {
    const out: InstalledPlugin[] = []
    for (const dir of listPluginDirs(this.builtin)) {
      const m = parseManifest(dir)
      if (m) out.push({ ...m, formats: m.formats ?? [], dir })
    }
    return out
  }

  /** 安装内置插件 → userData/plugins/<id>/（已存在则跳过） */
  installBuiltin(id: string): { ok: boolean; error?: string } {
    const builtin = this.listBuiltin().find((p) => p.id === id)
    if (!builtin) return { ok: false, error: `builtin plugin not found: ${id}` }
    const target = join(this.root, id)
    if (existsSync(target)) return { ok: false, error: 'already installed' }
    try {
      cpSync(builtin.dir, target, { recursive: true })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  /** 读插件内文件（限定在插件目录内：防路径穿越 + 反符号链接 + 大小上限） */
  readAsset(
    pluginId: string,
    relativePath: string
  ): { ok: true; content: string } | { ok: false; error: string } {
    if (relativePath.includes('\0')) return { ok: false, error: 'invalid path' }
    const plugin = this.list().find((p) => p.id === pluginId)
    if (!plugin) return { ok: false, error: `plugin not found: ${pluginId}` }
    const target = resolve(plugin.dir, relativePath)
    // 前缀边界：target 必须严格在 plugin.dir 内（`a` 前缀不应放行 `ab`）
    if (target !== plugin.dir && !target.startsWith(plugin.dir + sep)) {
      return { ok: false, error: 'invalid path' }
    }
    try {
      // 代码审查 P0-2：反符号链接逃逸。
      // 1) 目标本身是软链 → 拒绝；2) 真实目标必须落在真实插件目录内。
      // 注意：不能直接比较 target === realpath(target)——macOS 上 /var → /private/var
      // 是系统软链，正常路径也会被误判。必须两端都 realpath 后再比前缀。
      if (lstatSync(target).isSymbolicLink()) return { ok: false, error: 'symlink denied' }
      const realDir = realpathSync(plugin.dir)
      const realTarget = realpathSync(target)
      if (realTarget !== realDir && !realTarget.startsWith(realDir + sep)) {
        return { ok: false, error: 'symlink denied' }
      }
      if (!statSync(target).isFile()) return { ok: false, error: 'not a file' }
      // 与 photos:readTextFile 对齐的 512KB 上限，防大文件整块读入跨 IPC 传输
      if (statSync(target).size > 512 * 1024) return { ok: false, error: 'file too large' }
      return { ok: true, content: readFileSync(target, 'utf-8') }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }
}

export const pluginService = new PluginService()
