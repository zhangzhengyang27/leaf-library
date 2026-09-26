# Leaf · 关键决策记录（ADR-lite）

记录日期：2026-07-26

## Decision-001 · Slogan 选择

**决策**：C — _Tools that breathe with your day._

**理由**：贴合"叶"的概念，传递常驻、不打断、可感不可见的调性，避免直接喊"工具集"的工程味道。

---

## Decision-002 · 1.0 范围

**决策**：9 个模块精细化到商用级；**本地音乐**和**代码片段**1.0 期间不动。

**理由**：

- 这两个模块当前相对完整，强行改会引入更多 bug
- 把精力集中到能带来用户感知升级的模块（截图/录制/壁纸/搜索）
- 1.0 后第一迭代立即补齐这两个

**实施**：见 `MODULE_TIERS.md` 的 "1.0 实际改的 9 个模块" 清单。

---

## Decision-003 · 账号系统

**决策**：1.0 不做，2.0 再说。

**理由**：符合"本地优先"差异化叙事；1.0 用户量小，账号收益不抵开发成本。

**后续动作**：2.0 启动时重新评估。

---

## Decision-004 · 云同步

**决策**：暂时不做，写入后续计划（roadmap）。

**替代方案**：1.0 提供"导入 / 导出 JSON"作为数据迁移的最小可行方案，让用户在多设备之间至少能"手动同步"。

**后续动作**：在 `docs/ROADMAP.md`（待创建）列入 2.0+ 待评估项。

---

## Decision-005 · 商业模式

**决策**：D — 开源（GitHub 公开发布）。

**影响**：

- 移除一切与"账号 / 订阅 / 付费功能"相关的暗示（避免误导用户）
- README、官网、About 页都需要开源项目的话术
- 1.0 发布前需选 License（建议 MIT 或 Apache 2.0）
- 移除作者邮箱占位等（package.json 当前的 `"author": "example.com"` 必须替换）

**注意**：开源对"商业化"叙事有冲突，但用户明确选了开源。后续所有文档避免"商用术语"。

---

## Decision-006 · 1.0 不做的项

| 不做项     | 备注                                            |
| ---------- | ----------------------------------------------- |
| 插件系统   | 推迟到 2.0                                      |
| AI 能力    | 推迟（与不做云同步一致，避免 1.0 引入外部依赖） |
| 自定义主题 | 1.0 仅提供浅色 / 深色 / 跟随系统                |
| 多语言     | 1.0 仅中文，但 vue-i18n 框架要接好              |

---

## Decision-007 · 技术栈调整

**决策**：C — 引入 SQLite（better-sqlite3），用于图片库 / 录制历史的存储。

**理由**：

- 当前 electron-store 是 JSON 文件，图片库和录制历史这类条数大、查询多的场景不合适
- better-sqlite3 是同步 API，简单且快
- 仅在主进程使用，对渲染进程暴露 IPC

**实施要点**：

1. 主进程封装 `Database` 服务（`src/main/services/DatabaseService.ts`）
2. 图片库表 `photos(id, file_path, file_name, file_size, width, height, created_at, imported_at, modified_at, is_favorite)`
3. 录制历史表 `recording_history(id, file_path, duration, created_at, thumbnail_path)`
4. 录制标记表 `recording_markers(id, recording_id, time_ms, label, color)`
5. 旧的 JSON 数据一次性迁移脚本（`scripts/migrate-to-sqlite.ts`）

**保留 electron-store 的场景**：

- `preferencesStore`（设置项）
- `musicStore`（播放列表）
- `wallpaperStore`（收藏的壁纸）
- 其他轻量配置

**待验证项**：

- better-sqlite3 在 macOS arm64 的原生编译（pnpm 已配 `onlyBuiltDependencies`，应能自动 rebuild）
- 在 Windows 上 electron-builder 是否正确打包 native 模块

---

## 后续计划（待评估）

- 云同步（roadmap 候选）
- 多源音乐
- 多显示器壁纸
- 团队协作 / 共享
- 第三方接入

---

## Decision-008 · 素材库壳层 Edge 化（布局/交互重构）

**日期**：2026-09-01

**决策**：素材库独立版壳层参照 Microsoft Edge（Fluent 风格）重构——hiddenInset 自绘标题栏＋多标签页＋树形资源侧栏，同时补齐右键菜单/键盘导航/拖拽/连选。

**理由**：

- 原壳层（TopBar+图标侧栏）源自 9 模块工具箱母版，独立版仅剩素材库一个模块，图标侧栏信息密度过低
- photos/index.vue 已成 1529 行巨石视图，筛选条/锁屏/确认框内联，无法持续迭代
- Eagle 差距 #11 剩余项（列表视图/自适应布局）可顺势落地

**实施要点**：

1. darwin `titleBarStyle: hiddenInset`，TitleBar 组件承担拖拽区与红绿灯留白；win/linux 保留系统标题栏
2. 多标签：`useLibraryTabs`（pinia）每 tab 独立 view/filters/layout/search 状态，localStorage 持久化；设置/关于仍是路由页不占 tab
3. 布局三态 grid/waterfall/list；排序控件全局生效
4. 交互新增：UContextMenu（卡片/侧栏）、↑↓←→+Enter/Esc 键盘导航、⌘/Shift 连选、拖拽入相册/文件夹/标签
5. index.vue 拆为 8 个 composables + 组件（见 COMPONENTS.md §9）

**保留约束**：

- `.app-scroll` 滚动标记类、`--shell-topbar-h` 消费方契约不变
- 既有快捷键 ⌘K/⌘1-8/⌘,/⌘? 不占用；空格预览让路规则保留
- 单一品牌色相与 tokens v4 不变（Fluent 化是形状/层次/材质，不引入第二色相）
- 不追：标签页固定/静音/分屏、浏览器内核相关特性

---

## Decision-009 · §2.E AI 能力延后（差距补齐计划）

**日期**：2026-09-01

**决策**：差距补齐计划（§2 功能差距 A–D + §3 布局差距 L1–L5）**全部落地** AI 相关项（§2.E）**整体延后**，本次不实现。

**延后项**：

- AI 搜索（自然语言找图）：当前 x64 构建 `onnxruntime-node` 不可用，本地推理缺二进制
- AI 动作（智能命名 / 写描述 / 全库自动打标）
- AI 模型中心
- MCP 可写（建相册 / 打标签 / 导入）

**理由**：

- 本机为 x64，`scripts/check-ai-env` 尚未通过（缺 onnxruntime 二进制），AI 推理链路无法在本机验证
- 全库自动打标 / AI 动作属重资源后台任务，需先在 Apple Silicon 机器上验证可用性与性能后再排期
- MCP 可写虽不依赖本地模型，但与 AI 能力强耦合，一并延后以保持决策一致

**前置验证（恢复排期前必须）**：

1. 在 Apple Silicon 机器上重跑 `scripts/check-ai-env` 全绿
2. 用 `EmbeddingService` 对 1000 张样本跑通向量化 + 相似检索，确认耗时在可接受区间
3. 验证 `McpHandler` 当前只读接口稳定，再扩展可写能力

**恢复后落点**：独立排期，不阻塞本次 A–D / L1–L5 发布。

---

## Decision-010 · §2.A 扩展能力：浏览器扩展导入接口约定（仅记录，不实现外部扩展）

**日期**：2026-09-01

**约定**：本地素材管理应用为桌面端，浏览器扩展不直接落地。外部扩展的素材进入应用的统一入口已就位：

- **拖拽入库**：`index.vue` 在 `window` 级监听 `dragenter/over/leave/drop`，命中 `DataTransfer.types` 含 `Files` 时从 `DataTransfer.files[].path` 取路径 → `photos:importPaths`（复用后台缩略图/EXIF 管线）。扩展只需把文件作为文件对象拖入应用窗口即可。
- **⌘V 粘贴入库**：`usePhotoImport.pasteFromClipboard` → 主进程 `photos:getClipboardFiles`（macOS 优先 `NSFilenamesPboardType`，回退文本路径 / `public.file-url`）→ `importPaths`。
- 扩展若需主动推送，可在未来通过一个 `photos:importPaths` 的安全 IPC 包装（带来源校验）完成；本次不实现扩展侧代码。

**不实现项**：浏览器扩展（Chrome/Firefox 插件）的采集/右键菜单/后台同步——属独立工程，不纳入本次范围。

---

## Decision-011 · 布局照抄 Eagle 官网（第三轮壳层重构）

**日期**：2026-09-01

**决策**：以 eagle.cool 官网截图（OG 主图 / GIF 视图 / 悬停预览）为唯一布局蓝本，做第三轮壳层重构：**移除多标签页**，TitleBar 改为 Eagle 式单行工具栏，侧栏重排为「库名行 + 固定项 + 小节树」，卡片下方常驻两行信息。

**与 D-008 的关系**：D-008 的 Edge 化骨架（hiddenInset、token 体系、树形侧栏、交互增强）全部保留；本次仅推翻其中「多标签页」与「双层工具栏」两个决策——Eagle 实际布局更简单：单行全宽工具栏 + 单树侧栏。

**实施要点**：

1. `libraryTabs` store 单状态化（tabs[] → 单 tab，保留全部筛选字段），新增视图历史栈支撑工具栏 ‹ ›；持久化换 `library.tab.v2`（旧 tabs 数据一次性丢弃，仅筛选状态）
2. TitleBar：左段 导入▾ / 布局切换 / 侧栏开关；中段 ‹ › + 面包屑（路径 + 总数）；右段 进度 pill / 缩略图滑块（4 档）/ 筛选开关 / ⋯ 更多 / 主题 / 设置 / 关于
3. `LibraryTabStrip`、`PhotoToolbar` 组件删除；搜索框移入 FilterBar 行首；新建类操作归侧栏小节组头；工具类操作归 ⋯ 菜单
4. PhotoGrid / waterfall 卡片下方常驻两行（文件名 + 尺寸），对齐 Eagle 卡片元信息展示
5. LibraryPanel：库名行置顶；固定项（全部/未分类/最近添加/最近查看/收藏/地图/回收站）带右对齐计数；删除底部设置/关于

**保留约束**：`.app-scroll`、`--shell-topbar-h`、hiddenInset、全部既有快捷键（仅删 ⌘T/⌘W/Ctrl+Tab）、空格预览让路、AI 降级、锁屏。

---

## Decision-012 · 一比一复刻 Eagle：工具栏跟随 Eagle（第四轮壳层对齐）

**日期**：2026-09-02

**决策**：项目目标升级为「一比一复刻 Eagle」。基于 2026-09-02 对 Eagle 实测（工具栏布局弹层 / 排列方式 / 筛选维度 / 智能文件夹编辑器 / 标签管理页 / 偏好设置 / 资源库菜单），制定分阶段对齐计划（见《素材库与Eagle差距分析.md》2026-09-02 版）。

**与 D-011 的关系**：推翻 D-011 第 3 条「搜索框移入 FilterBar 行首」与排序控件位置——Eagle 实测排序与搜索都在顶部工具栏，布局+排列+显示开关合为一个弹层。其余 D-011 决策（单行工具栏、树形侧栏、卡片常驻元信息）保留。

**实施要点**：

1. LayoutPopover 弹层：布局方式（瀑布流/自适应/网格/列表）+ 排列方式（添加/修改/创建日期/标题/扩展名/文件大小/尺寸/评分/时长/随机）+ 8 个显示开关
2. 搜索框移回 TitleBar（保留 `id=library-search` 供 ⌘F）；FilterBar 只留筛选职责
3. 缩略图控件改「− 滑块 + 数值」三件套
4. 显示开关：名称/简介(尺寸)/扩展名/扩展名标签/标注/子文件夹内容/横栏/检查器，随视图持久化
5. 筛选维度池 + 图钉固定机制（Eagle 实测 14 维）
6. 框选橡皮筋（useMarquee：几何缓存 + 贴边自动滚动 + ⌘ 叠加；grid/waterfall 均生效，几何缓存兼容 multi-columns）

**保留约束**：`.app-scroll`、`--shell-topbar-h`、hiddenInset、空格预览让路、锁屏、AI 降级、content-visibility 大库性能红线。

---

## Decision-013 · 多资源库（完整版）

**日期**：2026-09-02

**决策**：支持多资源库——创建/打开/切换/重命名/删除/最近列表/合并其它资源库/库间移动/库级密码，对齐 Eagle「资源库」菜单能力。

**架构**：

1. `userData/libraries.json` 登记库（id/name/path/createdAt/lastOpenedAt）；库目录 = `<path>/library.db + thumbs/ + bookmarks/ + clips/ + converted/`
2. `LeafDatabase` 支持 open(path)/reopen；启动打开 lastOpened 库；旧 `userData/leaf.db + thumbs` 首启登记为「默认库」原位引用
3. 参数化 12 处单库硬编码：database.ts 路径与备份、ThumbnailService、PhotoDataStore converted、BookmarkService、ClipServer（clip-server.json 全局一份保留）、LogService（全局保留）、EmbeddingService models（全局保留）、dbBackup、system:info、thumb:// 协议
4. 切库语义 = 主进程 reopen + 渲染层 reload；若 ClipServer/Embedding 与 reopen 冲突，回退为「切库=应用重载」（与 Eagle 体验一致）
5. 合并库先做文件级（copy+insert+冲突报告），标签/相册 id 映射二次迭代；库级密码 = PhotosLockService 键加 libraryId 前缀

---

## Decision-014 · 插件系统 MVP

**日期**：2026-09-02

**决策**：启动插件系统最小实现，对齐 Eagle 插件分类（窗口/格式/检查器/开发）。

**范围**：

1. manifest.json（id/名称/版本/分类/入口/权限声明）；本地目录加载（`userData/plugins/` + 设置开发者选项自定义目录）
2. 运行沙箱 = 渲染层 sandbox iframe + postMessage 受限桥（暴露：当前选中集、缩略图 URL、检查器挂载点）；不开 nodeIntegration
3. 扩展点 MVP 两个：检查器区块、格式预览渲染器（按 mime 注册）；「窗口」类工具面板后续迭代
4. 插件管理 UI：设置页插件分区 + TitleBar ⚡ 入口（已安装列表/插件中心指向文档）
5. 附一个示例插件做全链路验证

**不追**：插件市场在线分发、自动更新、付费签名校验。

---

## Decision-015 · AI 能力恢复排期（D-009 的解除条件已满足）

**日期**：2026-09-02

**决策**：D-009 延后 AI 的前置验证第一步已通过——`scripts/check-ai-env.mjs` 在本机（darwin/arm64, Node v24）报告 onnxruntime-node 原生二进制可用，「真实 CLIP 可用」。AI 相关项恢复排期（阶段 5）：全库自动打标批量任务、AI 建议扩展（描述/命名）、模型状态最小版、MCP 可写工具。

**前置**：排期实现前需完成千张样本向量化+相似检索基准（D-009 第 2 步），确认耗时可接受；x64 机器仍走 `aiAvailable=false` 降级路径不变。

## Decision-016 · 「设为壁纸」改为按屏适配，不再直设原文件

**日期**：2026-09-19

**决策**：壁纸链路拆成「判定 + 适配」两段。主进程按目标屏**物理像素**（`display.size × scaleFactor`，长边封顶 4096）判定并出派生 JPEG，落 `activeSubdir('wallpaper')/<photoId>/{W}x{H}-{策略}.jpg`（新库在库目录下，legacy 库在 `<userData>/wallpaper/`；源文件 mtime 变化即失效，LRU 24 张），原素材不动。三种策略，`auto` 只是「由主进程选档」的入口：

- `original` 原图直设 —— 比例吻合（偏差 ≤2%）且不含透明像素时的默认，也是用户唯一的「别给我动手脚」出口；
- `cover` 居中裁切 —— 丢弃面积 ≤15% 时的默认；有透明小洞但比例吻合的也走这档（丢弃面积为 0，等于只 flatten 补主色）；
- `blurred` 自身放大高斯模糊作底 + 主体留白居中 —— 丢弃面积更大、或透明范围大到裁切补不回来时的默认。

**理由**：素材库里两类图占了壁纸失败的绝大多数——手机竖屏截图放 16:9 会被系统居中裁掉 ~68% 画面，透明 PNG（logo/抠图）直设就是一块死黑底。选档只看两条确定性信号（cover 丢弃面积、透明像素占比）；**放大倍率只进 `reasons` 供文案使用，不参与选档**——低分辨率图重采样也救不回来，交给系统放大即可。不做「像不像壁纸」的内容分类。

**透明判定必须分两问**（一轮只用一个口径，同时造成漏检和误报，实测数据）：
`meta.hasAlpha` 对全不透明 PNG 也为 true，要真数像素；但「有没有洞」和「洞大到什么程度」是两个问题——
按 `alpha<250` 的占比卡 0.5% 时，1920×1080 上 40² 的洞（真面积 0.077%）被判成不透明 → 直设 → 黑底；
而 4000×3000 上仅一行为透明（真面积 0.033%）在 128×96 采样格里占 1.04% → 被判成大洞 → 白留一圈边。
现在：`alpha<250` 的采样点≥2 即「有洞」（否决 original），`alpha<=128` 的占比过 0.5% 才算「洞大」（选模糊底）。

**取舍**：刻意**不拦截**不适配的图——用户点设壁纸时通常已经知道要什么，被拒只会觉得工具笨；改成把代价说清楚（预览面板与检查器的策略菜单首行写「3840×2160｜硬裁要丢掉 68%，改用模糊留白」），默认帮他适配。卡片右键的子菜单是静态四项，不做预检（多一次解码换一行说明不划算）。代价是每次适配一次 sharp 编码（4K 数百毫秒、50MP 源约 0.8s）和一个需要 GC 的缓存目录。

**顺带**：修 B19（检查器壁纸按钮挂在多选 footer 里、`v-if` 只在单选为真 → 该入口此前永远渲染不出来）。

**验证**：`e2e/wallpaper-fit.spec.mjs`（独立 userData）——无副作用段断言 assess 与 Electron 实报屏幕一致、非素材路径被拒、三处入口的策略菜单都开得出来；`WP_REAL_SET=1` 段真改写 macOS 桌面，断言系统报告的壁纸就是派生 JPEG、二次设置命中缓存不重编码、cover 裁掉的内容模糊底保留、toast 描述区不被 truncate 截断，最后还原原壁纸。

**审查轮（同日）**：独立 reviewer 查出并修掉 ——
① **P0**：渲染层传来的 `mode` 未过白名单就拼进缓存文件名，`'../../../tmp/pwn'` 实测可写库外任意 `.jpg`（本模块第三次栽在同一类 IPC 信任边界上）；现在 `sanitizeMode` 收敛 + `wallpaperCachePath` 目录内断言双闸门。
② 主进程没有 `kind` 闸门（视频会经 1024 封面回落被判成 `original`，把 `.mp4` 交给系统）；
③ 主屏取 `getAllDisplays()[0]`（Electron 不保证顺序）；④ 回落预览时新鲜度只看预览 mtime（预览 mtime 永不前进 → 永久陈旧）；⑤ 刚导入的 HEIC 因预览未生成而直接失败。
另按变异测试补了渲染侧断言：此前 10 个故意改坏里 6 个全绿（含「留白 alpha 写成不透明黑 → 64% 画布变黑」），现在模糊强度、留白不发黑、透明填充色、EXIF 5~8 同向、阈值边界、路径注入都会被咬住。

## Decision-017 · 下线 CLIP 语义搜索；其余 AI 能力改接 DeepSeek

**日期**：2026-09-20

**决策**：AI 语义搜索（自然语言搜图）不再作为路线图项，`EmbeddingService` 的 `semanticSearch` 链路冻结在现状、不排期改造。素材库里其余 AI 能力（命名/描述/标签建议、自动打标）后续改接 DeepSeek。

**依据（2026-09-20 真机实测，26 张素材库）**：链路本身没问题——23 张建索引 1.0s、单张 ≈24ms、热查询 5–9ms，全部远优于 D-015 设的可行性线（<300ms/张、<50ms/次）。问题在模型：

- 现用 `Xenova/clip-vit-base-patch32` 的文本塔是**英文**模型，分词器无 CJK，「猫」被 byte-fallback 拆成 5 个 token；四个互不相关中文查询的文本向量两两余弦平均 **0.9251**（英文对照 0.8188），中文查询塌成同一个方向。
- 端到端图搜评测（23 张缩略图人工标注 11 自然/12 UI，随机基线自然照片平均排名 ≈12/23）：`叶子 植物` 8.9、`花` 9.5、`森林 树` 9.5、`软件界面 截图` **10.0**——四个意图完全不同的查询几乎分不开，连「软件界面 截图」都把植物照片排到平均线以上。
- 换多语言塔不是改配置：`jinaai/jina-clip-v1` 中文文本塔确实正常（0.9251→0.708），但视觉塔在 transformers.js 下 `AutoProcessor` 不产出 `pixel_values`、`ImageProcessor` 报维度不匹配，要手写预处理，且 768 维需全库重索引、首次下载 ~200MB；两个 chinese-clip 的 ONNX 转储仓库在镜像上 401。
- 另有与模型无关的口径缺陷：`minScore=0.2` 对任何查询都放行 18–22/23 条（中英文皆然），AI 面板等于「全库排序」，无法表达「没有好结果」。

**执行（同日决定后随即拆完，−2136/+55 行 / 27 文件）**：整条 CLIP 链路删除，不是只关掉入口——

- 主进程：`EmbeddingService.ts` 与 `photos.ts` 里 9 个 AI handler（semanticSearch / embeddingStatus / embeddingIndexAll / suggestTags / suggestDescription / suggestName / autoTagLibrary / findSimilarVisual / aiAvailable）+ preload 对应通道与 `photos:embedding` 进度事件；
- 数据：migration `019_drop_photo_embeddings` 丢弃 `photo_embeddings` 表（001 的 CREATE 不回改），并去掉删除素材时对该表的清理；
- 渲染层：AI 搜索开关（TitleBar 搜索范围面板 + 筛选维度 `aiSemantic` chip + 设置页总开关）、`usePhotoSearch` 的 aiSearchMode/语义防抖/建索引进度、`aiMatches` 结果池与「AI 语义搜索结果」分组、设置页 AI Search / 什么是 AI Search / 模型状态三段、预览页 ✨AI 命名 / ✨AI 建议 / ✨AI 建议描述；tab 状态去掉 `aiSearchMode` 字段；
- 依赖：`@huggingface/transformers` 移出 package.json（149MB 权重缓存随之离开依赖目录）；
- 保留：`找相似` 仍在，只剩 pHash 一档（原「CLIP 视觉优先、pHash 兜底」两档合并）；设置页原「AI 搜索」页签改名「内容识别」——OCR 与文档正文抽取两段配置一直挂在该页签下，删掉 AI 三段后它并不空。

本轮为测量而修的三处缺陷（`isAiAvailable()` 在 pnpm 布局下恒 false、模型缓存落进 `node_modules`、建索引静默零向量）随 `EmbeddingService` 一并删除，**已不在代码里**；它们的价值是结论性的——「本机 AI 不可用」的旧判断从未真实反映过硬件，推理其实一直可跑。日后若仍需图像向量，这三条是要重踩的坑，故记在案。

**验证**：真机 CDP 探针 9 项——preload 上 10 个 AI 通道全部 undefined、26 条素材仍可读（迁移没破坏数据）、关键词搜索 23→8、预览可打开且无 AI 按钮残留、找相似切到相似视图、设置页页签改名且 AI 三段消失、OCR/文档抽取仍在、无新增控制台错误；探针把持久化视图改写后又还原。`typecheck` 干净、`vitest` 384/384（−9 条来自随链路一起删掉的两个 embedding 测试文件与一条 AI 结果池用例）。

**待决**：DeepSeek 当前 API 无视觉输入，纯文本模型只能吃文件名/扩展名/EXIF/已有标签，看不到画面内容。刚被删掉的 `suggestTags`/`suggestName`/`suggestDescription`（看图给名/给标签）无法由它直接等价替代——接入前要先定「图片侧信号从哪来」。

## Decision-018 · 右栏宽度收成一个 token；F8 高级模式从「加宽」改为「信息全展开」

**日期**：2026-09-20

**背景**：用户对照 Eagle 发现第三栏看着不固定。实测三处漂移——`PhotoInspector` `w-[260px]`、
`FolderInspector` 与 `LibraryInfoPanel` 各 `w-60`(240)，同一个右栏槽位三个值，
选中/取消卡片时右栏跳 20px；`docs/COMPONENTS.md` 四轮条目写着「检查器宽度统一 240」，代码早已不符。

**决策**：

1. 右栏宽度单一来源 `--shell-inspector-w: 250px`，三个面板共用。取 Eagle 4.0 CSS 精确提取值
   （`.inspector{width:250px}`，`layout-metrics.spec.md` 已注明旧 AX 值 240 作废），不再用各组件自带宽度。
2. 左侧栏 `--shell-library-panel-w` 280→300（同上，`.sidebar{width:300px}`）。
3. F8「进入高级模式」保留入口（Eagle 卡片菜单原名「进入高级模式 F8」不动），但语义从「加宽检查器」
   改为「检查器信息全展开」：窄栏 250px 里不放也不该放的字段在此出现——文件路径、原始路径（copy 模式导入）、
   像素总数、感知哈希、内容哈希；三个日期与 EXIF 拍摄时间补到秒，GPS 4→6 位小数，EXIF 值与
   图片文字/文档正文取消截断、正文可视高度 128→288px。

**依据**：改前 `expanded` 这个 prop 在整个 `PhotoInspector.vue` 里只出现在根元素的宽度 class 一处，
没有任何内容跟着变——按 F8 得到的是一栏 384px 空白，这正是用户截图里的样子。
Eagle 的右栏是固定宽度，所以「加宽」本来就不是对齐目标；把 F8 变成有实际产出是补救，
而不是保留一个只会留白的开关。宽度不持久化（`inspectorExpanded` 仍是 `ref(false)`），保持既有权衡。

**验证**：真机 CDP 探针取实际渲染宽度，左栏 300、右栏三态（资源库信息 / 素材检查器 / 文件夹检查器）
全部 250；F8 前后右栏 250→250 不变，高级字段 0→4→0，添加日期 `04:18`→`04:18:50`→`04:18`；
探针导航进文件夹后已还原到原入口「未分类」。`typecheck` 干净、`vitest` 402/402、
`prettier --check` 六个改动文件全绿（`index.vue`/`SettingsView.vue` 既有告警未触碰，HEAD 副本对照过）。

## Decision-019 · 预览弹窗收成 Eagle 式图标条，功能不减但只留高频可见

**日期**：2026-09-20

**背景**：用户对照 Eagle 指出预览界面功能太多。改前的预览顶栏是 10 个带文字的 `px-4 py-2` 大按钮
（关闭/上一张/下一张/收藏/找相似/幻灯片/设为壁纸+▾/更多/红色「从库中移除」），CJK 标签在窄窗口里
折成两三行；底部另有一块 `max-h-[38%]` 的 `bg-white/10` 大卡装着两列元数据 + EXIF + 描述/标签双列。
合计约三成窗口高度不是画面。

**决策**：预览是「看图」的地方，工具栏不该长成第二个应用壳。

1. 顶栏全部收成 32px 纯图标键（`.pv-icon`），只留 关闭 / 翻页 / 评分 / 收藏 / 幻灯片 / ⋯。
   图标直接用 Eagle 提取资产（`ic-toolbar-close`、`ic-toolbar-prev/next`、`ic-favorite-add/remove`、
   `ic-toolbar-play`、`ic-status-pause`、`ic-more-actions`），经 `AppIcon` 的 mask + currentColor 染色。
2. 低频与破坏性动作收进 ⋯ 菜单：找相似、设为壁纸（按屏适配）、壁纸适配方式…、重命名、
   在文件夹中显示、用默认应用打开、复制文件路径、导出、丢到回收站。**功能一个没删**，
   只是不再常驻——红色大按钮挂在预览里等于把「删掉这张」做成默认动作，收起来更安全。
3. 快捷键提示改为建框时浮出、5s 淡出（`.pv-hint`），不再整列占位。
4. 底部两行常驻（注释 / 标签 + 一行元数据摘要），完整元数据与 EXIF 收进「详情」折叠面板。
5. 顺手修一处错位：详情里标签写「拍摄时间」但值一直取 `createdAt`，改为 `takenAt ?? createdAt`。

**取舍**：`openWallpaperMenu` 的签名从 `(event: MouseEvent)` 改为 `(x, y)`——入口从工具栏 ▾ 挪进
⋯ 菜单回调后，需要的是打开时的坐标而不是事件对象。

**验证**：真机 CDP 探针——顶栏 7 个图标键高度全为 32px、无一折行；⋯ 菜单 9 项齐全；
「详情」展开可见文件名与 EXIF 区；注释框 34px→54px 随内容自增（上限 88px）、底色已回到透明
（首版漏了 `bg-transparent`，textarea 默认白底铺成一条白带，已修）；→ 翻页与 Esc 关闭未回归；
`vitest` 402/402（含预览 AI 门禁 6 条）、`typecheck` 干净、`prettier --check` 全绿。
探针点了一次 ✨AI 摘要与标签，事后核对素材 `1de0b758`：描述仍为空、标签仍是原有 5 个，未落库。

**同日续做（看图态收口）**：淡出与边缘翻页。顶栏 / 缩放 HUD / 底部两行合并成一个 `chromeVisible`
状态，鼠标静止 2.2s 一起淡出、一动即回；指针停在外框上（`pinChrome`）或焦点在外框输入框里时不收，
否则淡出后既点不回来也打断打字。简报模式控制栏的 `briefControlsVisible` / `resetBriefControlsTimer`
并入同一套计时，删掉旧的两条并行通道。左右边缘各一条 56/80px 悬停带，浮现 40px 圆形 ‹ › 键
（`opacity-0 group-hover:opacity-100`），带内空白仍走「点背景关框」；首/末张那侧的带整个不渲染。
探针复验：三组外框静止 2.9s 后 opacity 全为 0、指针停在顶栏 2.9s 仍为 1、在注释框里打字 3s 不收、
失焦后再静止归 0、hover 边缘带 opacity 0→1 且点击确实换图（1/27 → 2/27）、点带内空白预览关闭。

## Decision-020 · 入库即拷贝进资源库，撤掉「引用原文件」那一档

**背景**：F11 做过一个库级开关 `library:storage-mode`，两档 `reference | copy`，**默认是引用**。
它从未真正生效过一次：默认库登记为 `legacy`（根就是 userData，没有 `images/`），
而 `activeRoot()` 对 legacy 返回 null，`copyIntoLibrary()` 直接返回 null——选了拷贝模式
也是静默引用。设置页那段说明文字（「会复制到资源库 images/ 目录，Eagle 行为」）因此一直是假的。
实测唯一那个库 5,178 条活跃素材里 `source_path` **0 行有值**，5,152 条 `file_path`
直指 `~/Desktop`（含从 Eagle 包里引用出来的 11 条）。

于是「改写磁盘」类动作与引用模式叠加出三处真风险：`replaceFile` 复制新字节后**无条件
`unlinkSync(旧路径)`**（引用模式下就是删用户桌面上的原件）；`renameFiles` 直接 `renameSync`
用户目录里的文件；旋转/翻转有 `materializeIntoLibrary` 保护，但在 legacy 库一律抛错不可用。
（对照：图片旋转那条从一开始就写明了「就地改写等于动用户自己的东西」——同一个道理没推全。）

**决定**：向 Eagle 的模型收敛，**导入即拷贝**，撤掉开关。

1. `activeRoot()` 不再对 legacy 返回 null（legacy 的库根就是 userData，`images/` 与
   `thumbs/` 等一样平铺在其下）；`migrateIntoLibrary` / `materializeIntoLibrary` 的
   「旧版库布局不支持」抛错分支随之删除——它们曾经是这条路真正的堵点。
2. 副本落 `<库根>/images/YYMM/<原名>`，重名走 `uniqueFilePath`（`名 2.ext`）。
   **刻意不加 uuid 前缀**：`file_name` 就是卡片/检查器显示的那一行，旧实现
   `<uuid8>_原名` 会让每个导入项都顶着乱码前缀。Eagle 也是保原名（`images/<id>.info/原名.ext`）。
3. 重复导入按 `source_path` 认旧行（迁移 025 给它加索引）：副本名不再唯一稳定，
   按 `file_path` 去重认不出「这就是刚才那个文件」，不查就会拷第二份、建第二行。
4. `storage:getMode` / `setMode` 两条通道 + preload 桥 + 设置页那颗两档按钮全删；
   设置页那段说明改为陈述事实，「迁移引用文件入库」不再被 `storageMode !== 'copy'` 禁用
   （恢复前那个按钮在任何情况下都是灰的）。
5. 监控文件夹与 F8 剪贴板监听原来注入的是 `photoRepository.addPhotos`（绕过拷贝，
   也绕过 `assertImportablePath` 与敏感文件黑名单）→ 改注入 `photoStore.addPhotos`。
6. 清空回收站从此**删库内副本**（Eagle 也是这一步才真删字节），但 `isInsideLibrary()`
   为假的行一律不碰磁盘——旧数据里那些指向桌面的原件，删掉它们是毁用户数据。
7. `replaceFile` 改成：新字节 `copyIntoLibrary` 进库 → 换绑 → 仅当旧文件在库内才 unlink。

**取舍**：库里从此自持一份字节（实测这个库的全部素材 104.8 MB，磁盘剩 48 GB，代价可忽略），
换来的是编辑/删除/重命名终于可以对用户自己的文件零副作用。引用模式不是被"禁用"而是被删除——
保留它就保留一套「按钮点了不生效 + 三个动作会改磁盘原件」的组合，那是负资产。

**验证**：`e2e/storage-copy.spec.mjs`（真 app + 真临时库）钉住：副本进 `images/`、
**原名不变**、`source_path` 有值、原件字节不动、同名不同文件落成「名 2.ext」且不互相覆盖、
重复导入不产生第二份、dryRun 数出 candidate 且不动文件、真迁移后原文件仍在原处、
清空回收站后库内副本消失而库外文件清单逐字节不变。判别性：临时把拷贝分支短路成
旧行为 → 停在第一条「副本落在库内」。`e2e/import-chain.spec.mjs` 与 533 条单测同时绿，
`typecheck:node` 干净。

## Decision-021 · Chinese-CLIP 语义搜索回归，推翻 D-017 的「整条下线」

**日期**：2026-09-23

**决策**：AI 语义搜索整条链路装回，文本塔换用 **Chinese-CLIP**（`Xenova/chinese-clip-vit-base-patch16`，
512 维），中文文搜图 + 以图搜图恢复可用。

**与 D-017 的关系**：D-017 的**诊断**继续成立——英文 CLIP 的文本塔对中文塌缩（四个不相关中文查询
两两余弦 0.9251），本决策不翻案这条实测；推翻的是它的**结论**。D-017 选「下线」的前提是
「换塔不可行」：jina-clip 要手写视觉预处理 + 768 维全库重索引，而两个 chinese-clip 的 ONNX
转储仓库当时在镜像上 401。到 09-23，`Xenova/chinese-clip-vit-base-patch16` 的 fp32 融合图
两件套已经可从 hf-mirror 拉到（镜像地址写死在服务里）——前提消失，结论随之重估。

**实施要点**：

1. 模型落 `userData/models/chinese-clip-vit-b-16`（model.onnx 753,665,706 B + tokenizer.json
   439,124 B）；`EmbeddingService` / `ClipEmbeddingService` 重建，词表闸 21,128 条——专门挡
   jina 那种 30,528 条英文词表混进来（词表配错不会报错、只会静默糊掉，这是 D-017 一轮里
   「模型在位但配错不响」教训的制度化）。
2. 中文文本侧走 WordPieceTokenizer + jieba 分词下推（`querySegment`）；语义条件可下推进智能夹 SQL。
3. 数据层：D-017 用迁移 `019` 丢掉的表，以 `021_photo_vectors` 重建（512 维向量，
   `vec` BLOB；就绪状态不落库，由磁盘 ready 标记文件承载）；
   `@huggingface/transformers` 回到 dependencies。
4. 阈值 `SEMANTIC_MIN_SCORE = 0.40` 沿用，但在**新评测集**上重量判据：原 5 张真照片随 /tmp
   丢失且无副本，改用文生图重造 6 张同题材图进仓 `e2e/fixtures/ai-probe/`——猫 0.4428 /
   面包 0.4965 / 雪山湖 0.4445，池外（钢琴）最高 0.3196，阈值两侧余量 −0.043 / +0.080，
   故沿用不动。图换了先怀疑图、不急着动阈值（第一版三猫同框 0.3993 正好掉线）。
5. 模型来源判定收敛为一条序：`LEAF_MODEL_DIR` → 应用自己下载的落点 → 探针目录——此前
   「模型明明装好了，测试还一直静默 skip」的候选目录顺序问题就此修掉。

**验证**：真模型单测先到「加载与产出层」6 passed（fp32 图可加载、词表闸、512 维单位向量且两次
前向余弦为 1、垃圾字节返回 null、中文分词不塌、不同查询不同向量）；评测图进仓后
`vectors.spec.mjs` 检索质量 8 条 e2e **首次真跑**（中文 top-1、「池子里确实没有」挡成空）。

**已知边界**：阈值是在 6 张生成图的小池上标定的，大库泛化未验；首次下载约 754MB，无增量。
另记一条流程教训：**评测判据不能寄存在系统会清的目录里**（/tmp 被清一次，阈值标定依据就丢了
一次）——fixture 进仓从此是规矩。

## Decision-022 · 智能夹规则形状升级 v2：嵌套条件组 + 组级取反（对齐 Eagle）

**日期**：2026-09-26

**决策**：`photo_smart_albums.rules_json` 升级 v2 形状，支持条件组嵌套（组间/组内各自 AND|OR）
与组级取反（NOT），对齐 Eagle 的「30 组 × 30 规则」嵌套模型。实施计划见
`docs/plans/智能夹形状-实施计划.md`。

**与现状的关系**：编辑器已铺满 43 谓词键（2026-09-26 核验，旧文档「约 16 项」过时），差距纯粹在
形状——引擎 `buildSmartAlbumWhere` 是单组 `match: 'any'|'all'` + `rules[]`，Eagle 侧（asar 代码级
证据 `app/js/plugin/handlers/smart-folder-rules.js`）是组可互套、组可取反、25 种算子。

**实施要点**：

1. **v2 形状**：`{ match, groups?: [{ match, not?: boolean, rules }], rules }`。顶层 `rules` 与
   `groups` 并存（顶层规则 = 隐式单组语义保持向后兼容）；**读侧永远兼容 v1**（无 `groups` 视为
   单组），只有写侧（编辑器保存嵌套后）产出新形状——存量智能夹零迁移、打开保存命中集不变。
2. **引擎递归编译**：`buildSmartAlbumWhere` 改递归（组间按顶层 `match`、组内按组 `match`、组级
   `not` 包一层 `NOT(...)`），SQL 全程参数化照既有 chunk/placeholders 纪律。
3. **防炸闸**：递归深度与节点数上限（超限拒绝并报错，不静默截断）——rules_json 是 JSON 自由文本，
   手改/脚本灌入的深嵌套不能变成启动期炸弹。
4. **正则算子另立 D-023**（M3 时裁决）：SQLite 无原生 regexp，注册 UDF（可下推但每个候选行回调）
   vs 查询后 JS 过滤（破坏下推与分页），涉及性能口径，到 M3 拿基准数据再定。
5. **嵌套智能夹（M4）明确缓做**：Eagle 的智能夹树形主要服务组织感，Leaf 已有文件夹体系；
   是否追以 D-022 的实施反馈再议，不作为 v2 的交付项。

**保留约束**：`semanticIds` 语义下推（D-021）在递归任何一层保持可用；筛选预设/保存的筛选器
（savedFilters）与规则形状解耦不受影响；`OWNED_RULE_KEYS` 既有 43+ 键的键面不变，只加形状。
