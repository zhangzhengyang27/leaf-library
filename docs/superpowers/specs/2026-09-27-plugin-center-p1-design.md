# 插件中心 P1（离线核心）· 设计文档

> 日期：2026-09-27。决策编号：D-025（引用 D-014 插件系统 MVP；离线部分不推翻其「不追在线市场」，
> P2 在线市场落地时另立决策）。状态：设计已获用户批准（分节展示后口头确认），spec 待用户审。
> 分期：P1 本期 → P2 在线市场 → P3 自动更新 → P4 插件 API 扩容（各期独立 spec/计划）。

## 1 · 背景与目标

D-014 已交付插件系统 MVP：manifest 校验、`userData/plugins/<id>/` 与开发者自定义目录加载、
sandbox iframe + postMessage 桥、检查器区块与格式预览两个扩展点、内置插件一键安装
（复制到 userData/plugins）。现状缺口（对照 Eagle 插件中心）：

- 无每插件**启用/禁用**（加载即全部生效，无运行边界）
- 无**卸载**（装了只能手删目录）
- 无**插件包导入**（只能装内置五个 + 开发者目录裸放）
- 管理面是设置页分区 + 简单列表，非「中心」形态

P1 目标：补齐以上四件，形成 Eagle 形态的**离线插件中心**。非目标（后续期）：在线市场（P2）、
自动更新（P3）、窗口类扩展点与沙箱桥扩容（P4）。

## 2 · 架构

### 2.1 主进程 PluginService 扩展

现有：`parseManifest(dir)`（校验 category ∈ {inspector, format, window, development}）、
`listBuiltin()`（resources/plugins 或开发目录）、`listInstalled()`（userData/plugins + extraDir）、
`installBuiltin(id)`（复制）、prefs 注入（`prefRepository.get/set`）。

新增：

| 方法 | 语义 |
| --- | --- |
| `setEnabled(id, enabled: boolean)` | 持久化到 pref `plugins:enabled:<id>`（默认 true——**未写过即视为启用**，兼容存量）；幂等 |
| `isEnabled(id): boolean` | 读 pref；键缺失 = true |
| `uninstall(id)` | 删 `userData/plugins/<id>/` 整目录；**仅允许删 userData/plugins 下的安装件**——内置原件与 extraDir 开发者目录不归卸载管（返回明确错误）；目录不存在返回 ok:false |
| `importPlugin(zipPath): { ok, id? , error? }` | 解 `.leafplugin` 包 → 校验 → 落 `userData/plugins/<id>/`（见 §4） |
| `listInstalled()` 增强 | 每项增加 `enabled`（isEnabled 结果）与 `source: 'builtin' \| 'imported' \| 'dev'`（builtin=可通过 installBuiltin 重装的；imported=userData/plugins 下非内置来源；dev=extraDir） |

启动过滤：`listInstalled()` 结果照旧全量返回（管理面要看到禁用项），但渲染层注册表按 §2.3 只装配 enabled。

### 2.2 IPC 面（新增 4 通道，走既有 registerPrefixedHandlers 风格）

`plugins:setEnabled {id, enabled}`、`plugins:uninstall {id}`、`plugins:importPlugin {zipPath}`、
`plugins:listAll`（= listInstalled + listBuiltin 合并视图，中心面板一次拉全）。preload 对应桥 +
index.d.ts 类型。

### 2.3 渲染层生命周期（即时生效）

现状消费点：`PhotoInspector`（检查器区块）、`PhotoPreview`（格式渲染器按 mime 注册）、
`PluginSandbox`（iframe 运行器）、`PluginManagerModal`（管理面）。

改造：新建 `composables/usePluginRegistry.ts`（渲染层单例，现有列表拉取逻辑迁入）：

- 状态：`plugins: Ref<InstalledPlugin[]>`（全量，含禁用）、`enabledPlugins` computed（过滤 enabled）
- `setEnabled(id, enabled)`：乐观更新本地 → 调 IPC 持久化 → 失败回滚 + toast
- 消费方（Inspector 区块循环、Preview 格式渲染器查找）改读 `enabledPlugins` —— **禁用即时消失**：
  Vue 响应式让区块 v-if 卸载、渲染器查不到即回落默认预览；运行中的 iframe 随组件卸载销毁
- 主进程持久化仅保证重启后一致；不要求主进程中途杀 iframe（沙箱本就在渲染层）

### 2.4 中心面板

新 `components/plugins/PluginCenterModal.vue`（替换 TitleBar ⚡ 现挂载的 PluginManagerModal；
PluginManagerModal 保留文件但退役挂载——其「内置一键安装/自定义目录」能力并入中心）：

- 左栏：分类 tab（全部/检查器/格式/窗口/开发）+ 搜索框（按名称/描述过滤，Eagle 中心同款）
- 中栏：插件列表行（图标、名称、版本、来源徽标：内置｜已导入｜开发者目录、启停 USwitch）
- 右栏：详情（描述、权限清单逐条、入口文件、来源与导入时间、卸载按钮〔红，danger，带确认〕）
- 内置未安装的插件也在列表中（来源=内置、启停开关显示为「安装」按钮）——现 ManagerModal 的
  一键安装语义原样并入
- TitleBar ⚡ → 打开中心；设置页插件分区保留（摘要 + 开发者目录选择）+「打开插件中心」按钮

### 2.5 包格式 `.leafplugin`

- 结构：zip（`yauzl` 已在依赖）。`manifest.json` + `icon.svg|png`（可选）+ `index.html`（入口）+
  插件资源。manifest 字段向 Eagle 生态命名对齐：`{ id, name, version, category,
  description, permissions: string[], author }`；`id` 规则沿用 parseManifest 既有校验
- **明确边界**：布局兼容便于文档叙事与未来迁移，但运行 API 是 Leaf 沙箱桥（postMessage：
  当前选中集/缩略图 URL/检查器挂载点），Eagle 官方插件本体不可运行
- 导入流程：解包到临时目录 → manifest 校验（复用 parseManifest；新增：entry 文件必须存在、
  id 与目录名一致）→ **同 id 已装：P1 拒绝**（提示先卸载；版本覆盖升级属 P3）→ 移入
  `userData/plugins/<id>/`
- zip slip 防护：逐 entry 校验解析后的目标路径必须落在目标目录内（yauzl entryName 不得含
  `..` 前缀逃逸），否则整包拒绝

### 2.6 权限展示与安全

- 权限 P1 = **静态展示**：详情面板逐条列 `permissions[]`；安装（内置安装/包导入）确认弹窗列出
  权限清单——用户看到才装。强制审批流（权限拒绝则不装）留 P2 在线安装
- 卸载与清空均为危险动作：卸载确认弹窗（写明删的是 userData 副本、内置可重装）；导入不危险
  但同 id 冲突会拒绝
- 沙箱边界不变（D-014：无 nodeIntegration、postMessage 白名单桥）

## 3 · 数据与状态

| 存储 | 键/位置 | 内容 |
| --- | --- | --- |
| pref 表 | `plugins:enabled:<id>` | 'true'/'false'；缺失 = true |
| pref 表 | `plugins:extraDir` | 既有，不动 |
| 目录 | `userData/plugins/<id>/` | 安装件（内置复制件与导入包同址） |
| 目录 | resources/plugins/（或开发目录） | 内置原件，只读来源 |

## 4 · 错误处理

- importPlugin：zip 损坏 / manifest 非法 / entry 缺失 / zip slip / 同 id 已装——各自中文错误文案，
  统一 `{ ok: false, error }` 返回，中心面板 toast
- uninstall：extraDir 与内置原件路径拒绝（明确文案）；未安装/已卸载的 id 返回 ok:false（与测试断言一致，2026-09-27 终审后回写）
- setEnabled：未知 id 拒绝；IPC 失败渲染层回滚开关状态 + toast
- 卸载正在运行中的插件：允许（渲染层先注销再删盘——顺序：setEnabled(false) 语义已注销，
  再删目录）

## 5 · 测试

- PluginService 单测：import 往返 / zip slip 拒绝 / manifest 非法与 entry 缺失拒绝 / 同 id 冲突 /
  setEnabled 持久化与默认 true / uninstall 只删 userData 件（内置与 extraDir 拒绝）/ list 的
  enabled+source 字段
- 渲染层组件级：中心面板三栏渲染与过滤、启停开关即时增减 Inspector 区块 / Preview 渲染器
  （mock 注册表）、卸载确认弹窗、导入确认弹窗权限清单展示
- e2e（真 app）：导入一个测试 .leafplugin → 中心可见 → 启用后检查器出现区块 → 禁用即消失 →
  卸载后消失 → 重启后禁用态保持
- 回归：既有插件相关测试（PluginSandbox/检查器挂载/格式渲染）全绿

## 6 · 验收标准

1. TitleBar ⚡ 打开中心；分类过滤与搜索可用；三栏信息完整
2. 任一插件禁用 → 检查器/预览的对应扩展点**立即**消失，重启后仍禁用；启用即恢复
3. 中心面板「导入」按钮 → 选 `.leafplugin` 文件 → 权限确认 → 装入并出现在列表（来源=已导入）；
   OS「双击 .leafplugin 打开」的文件关联注册不在 P1（留 P2 可选项）
4. 卸载已导入插件 → 目录删除、列表消失、确认弹窗先行；内置插件卸载后可重装
5. zip slip / 非法 manifest / 同 id 冲突包均被拒且有中文文案
6. 全量测试电池 + lint 绿

## 7 · 决策与文档动作

- DECISIONS.md 立 D-025（本 spec 的决策记录：范围=离线核心，即时生效生命周期，包格式自建，
  Eagle 兼容边界声明）
- CHANGELOG 记用户可感知项（插件中心/启停/卸载/导入）
- P2 立项时另立决策（推翻 D-014「不追在线分发」）
