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
  rmSync,
  statSync,
  realpathSync
} from 'fs'
import { dirname, join, resolve, sep } from 'path'
import { createWriteStream, mkdirSync } from 'fs'
import { app } from 'electron'
import yauzl from 'yauzl'
import type { ManagedPlugin, PluginCategory, PluginManifest, InstalledPlugin } from '@shared/plugin'
import { prefRepository } from '../db/repos/PrefRepository'
import type { PrefRepository } from '../db/repos/PrefRepository'


const PLUGIN_ROOT = 'plugins'
const EXTRA_DIR_PREF = 'plugins:extraDir'
const ENABLED_PREF_PREFIX = 'plugins:enabled:'

function parseManifest(dir: string): PluginManifest | null {
  try {
    const raw = readFileSync(join(dir, 'manifest.json'), 'utf-8')
    const m = JSON.parse(raw) as Partial<PluginManifest>
    if (!m.id || !m.name || !m.version || !m.category || !m.entry) return null
    // D-025 终审 C1：id 参与目录名拼接（join(root, id)），不做字符集校验等于给
    // 恶意包一条「../../ 任意写盘」的路。目录名只允许安全字符。
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(m.id))) return null
    // category 枚举校验（审查 P3-11）：非法值会让渲染层 PluginCategory switch 静默落空
    const VALID_CATEGORIES: PluginCategory[] = ['inspector', 'format', 'window', 'development']
    if (!VALID_CATEGORIES.includes(m.category)) return null
    return {
      id: String(m.id),
      name: String(m.name),
      version: String(m.version),
      category: m.category,
      entry: String(m.entry),
      description: m.description ? String(m.description) : undefined,
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

  /** 启停：pref 键缺失 = 启用（存量兼容，D-025） */
  isEnabled(id: string): boolean {
    return this.prefs.get(ENABLED_PREF_PREFIX + id) !== 'false'
  }

  setEnabled(id: string, enabled: boolean): { ok: boolean; error?: string } {
    if (!this.list().some((p) => p.id === id)) return { ok: false, error: `插件不存在: ${id}` }
    this.prefs.set(ENABLED_PREF_PREFIX + id, enabled ? 'true' : 'false')
    return { ok: true }
  }

  /** 中心面板视图：userData 安装件 + extraDir 开发者件，带 enabled 与来源 */
  listAll(): ManagedPlugin[] {
    const builtinIds = new Set(this.listBuiltin().map((p) => p.id))
    const extra = this.getExtraDir()
    const out: ManagedPlugin[] = []
    const seen = new Set<string>()
    const push = (dir: string, source: ManagedPlugin['source']) => {
      const m = parseManifest(dir)
      if (!m || seen.has(m.id)) return
      seen.add(m.id)
      out.push({ ...m, formats: m.formats ?? [], dir, enabled: this.isEnabled(m.id), source })
    }
    for (const dir of listPluginDirs(this.root)) {
      const id = parseManifest(dir)?.id ?? ''
      push(dir, builtinIds.has(id) ? 'builtin' : 'imported')
    }
    if (extra) for (const dir of listPluginDirs(extra)) push(dir, 'dev')
    return out
  }

  /** 卸载：只删 userData/plugins 安装件（extraDir 开发者目录与内置原件不归卸载管）；幂等 */
  uninstall(id: string): { ok: boolean; error?: string } {
    const installed = this.list().find((p) => p.id === id)
    if (!installed) return { ok: false, error: `插件不存在或未安装: ${id}` }
    const resolvedDir = resolve(installed.dir)
    if (!resolvedDir.startsWith(resolve(this.root) + sep))
      return { ok: false, error: '该插件来自开发者目录，请在设置中移除自定义目录或手动删除' }
    try {
      rmSync(resolvedDir, { recursive: true, force: true })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  /**
   * 导入 .leafplugin（zip）：解到临时目录 → manifest/entry 校验 → 同 id 冲突检查 →
   * 落 userData/plugins/<id>/。zip slip（entry 逃逸目标目录）整包拒绝。
   * 同 id 已装 P1 拒绝（版本覆盖升级属 P3，spec §2.5）。
   */
  async importPlugin(zipPath: string): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!existsSync(zipPath)) return { ok: false, error: '插件包不存在' }
    const tempDir = join(this.root, `.import-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    try {
      mkdirSync(tempDir, { recursive: true })
      const extractRes = await this.extractPluginZip(zipPath, tempDir)
      if (!extractRes.ok) return { ok: false, error: extractRes.error }
      const m = parseManifest(tempDir)
      if (!m) return { ok: false, error: '包内 manifest.json 缺失或非法' }
      if (m.entry.includes('..') || resolve(tempDir, m.entry).startsWith(resolve(tempDir) + sep) === false)
        return { ok: false, error: `入口文件路径非法: ${m.entry}` }
      if (!existsSync(join(tempDir, m.entry)))
        return { ok: false, error: `入口文件缺失: ${m.entry}` }
      mkdirSync(this.root, { recursive: true })
      const target = join(this.root, m.id)
      // C1 双保险：id 校验之后仍断言落点在 root 内（不信任上游单层防线）
      if (!resolve(target).startsWith(resolve(this.root) + sep))
        return { ok: false, error: '插件 id 非法（解析后越出插件目录）' }
      if (existsSync(target)) return { ok: false, error: '已安装同 id 插件，请先卸载后再导入' }
      cpSync(tempDir, target, { recursive: true })
      return { ok: true, id: m.id }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }

  /** 解包 zip 到 destDir；zip slip（entry 路径逃逸 destDir）整包拒绝 */
  private extractPluginZip(
    zipPath: string,
    destDir: string
  ): Promise<{ ok: boolean; error?: string }> {
    return new Promise((settle) => {
      yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zip) => {
        if (err || !zip) {
          settle({ ok: false, error: '插件包损坏或不是有效的 zip' })
          return
        }
        const safeRoot = resolve(destDir) + sep
        let failed: string | null = null
        zip.on('entry', (entry: yauzl.Entry) => {
          if (failed) return
          const name = entry.fileName
          if (name.endsWith('/')) {
            zip.readEntry()
            return
          }
          if (name.includes('\0') || name.includes('..') || resolve(destDir, name).startsWith(safeRoot) === false) {
            failed = `包内含不安全的路径: ${name}`
            zip.close()
            settle({ ok: false, error: failed })
            return
          }
          zip.openReadStream(entry, (serr, stream) => {
            if (serr || !stream) {
              failed = '包内条目无法读取'
              zip.close()
              settle({ ok: false, error: failed })
              return
            }
            const target = resolve(destDir, name)
            mkdirSync(dirname(target), { recursive: true })
            const out = createWriteStream(target)
            out.on('close', () => zip.readEntry())
            out.on('error', () => {
              failed = '解包写盘失败'
              zip.close()
              settle({ ok: false, error: failed })
            })
            // I2：读流（inflate）出错必须有人接——无监听的 'error' 事件是未捕获异常，
            // 损坏/构造的包可以击穿主进程
            stream.on('error', (streamErr) => {
              failed = `包内条目解压失败: ${(streamErr as Error).message}`
              out.destroy()
              zip.close()
              settle({ ok: false, error: failed })
            })
            stream.pipe(out)
          })
        })
        zip.on('end', () => {
          if (!failed) settle({ ok: true })
        })
        zip.on('error', () => settle({ ok: false, error: '插件包损坏或不是有效的 zip' }))
        // lazyEntries 起泵：注册完监听后必须先读一条，entry/end 事件才会开始流动
        zip.readEntry()
      })
    })
  }

  /**
   * 两段式导入第一段：解包到临时目录解析 manifest 后即弃（不落盘），
   * 回传安装确认所需的元数据。校验口径与 importPlugin 完全一致。
   */
  async inspectPlugin(zipPath: string): Promise<{
    ok: boolean
    error?: string
    meta?: { id: string; name: string; version: string; category: PluginCategory; description?: string; permissions: string[] }
  }> {
    if (!existsSync(zipPath)) return { ok: false, error: '插件包不存在' }
    const tempDir = join(this.root, `.inspect-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    try {
      mkdirSync(tempDir, { recursive: true })
      const extractRes = await this.extractPluginZip(zipPath, tempDir)
      if (!extractRes.ok) return { ok: false, error: extractRes.error }
      const m = parseManifest(tempDir)
      if (!m) return { ok: false, error: '包内 manifest.json 缺失或非法' }
      if (m.entry.includes('..') || resolve(tempDir, m.entry).startsWith(resolve(tempDir) + sep) === false)
        return { ok: false, error: `入口文件路径非法: ${m.entry}` }
      if (!existsSync(join(tempDir, m.entry))) return { ok: false, error: `入口文件缺失: ${m.entry}` }
      return {
        ok: true,
        meta: {
          id: m.id,
          name: m.name,
          version: m.version,
          category: m.category,
          description: m.description,
          permissions: m.permissions ?? []
        }
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
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
