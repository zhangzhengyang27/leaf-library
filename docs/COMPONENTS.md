## 9. Edge 壳层重构新增组件（2026-09）

> 素材库独立版参照 Microsoft Edge（Fluent 风格）重构壳层与素材库视图，本节为本次新增/改造组件的清单与约定。
> 视觉一律走 `tokens.css` v4（禁裸色值）；动效走 motion tokens 且尊重 `prefers-reduced-motion`。

### 9.1 TitleBar（替代 TopBar）

- 窗口标题栏行：整条 `-webkit-app-region: drag`，内部控件 `no-drag`；darwin 左侧 80px 红绿灯留白（`titleBarStyle: hiddenInset`，仅 darwin）。
- 结构：Logo ＋ 中部 `LibraryTabStrip` ＋ 右侧操作（搜索→聚焦 ⌘K、主题快切、设置、关于）。
- 高度 `--shell-topbar-h`（2.5rem）不变；win/linux 保留系统标题栏，本组件自动隐藏拖拽留白。

### 9.2 LibraryTabStrip

- Edge 圆角标签页：类型图标＋标题＋关闭 ×；活动 tab 浮起（surface-2 + shadow-xs），非活动透明 hover surface-hover。
- 交互：点击激活、中键/× 关闭、＋ 新建、溢出 ▾ 列表、HTML5 拖拽排序；`⌘T` 新建、`⌘W` 关闭、`Ctrl+Tab` 切换。
- 状态源：`stores/useLibraryTabs.ts`（pinia，localStorage 持久化，至少保留 1 个 tab）。

### 9.3 LibraryPanel（替代 Sidebar）

- 树形资源面板：图库（全部图片/收藏/地图）、智能夹、相册、文件夹、标签（色点+层级）、回收站（badge）；底部固定设置/关于。
- 折叠 = 整栏隐藏（标题栏 ☰ 切换）；活动项 = 圆角填充 pill（bg-brand-500/10，弃左缘色条）。
- 交互：点击在当前 tab 打开、⌘click/中键新开 tab、右键上下文菜单、外部拖拽（卡片）落入相册/文件夹/标签。

### 9.4 FilterBar（原内联筛选条组件化）

- 类型 chips · 色相桶 · 格式/分辨率/时间快筛 · 布局三态 segmented（方格/瀑布流/列表）· 排序 ▾ · 总数。
- 状态随 tab（useLibraryTabs），不再放视图本地 ref。

### 9.5 PhotoToolbar（重构为分组＋溢出）

- 18 个平铺按钮 → 导入▾｜标签·相册·文件夹·智能夹｜查重·重命名·转WebP·书签｜选择模式｜🔒｜⋯ 溢出（危险项收纳）。
- 32px 图标按钮 + 分组分隔线；全部裸色值换 token。

### 9.6 PhotoListView

- 列表布局（补 Eagle 差距 #11）：40px 缩略图 + 名称 + 类型徽章 + 尺寸/大小 + 日期 + 评分 + 标签。
- `layout: 'grid' | 'waterfall' | 'list'` 三态；排序（名称/日期/大小/评分）与网格通用。

### 9.7 UContextMenu（ui 套件新增）

- Fluent 风右键菜单：rounded-lg + shadow-md + fast 动效、键盘可达（↑↓/Enter/Esc）、边缘翻转定位。
- 使用点：网格卡片（含回收站/多选态）、LibraryPanel 节点。

### 9.8 UPromptModal（ui 套件新增）

- 单输入小模态，替代散落的 `window.prompt`（相册/文件夹重命名等）。

### 9.9 composables（views/photos/composables/）

`usePhotoData` / `usePhotoFilters` / `usePhotoSearch` / `usePhotoActions` / `useDuplicateScan` / `usePreview` / `usePhotoKeyboard` / `useConfirmDialog`——`views/photos/index.vue` 收敛为组装层（~300 行）。
`useWallpaper`（新增）：三处「设为壁纸」入口（预览面板 / 卡片右键 / 检查器）共用一份策略菜单与 toast 文案；适配判定与出图在主进程，见 Decision-016。

---

## 9.a Eagle 布局对齐（D-011，2026-09）

- **TitleBar** 重写为 Eagle 单行工具栏：左段 导入▾/布局切换/侧栏开关；中段 ‹ › + 面包屑（路径+总数）；右段 进度 pill/缩略图滑块/筛选开关/⋯更多/主题/设置/关于。
- **LibraryTabStrip** 移除（D-011 去标签页）；**PhotoToolbar** 移除（职责拆入 TitleBar/FilterBar/侧栏组头）。
- **LibraryPanel** 重排：库名行 → 固定项（带计数）→ 智能文件夹/相册/文件夹/标签小节；底部设置/关于移除。
- **FilterBar**：行首搜索框（id=library-search + AI 开关）；选择态 chip「已选 N ✕」。
- **PhotoGrid/PhotoListView**：卡片下方常驻两行（文件名 + 尺寸），Eagle 卡片元信息样式。

## 9.b 三轮像素级对齐（2026-09-03，对照 Eagle 4 真机实测）

- **TitleBar** 控件顺序对齐 Eagle：左段 🔔通知/＋导入/▤侧栏；右段 −滑块+/⚡插件(打开 PluginCenterModal 插件中心，D-025)/⋯更多/▦布局/▽筛选▾(维度池)/🔍搜索（最右）。主题/设置/关于移入「更多」菜单（原生菜单 ⌘, 亦有设置）。「更多」常驻任意页面。
- **DimensionPoolPopover**（新组件）：筛选维度池弹层（搜索+图钉），TitleBar 漏斗▾ 与 FilterBar「＋」共用；图钉集经 `leaf:dimensions-changed` 事件跨组件同步（localStorage 单源）。
- **LibraryPanel**：固定项=全部/未分类/未标签/随机模式/标签管理/回收站（Eagle 顺序；「未加标签→未标签」）；删「全部标签」与「快捷入口」组（收藏/最近添加/最近查看转为智能文件夹组预置行）；删侧栏标签组（标签归「标签管理」页）；智能文件夹组头去计数；文件夹树逐行 ▸ 折叠（`leaf.sidebar-folder-expanded` 持久化，默认折叠）；文件夹右键=打开/重新命名/新建文件夹(预选父级)/新建智能收藏夹/删除。
- **PhotoGrid** 卡片简介两行对齐 Eagle：L1 `格式: X 尺寸: W × H 文件大小: Y`（视频音频=时长段，书签=域名，字体=字体）＋ L2 `修改日期: … 创建日期: …`（10px 灰字）。
- **PhotoInspector** 单选结构对齐：类型徽标＋置顶 pin 头部 → 预览图(高160 contain) → 6 快捷图标(默认应用/Finder/复制/以图搜图/重命名/回收站) → 名称就地编辑 → 注释 → 标签 → 文件夹 → 基本信息(评分星+尺寸/文件大小/格式/时长/添加/创建/修改日期) → EXIF(含拍摄) → 主色/插件 → 底部「导出」整宽按钮；批量态保留原操作区。
- **index.vue** 网格空白区右键菜单（新建文件夹/新建智能收藏夹/粘贴⌘V/全选⌘A/重新加载⌘R/文件夹视图含「打开文件夹设置…」）；卡片命中守卫走 `[data-photo-id]/.photo-item`。
- **filterDimensions** 默认图钉集与顺序=颜色/标签/文件夹/形状/评分/格式（Eagle 实测）。
- 视图：`random` = 侧栏「随机模式」专有视图（候选池打散，与 shuffle 开关叠加）。

## 9.c 四轮整窗对照修正（2026-09-03）

- **卡片**：文件名 + 单行简介（`showSummary` 枚举 none/dimensions/size/added/modified/created，LayoutPopover 简介下拉）；扩展名徽章移至缩略图左上；网格平铺（移除日期分组头）。
- **常驻右栏**：新 `LibraryInfoPanel.vue`（无选中/非文件夹视图时显示：视图过滤输入框 + 基本信息 文件数/文件大小）；检查器宽度统一 240（w-60）。
- **筛选 chips**：新 `DimensionChip.vue` + `OptionRow.vue`——图标+文字按钮弹层化（颜色/标签/文件夹/形状/评分/格式），激活态描边；其余维度暂保留内联控件。
- **侧栏**：组头 chevron/＋ 悬停显现；文件夹树缩进参考线（PanelRow `depth`）。

## 9.b 三轮像素级对齐（2026-09-03，对照 Eagle 4 真机实测）

- **TitleBar** 控件顺序对齐 Eagle：左段 🔔通知/＋导入/▤侧栏；右段 −滑块+/⚡插件/⋯更多/▦布局/▽筛选▾(维度池)/🔍搜索（最右）。主题/设置/关于移入「更多」菜单（原生菜单 ⌘, 亦有设置）。「更多」常驻任意页面。
- **DimensionPoolPopover**（新组件）：筛选维度池弹层（搜索+图钉），TitleBar 漏斗▾ 与 FilterBar「＋」共用；图钉集经 `leaf:dimensions-changed` 事件跨组件同步（localStorage 单源）。
- **LibraryPanel**：固定项=全部/未分类/未标签/随机模式/标签管理/回收站（Eagle 顺序；「未加标签→未标签」）；删「全部标签」与「快捷入口」组（收藏/最近添加/最近查看转为智能文件夹组预置行）；删侧栏标签组（标签归「标签管理」页）；智能文件夹组头去计数；文件夹树逐行 ▸ 折叠（`leaf.sidebar-folder-expanded` 持久化，默认折叠）；文件夹右键=打开/重新命名/新建文件夹(预选父级)/新建智能收藏夹/删除。
- **PhotoGrid** 卡片简介两行对齐 Eagle：L1 `格式: X 尺寸: W × H 文件大小: Y`（视频音频=时长段，书签=域名，字体=字体）＋ L2 `修改日期: … 创建日期: …`（10px 灰字）。
- **PhotoInspector** 单选结构对齐：类型徽标＋置顶 pin 头部 → 预览图(高160 contain) → 6 快捷图标(默认应用/Finder/复制/以图搜图/重命名/回收站) → 名称就地编辑 → 注释 → 标签 → 文件夹 → 基本信息(评分星+尺寸/文件大小/格式/时长/添加/创建/修改日期) → EXIF(含拍摄) → 主色/插件 → 底部「导出」整宽按钮；批量态保留原操作区。
- **index.vue** 网格空白区右键菜单（新建文件夹/新建智能收藏夹/粘贴⌘V/全选⌘A/重新加载⌘R/文件夹视图含「打开文件夹设置…」）；卡片命中守卫走 `[data-photo-id]/.photo-item`。
- **filterDimensions** 默认图钉集与顺序=颜色/标签/文件夹/形状/评分/格式（Eagle 实测）。
- 视图：`random` = 侧栏「随机模式」专有视图（候选池打散，与 shuffle 开关叠加）。

## 9.c 四轮整窗对照修正（2026-09-03）

- **卡片**：文件名 + 单行简介（`showSummary` 枚举 none/dimensions/size/added/modified/created，LayoutPopover 简介下拉）；扩展名徽章移至缩略图左上；网格平铺（移除日期分组头）。
- **常驻右栏**：新 `LibraryInfoPanel.vue`（无选中/非文件夹视图时显示：视图过滤输入框 + 基本信息 文件数/文件大小）；检查器宽度统一 240（w-60）。
- **筛选 chips**：新 `DimensionChip.vue` + `OptionRow.vue`——图标+文字按钮弹层化（颜色/标签/文件夹/形状/评分/格式），激活态描边；其余维度暂保留内联控件。
- **侧栏**：组头 chevron/＋ 悬停显现；文件夹树缩进参考线（PanelRow `depth`）。

## 十五轮（2026-09-16，Eagle 4.0 同屏实拍对齐）

- **PhotoInspector**：预览图左上扩展名徽标、预览下方主色板色点行（006 `palette`，无值退化单主色）、
  名称框纯名（保存自动拼回扩展名）、日期斜杠式、未归类文件夹区块「＋」、右下 `?` 帮助钮（开命令面板）、
  导出按钮深灰、移除 ✕（面板显隐走布局弹层「检查器」开关）。
- **AssetThumb**：新增文本内容预览卡（kind=file 且 txt/md/json 等，懒加载 readTextFile，400 字截断）。
- **TitleBar**：搜索框右侧 ˅ 下拉（AI 语义搜索开关 + 最近搜索历史 + 清除，localStorage 上限 10）；
  新增 ✦ 动作按钮（⚡ 与 ▦ 之间，Eagle ic-toolbar-action 同位）；移除 ⋯更多按钮（入口迁原生菜单）。
- **ActionsModal + useAssetMacros**：素材动作宏 MVP——步骤（重命名/加标签/评分/备注/转WebP/移入文件夹）
  顺序执行于当前选中，localStorage `leaf.macros.v1`；空态「建立动作」引导。
- **LibraryPanel**：文件夹右键补「在新窗口中打开」「改变颜色…」（007 `color`，二级色板 9 色，
  侧栏图标染色覆盖名称派生色）。
- **index.vue 卡片菜单**：按 Eagle 4.0 实拍重排；新增 在新窗口打开 / 插件… / 分享（降级复制） /
  添加至上次使用的文件夹…（FolderModal 归组时记录）。
- **libraryTabs**：`boot-view` 参数驱动新窗口初始视图；引导窗口（sessionStorage 标记）不回写持久化。

## 右栏宽度收口（2026-09-20，对齐 D-018）

- 新增 token `--shell-inspector-w: 250px`（Eagle 4.0 `.inspector{width:250px}`，实测记录见
  本地归档 `references/eagle/`）。右栏三个全高面板——`PhotoInspector` /
  `FolderInspector` / `LibraryInfoPanel`——一律用它，此前是 260 / 240 / 240 三个值，
  选中与取消选中会让右栏跳 20px。
- `--shell-library-panel-w` 280→300（同上 spec 的 `.sidebar{width:300px}`）；
  左侧栏宽度只有 token 一处，`index.vue` 折叠动画与 `TitleBar` 红绿灯避让都读变量。
- F8 高级模式不再加宽检查器（`expanded` 此前只影响宽度 class，加宽后是一栏空白）：
  改为信息全展开——基本信息尾部多出 文件路径 / 原始路径 / 像素总数 / 感知哈希 / 内容哈希，
  三个日期与 EXIF 拍摄时间补秒、GPS 补到 6 位小数，EXIF 值与图片文字/文档正文不再截断。

## 预览弹窗去挤（2026-09-20，对齐 D-019）

- **PhotoPreview 顶栏**改为单行 32px 图标键（`.pv-icon`）：关闭 / 上一张 / 下一张 / 文件名 + 计数 /
  评分五星 / 收藏 / 幻灯片 / ⋯ 更多。图标全部走 `AppIcon`（本地图标资产，mask + currentColor）。
  低频与破坏性动作（找相似、设为壁纸、壁纸适配方式、重命名、在文件夹中显示、用默认应用打开、
  复制文件路径、导出、丢到回收站）收进 ⋯ 菜单，不再有常驻红色「从库中移除」大按钮。
- **快捷键提示**（`shortcutHint`）不再常驻占一整列：`.pv-hint` 建框时浮出，5s 内自动淡出。
- **缩放 HUD** 的「100% / 适应」文字键换成 `ic-toolbar-zoom-actual` / `ic-toolbar-zoom-fit` 图标键，
  百分比数字保留可读。
- **外框静止淡出**：顶栏 / 缩放 HUD / 底部两行共用 `chromeVisible` 一个状态，鼠标静止 2.2s 一起淡出、
  一动即回；指针停在外框上（`pinChrome`）或正在外框的输入框里打字时不收。简报模式控制栏并入同一套计时
  （原 `briefControlsVisible` / `resetBriefControlsTimer` 已合并删除）。

## 插件中心（P1 离线核心，D-025 · 2026-09-27）

- **PluginCenterModal**（components/plugins/）：三栏中心——分类 tab+搜索｜插件列表（来源徽标
  内置/已导入/开发者目录 + USwitch 启停）｜详情（描述/权限清单/入口/卸载）。导入 `.leafplugin`
  走 `plugins:pickAndImport`（选文件→权限确认→落盘）；卸载/安装过 requestConfirm。取代旧
  PluginManagerModal 的 TitleBar 挂载（文件保留）。
- **usePluginRegistry**（composables/）：渲染层插件单例——全量列表 + enabledPlugins 视图 +
  乐观启停（IPC 失败回滚）；reload 自吞错误（消费方 onMounted void 调用）。
- **PluginService 扩展**：setEnabled/isEnabled（pref `plugins:enabled:<id>`，缺失=启用）、
  uninstall（仅 userData/plugins 安装件）、importPlugin（yauzl 解包 + zip slip 防护 + 同 id 拒绝）、
  listAll（ManagedPlugin：+enabled/+source）。类型单源 `src/shared/plugin.ts`。
- 消费方 PhotoInspector/PhotoPreview 改读 enabledPlugins——禁用插件扩展点即时消失。
