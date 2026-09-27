# 插件中心 P1（离线核心）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 D-014 插件 MVP 上交付 Eagle 形态的离线插件中心：三栏中心面板、每插件启停（即时生效）、卸载、`.leafplugin` 包导入。

**Architecture:** 主进程 PluginService 扩展启停/卸载/导入/listAll；IPC + preload 桥四通道；渲染层新建 `usePluginRegistry` 单例（enabled 过滤），PhotoInspector/PhotoPreview 改读注册表；新 `PluginCenterModal` 三栏面板替换 TitleBar 的 PluginManagerModal 挂载。

**Tech Stack:** TypeScript / Vue3 / better-sqlite3（pref 持久化）/ yauzl（解包，已在依赖）/ 新增 devDep `yazl`（测试里构造 zip 夹具）。

**Spec:** `docs/superpowers/specs/2026-09-27-plugin-center-p1-design.md`（计划与 spec 配套阅读；D-025 决策条目随 Task 10 落 DECISIONS.md）。

## Global Constraints

- **禁止执行 `git commit` / `git add`**（用户 2026-09-27 明确要求：改动完成后留在工作区，由用户审后自行提交）。skill 模板里的 Commit 步骤全部替换为「向用户报告该任务完成」。
- 沙箱边界不变：不开 nodeIntegration；插件运行仍走 sandbox iframe + postMessage 白名单桥。
- 新增用户可见文案一律中文；错误返回 `{ ok: false, error }`（中文 error）。
- 主题色只用 token（text-fg-* / bg-surface-* / border-line-*），不引裸调色板。
- `parseManifest` 的校验逻辑复用不重写；其 category 枚举 {inspector, format, window, development} 不变。
- 运行测试命令一律 `pnpm exec vitest run <路径>`；全量回归用 `pnpm test`。

## Review Focus

1. **zip slip**：恶意包 entry 名含 `../` 或绝对路径——解压不得写出目标目录之外（测试在 Task 3）。
2. **禁用语义回归**：禁用的插件不得再出现在检查器区块与格式渲染器（消费方仍读全量 list 的旧路径是最大风险——Task 5/6 的测试钉住）。
3. **enabled 默认值**：pref 键缺失必须视为启用（存量插件行为不变，Task 1）。
4. **卸载边界**：extraDir 与内置原件绝不删（Task 2）。
5. **同 id 导入**：不静默覆盖已有安装（Task 3）。

---

### Task 1: PluginService 启停 + listAll（enabled/source 字段）

**Files:**
- Modify: `src/main/services/PluginService.ts`
- Test: `src/main/services/__tests__/PluginService.center.test.ts`（新建）

**Interfaces:**
- Consumes: 既有 `parseManifest` / `list()` / `listBuiltin()` / `prefs.get|set`
- Produces: `isEnabled(id: string): boolean`、`setEnabled(id: string, enabled: boolean): { ok: boolean; error?: string }`、`listAll(): ManagedPlugin[]`；`export interface ManagedPlugin extends InstalledPlugin { enabled: boolean; source: 'builtin' | 'imported' | 'dev' }`

- [ ] **Step 1: 写失败测试**（构造：`new PluginService(tmpUserData, fakePrefs, tmpBuiltinRoot)`；fakePrefs 用 `Map<string,string>` 实现 `get/set`）

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PluginService } from '../PluginService'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function makePlugin(dir: string, id: string, category = 'inspector'): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ id, name: id, version: '1.0.0', category, entry: 'index.html', permissions: ['photos:read'] })
  )
  writeFileSync(join(dir, 'index.html'), '<html></html>')
}

describe('PluginService · 中心启停与来源', () => {
  let root: string, builtin: string, extra: string, prefs: Map<string, string>
  beforeEach(() => {
    const t = join(tmpdir(), 'leaf-pc-' + Math.random().toString(36).slice(2))
    root = join(t, 'plugins'); builtin = join(t, 'builtin'); extra = join(t, 'extra')
    mkdirSync(builtin, { recursive: true }); mkdirSync(extra, { recursive: true })
    makePlugin(join(builtin, 'exif-metadata'), 'exif-metadata')
    makePlugin(join(extra, 'dev-plugin'), 'dev-plugin')
    prefs = new Map()
  })
  const svc = () => new PluginService(root, { get: (k) => prefs.get(k), set: (k, v) => prefs.set(k, v) }, builtin)

  it('enabled 默认 true：pref 键缺失视为启用（存量兼容）', () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'exif-metadata'), 'exif-metadata')
    expect(s.isEnabled('exif-metadata')).toBe(true)
    expect(s.listAll().find((p) => p.id === 'exif-metadata')?.enabled).toBe(true)
  })

  it('setEnabled 持久化并可逆；未知 id 拒绝', () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'exif-metadata'), 'exif-metadata')
    expect(s.setEnabled('exif-metadata', false).ok).toBe(true)
    expect(s.isEnabled('exif-metadata')).toBe(false)
    expect(s.setEnabled('exif-metadata', true).ok).toBe(true)
    expect(s.isEnabled('exif-metadata')).toBe(true)
    expect(s.setEnabled('nope', true).ok).toBe(false)
  })

  it('listAll 的 source：内置复制件=builtin、extraDir=dev、userData 非内置来源=imported', () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'exif-metadata'), 'exif-metadata')
    makePlugin(join(root, 'imported-one'), 'imported-one')
    s.installBuiltin('exif-metadata')
    const all = s.listAll()
    expect(all.find((p) => p.id === 'exif-metadata')?.source).toBe('builtin')
    expect(all.find((p) => p.id === 'imported-one')?.source).toBe('imported')
    expect(all.find((p) => p.id === 'dev-plugin')?.source).toBe('dev')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**：`pnpm exec vitest run src/main/services/__tests__/PluginService.center.test.ts` → FAIL（isEnabled/listAll 不存在）

- [ ] **Step 3: 实现**（PluginService.ts）

```ts
export interface ManagedPlugin extends InstalledPlugin {
  enabled: boolean
  source: 'builtin' | 'imported' | 'dev'
}

const ENABLED_PREF_PREFIX = 'plugins:enabled:'

// class PluginService 内：
  isEnabled(id: string): boolean {
    const v = this.prefs.get(ENABLED_PREF_PREFIX + id)
    return v !== 'false' // 缺失 = 启用（存量兼容）
  }

  setEnabled(id: string, enabled: boolean): { ok: boolean; error?: string } {
    if (!this.list().some((p) => p.id === id)) return { ok: false, error: `插件不存在: ${id}` }
    this.prefs.set(ENABLED_PREF_PREFIX + id, enabled ? 'true' : 'false')
    return { ok: true }
  }

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
    for (const dir of listPluginDirs(this.root))
      push(dir, builtinIds.has(parseManifest(dir)?.id ?? '') ? 'builtin' : 'imported')
    if (extra) for (const dir of listPluginDirs(extra)) push(dir, 'dev')
    return out
  }
```

- [ ] **Step 4: 跑测试确认通过**（同 Step 2 命令）→ PASS；`pnpm exec vitest run src/main/services` 全绿

- [ ] **Step 5: 向用户报告 Task 1 完成（不 commit）**

### Task 2: PluginService.uninstall（边界：只删 userData 安装件）

**Files:**
- Modify: `src/main/services/PluginService.ts`
- Test: `src/main/services/__tests__/PluginService.center.test.ts`（追加 describe）

**Interfaces:**
- Produces: `uninstall(id: string): { ok: boolean; error?: string }`

- [ ] **Step 1: 写失败测试**（沿用 Task 1 夹具）

```ts
  it('uninstall 只删 userData 安装件；extraDir 与内置原件拒绝；幂等', () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'exif-metadata'), 'exif-metadata')
    expect(s.uninstall('exif-metadata').ok).toBe(true)
    expect(existsSync(join(root, 'exif-metadata'))).toBe(false)
    expect(s.uninstall('exif-metadata').ok).toBe(true) // 幂等
    expect(s.uninstall('dev-plugin').ok).toBe(false)   // extraDir 不归卸载管
    expect(existsSync(join(extra, 'dev-plugin'))).toBe(true)
    expect(s.uninstall('builtin-only').ok).toBe(false) // 不在 userData/plugins 的 id 拒绝
  })
```

- [ ] **Step 2: 跑测试确认失败**（uninstall 不存在）

- [ ] **Step 3: 实现**

```ts
  uninstall(id: string): { ok: boolean; error?: string } {
    // 安装件 = root 下的目录。extraDir（开发者目录）与内置原件不在 root，天然不在
    // 这张表里——用 dir 归属判定而不是名字比对，防手滑删开发者工作目录
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
```

（`rmSync` 已在 PluginService 的 fs import 里？——没有，需在文件头 import 处补 `rmSync`。）

- [ ] **Step 4: 跑测试通过** + `pnpm exec vitest run src/main/services`
- [ ] **Step 5: 向用户报告 Task 2 完成（不 commit）**

### Task 3: PluginService.importPlugin（.leafplugin 解包）

**Files:**
- Modify: `src/main/services/PluginService.ts`
- Test: `src/main/services/__tests__/PluginService.center.test.ts`（追加）
- Deps: `pnpm add -D yazl`（测试构造 zip；yauzl 只读）

**Interfaces:**
- Consumes: yauzl（读）；`parseManifest`；Task 1 的 root/builtin
- Produces: `importPlugin(zipPath: string): Promise<{ ok: boolean; id?: string; error?: string }>`

- [ ] **Step 1: 测试夹具助手（写 zip）**

```ts
import yazl from 'yazl'
import { ZipFile } from 'yazl'

function makeLeafPlugin(zipPath: string, manifest: object, files: Record<string, string> = {}): void {
  const z = new yazl.ZipFile()
  z.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json')
  z.addBuffer(Buffer.from('<html><body>p</body></html>'), 'index.html')
  for (const [name, content] of Object.entries(files)) z.addBuffer(Buffer.from(content), name)
  z.end()
  // yazl 输出流写盘
  const out = fs.createWriteStream(zipPath)
  ;(z as unknown as { outputStream: NodeJS.ReadableStream }).outputStream.pipe(out)
  return new Promise<void>((res) => out.on('close', () => res()))
}
```

- [ ] **Step 2: 写失败测试**

```ts
  it('importPlugin 合法包：解出 manifest/entry，落 userData/plugins/<id>，source=imported', async () => {
    const s = svc()
    const zip = join(tmpdir(), 'good.leafplugin')
    await makeLeafPlugin(zip, { id: 'nice', name: 'Nice', version: '1.0.0', category: 'inspector', entry: 'index.html', permissions: ['photos:read'] })
    const res = await s.importPlugin(zip)
    expect(res.ok).toBe(true)
    expect(existsSync(join(root, 'nice', 'index.html'))).toBe(true)
    expect(s.listAll().find((p) => p.id === 'nice')?.source).toBe('imported')
  })

  it('importPlugin：zip slip（../ 逃逸）整包拒绝', async () => {
    const s = svc()
    const zip = join(tmpdir(), 'slip.leafplugin')
    await makeLeafPlugin(zip, { id: 'evil', name: 'e', version: '1', category: 'format', entry: 'index.html' }, { '../evil.txt': 'x' })
    const res = await s.importPlugin(zip)
    expect(res.ok).toBe(false)
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false)
  })

  it('importPlugin：manifest 非法 / entry 缺失 / 同 id 已装，各自拒绝', async () => {
    const s = svc()
    mkdirSync(root, { recursive: true })
    makePlugin(join(root, 'nice'), 'nice')
    const bad1 = join(tmpdir(), 'bad1.leafplugin')
    await makeLeafPlugin(bad1, { id: 'x', name: 'x' }) // 缺 version/category/entry
    expect((await s.importPlugin(bad1)).ok).toBe(false)
    const bad2 = join(tmpdir(), 'bad2.leafplugin')
    await makeLeafPlugin(bad2, { id: 'y', name: 'y', version: '1', category: 'format', entry: 'missing.html' })
    expect((await s.importPlugin(bad2)).ok).toBe(false)
    const dup = join(tmpdir(), 'dup.leafplugin')
    await makeLeafPlugin(dup, { id: 'nice', name: 'n', version: '2', category: 'inspector', entry: 'index.html' })
    expect((await s.importPlugin(dup)).ok).toBe(false)
    expect(existsSync(join(root, 'nice', 'manifest.json'))).toBe(true) // 未被覆盖
  })
```

- [ ] **Step 3: 跑测试确认失败**

- [ ] **Step 4: 实现 importPlugin**（PluginService.ts；解压逻辑照 `src/main/utils/zipBrowse.ts` 的 openZip/entry 遍历模式写私有方法 `extractPluginZip(zipPath, destDir): Promise<{ ok, error? }>`）

要点（实现时逐条落实）：
1. `mkdtemp` 临时目录 → yauzl 逐 entry：`entry.fileName` 过滤目录项；`resolve(destDir, entry.fileName)` 必须 `startsWith(resolve(destDir) + sep)`（zip slip）且不含 `\0`；非法 entry → 整包拒绝、清理临时目录
2. 解压完成后 `parseManifest(tempDir)`；null → 「包内 manifest.json 缺失或非法」
3. `existsSync(join(tempDir, m.entry))` 否则「入口文件缺失: <entry>」
4. 同 id 检查：`existsSync(join(this.root, m.id))` → 「已安装同 id 插件，请先卸载」
5. `mkdirSync(root, {recursive:true})` + `cpSync(tempDir, join(this.root, m.id), {recursive:true})` → 清临时目录 → `{ ok: true, id: m.id }`
6. 全程 try/catch，失败必须 `rmSync(tempDir, {recursive:true, force:true})`

- [ ] **Step 5: 跑测试通过**（注意 `pnpm add -D yazl` 在本任务开始时执行）
- [ ] **Step 6: 向用户报告 Task 3 完成（不 commit）**

### Task 4: IPC + preload + d.ts

**Files:**
- Modify: `src/main/ipc/plugins.ts`、`src/preload/index.ts`（plugins 段）、`src/preload/index.d.ts`（plugins 接口）

**Interfaces:**
- Consumes: Task 1-3 的 `setEnabled/uninstall/importPlugin/listAll`
- Produces: `window.api.plugins.setEnabled(id, enabled)`、`.uninstall(id)`、`.importPlugin(zipPath): Promise<{ok, id?, error?}>`、`.listAll(): Promise<ManagedPlugin[]>`

- [ ] **Step 1: ipc/plugins.ts 追加**（照该文件既有 `ipcMain.handle` 直风格）

```ts
  ipcMain.handle('plugins:setEnabled', (_e, id: string, enabled: boolean) =>
    pluginService.setEnabled(String(id ?? ''), enabled === true)
  )
  ipcMain.handle('plugins:uninstall', (_e, id: string) => pluginService.uninstall(String(id ?? '')))
  ipcMain.handle('plugins:importPlugin', async (_e, zipPath: string) =>
    pluginService.importPlugin(String(zipPath ?? ''))
  )
  ipcMain.handle('plugins:listAll', () => pluginService.listAll())
```

- [ ] **Step 2: preload/index.ts plugins 段追加四个桥**（照段内既有风格：参数过 `String()`/`=== true` 收窄）
- [ ] **Step 3: index.d.ts**：`ManagedPlugin` 类型（`import type { ManagedPlugin } from '../main/services/PluginService'`——该文件已 import InstalledPlugin 同源，照抄既有 import 方式）+ 四个方法签名
- [ ] **Step 4: `pnpm run typecheck:node` 0 错**；向用户报告 Task 4 完成（不 commit）

### Task 5: usePluginRegistry 单例（enabled 过滤 + 乐观启停）

**Files:**
- Create: `src/renderer/src/composables/usePluginRegistry.ts`
- Test: `src/renderer/src/composables/__tests__/usePluginRegistry.test.ts`

**Interfaces:**
- Consumes: `window.api.plugins.listAll/setEnabled`
- Produces: `usePluginRegistry(): { plugins: Ref<ManagedPlugin[]>; enabledPlugins: ComputedRef<ManagedPlugin[]>; loaded: Ref<boolean>; reload(): Promise<void>; setEnabled(id: string, enabled: boolean): Promise<void> }`（模块级单例，照 `useTheme` 的 ref-at-module-scope 范式）

- [ ] **Step 1: 写失败测试**（`vi.mock` window.api.plugins——照 `PhotoPreviewAiGate.test.ts` 的 api mock 范式）

```ts
  it('enabledPlugins 只含 enabled=true；setEnabled 乐观更新并在 IPC 失败时回滚', async () => {
    // mock listAll → [{id:'a',enabled:true},{id:'b',enabled:false}]；setEnabled 首次成功、二次 reject
    const { usePluginRegistry } = await import('../usePluginRegistry')
    const reg = usePluginRegistry()
    await reg.reload()
    expect(reg.enabledPlugins.value.map((p) => p.id)).toEqual(['a'])
    await reg.setEnabled('b', true)
    expect(reg.enabledPlugins.value.map((p) => p.id)).toEqual(['a', 'b'])
    api.setEnabled.mockRejectedValueOnce(new Error('ipc down'))
    await expect(reg.setEnabled('b', false)).rejects.toThrow()
    expect(reg.enabledPlugins.value.map((p) => p.id)).toEqual(['a', 'b']) // 回滚
  })
```

- [ ] **Step 2: 确认失败 → 实现**（核心 ~40 行：模块级 `const plugins = ref<ManagedPlugin[]>([])`；`reload` 调 listAll；`setEnabled` 乐观翻转 + await IPC + catch 回滚并 rethrow；`enabledPlugins = computed(() => plugins.value.filter((p) => p.enabled))`）
- [ ] **Step 3: 测试通过**；向用户报告 Task 5 完成（不 commit）

### Task 6: 消费方切到 enabledPlugins

**Files:**
- Modify: `src/renderer/src/views/photos/components/PhotoInspector.vue`（约 :82 的 `window.api.plugins.list()` 改 `usePluginRegistry().enabledPlugins` + `reload()`）
- Modify: `src/renderer/src/views/photos/components/PhotoPreview.vue`（约 :1363 `formatPlugins` ref → `usePluginRegistry().enabledPlugins`，保留 `formatPlugin` computed 形状）

**Interfaces:**
- Consumes: Task 5 的 `usePluginRegistry`
- Produces: 两消费方的插件来源 = 注册表 enabled 集；禁用插件区块/渲染器即时消失

- [ ] **Step 1: 改 PhotoInspector**：删除本地 list 拉取，改 `const { enabledPlugins, reload } = usePluginRegistry()`；`onMounted(() => void reload())`；区块循环数据源换 `enabledPlugins`
- [ ] **Step 2: 改 PhotoPreview**：`const formatPlugins = computed(() => usePluginRegistry().enabledPlugins.value)` 等价改造（保持 `formatPlugin` computed 消费形状不变）
- [ ] **Step 3: `pnpm run typecheck:web` 0 错；`pnpm exec vitest run src/renderer/src` 全绿**（既有插件相关测试——检查器挂载/格式渲染/AiGate——不得变红；若它们 mock 了 `window.api.plugins.list`，同步改为 mock registry 或保留 list 作 reload 数据源——registry 的 reload 走 `listAll`，测试 mock 需对齐）
- [ ] **Step 4: 向用户报告 Task 6 完成（不 commit）**

### Task 7: PluginCenterModal 三栏面板 + TitleBar 换挂载 + 设置页入口

**Files:**
- Create: `src/renderer/src/components/plugins/PluginCenterModal.vue`
- Modify: `src/renderer/src/components/shell/TitleBar.vue`（PluginManagerModal → PluginCenterModal）
- Modify: `src/renderer/src/views/SettingsView.vue`（插件分区加「打开插件中心」；分区其余保留）

**Interfaces:**
- Consumes: Task 5 registry、Task 4 桥、`useDialogs.requestConfirm`（views/photos/composables/useDialogs.ts，模块单例）、`UModal`/`USwitch`/`AppIcon`
- Produces: 中心面板（分类 tab/搜索/列表/详情/启停/卸载确认/导入确认+权限清单/内置安装）

- [ ] **Step 1: PluginCenterModal.vue**（结构要点，实现照此；样式全 token）：
  - `UModal size="lg"` + 三栏：`grid grid-cols-[140px_1fr_260px]`
  - 左：分类（全部 + 4 类，`ManagedPlugin['category']`）计数 + 搜索 input
  - 中：过滤后列表行（图标槽（AppIcon ic_smart-folder 占位或插件 icon）、name+version、来源徽标（内置/已导入/开发者目录）、USwitch（未安装内置项显示「安装」UButton → `installBuiltin`）
  - 右：选中详情（description、permissions 逐条列表（空则「未声明权限」）、entry、导入时间（dir mtime）、卸载 UButton danger → `requestConfirm('卸载插件', '将删除 <name> 的安装副本…', '卸载', ...)` → `api.plugins.uninstall` → `registry.reload()`）
  - 顶部操作：「导入 .leafplugin…」→ `window.api.pickZipFile()`? **不用新对话框桥**：用既有 `plugins:pickExtraDir` 同款 dialog.showOpenDialog 模式——在 ipc/plugins.ts 追加 `plugins:pickAndImport`（showOpenDialog 选 zip → importPlugin → 返回结果），渲染层一个按钮
  - 导入/内置安装成功前弹权限确认：`requestConfirm('安装插件', '权限清单：…', '安装', ...)`（requestConfirm 支持 checkbox 可不放）
- [ ] **Step 2: ipc/plugins.ts 追加 `plugins:pickAndImport`**（`dialog.showOpenDialog({ filters: [{ name: 'Leaf 插件包', extensions: ['leafplugin', 'zip'] }] })` → importPlugin）；preload/d.ts 同步
- [ ] **Step 3: TitleBar**：import 与 v-model 挂载换 PluginCenterModal（props/emit 照旧 `v-model="pluginsOpen"`）
- [ ] **Step 4: SettingsView 插件分区**：顶部加「打开插件中心」UButton（emit 或直接引入 registry+modal？——设置页无该 modal 挂载点，用 `window.api` 之外的轻路：把 modal 挂到 App.vue？**简化：设置页按钮触发 `router.push('/') + 事件` 复杂——改为：设置页保留现状列表，仅文案引导「点击标题栏 ⚡ 打开插件中心」**，避免跨视图弹窗）
- [ ] **Step 5: `pnpm run typecheck:web` + `pnpm exec vitest run src/renderer/src` 全绿**
- [ ] **Step 6: 向用户报告 Task 7 完成（不 commit）**

### Task 8: 真 app e2e

**Files:**
- Create: `e2e/plugin-center.spec.mjs`
- Create: `e2e/fixtures/hello.leafplugin`（构造脚本生成，一次性提交进 fixtures——或在 spec 内用 yazl 现场生成到临时目录，二选一，推荐现场生成）

**Interfaces:** Consumes Task 4 桥、Task 7 面板

- [ ] **Step 1: 写 e2e**（照 `e2e/plugin-center` 用 `_electron.launch` + 独立 userData；步骤：`plugins:importPlugin`（经 api 桥）装测试包 → 打开中心（TitleBar ⚡）→ 断言列表含测试插件 → USwitch 禁用 → **重启 app**（close + relaunch 同 userData）→ 断言禁用态保持 → 卸载（走确认弹窗确认按钮）→ 断言列表消失）
- [ ] **Step 2: `pnpm exec playwright test e2e/plugin-center.spec.mjs` 连跑 2 次全过**
- [ ] **Step 3: 向用户报告 Task 8 完成（不 commit）**

### Task 9: 文档与决策收尾

**Files:**
- Modify: `docs/DECISIONS.md`（D-025 条目：范围/即时生效/包格式自建/Eagle 兼容边界/不追清单不变）
- Modify: `CHANGELOG.md`（新增段：插件中心/启停/卸载/.leafplugin 导入）
- Modify: `docs/COMPONENTS.md`（PluginCenterModal/usePluginRegistry 条目，若该文件有插件段落）

- [ ] **Step 1: 写 D-025 + CHANGELOG**（CHANGELOG 放 2026-09-27 节新增段）
- [ ] **Step 2: 向用户报告全部任务完成；工作区改动清单（新增/修改文件列表）供用户审后自行提交**

## Plan Self-Review 记录

- Spec 覆盖：§2.1→Task1/2/3，§2.2→Task4，§2.3→Task5/6，§2.4→Task7，§2.5→Task3，§2.6→Task7（确认弹窗）+Review Focus 1/5，§3→Task1，§4→Task2/3/5，§5→Task1/3/5/7/8，§6→Task8+回归。无缺口。
- 类型一致性：ManagedPlugin/setEnabled/importPlugin 签名在 Task 1/3/4/5 一致；`plugins:pickAndImport` 在 Task 7 定义于 Task 4 之后（Task 4 只含 spec 四通道，pickAndImport 归 Task 7——已是 Task 7 Step 2，一致）。
- Review Focus 1→Task3、2→Task5/6、3→Task1、4→Task2、5→Task3，各有着落。
- 偏离模板说明：所有 Commit 步骤按用户指令替换为「报告完成」。
