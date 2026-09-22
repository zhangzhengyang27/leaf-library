# BUGS · Phase 0 排查结论（2026-08-29）

基线：typecheck node/web ✅ · vitest 294/294 ✅ · ESLint 15 error / 1170 warning ⚠️ · 存量硬编码样式 ~95 文件含 hex ⚠️

## 修复进度（Phase 1-3 完成后）
- ✅ B2 窗口去重：`modules/windows.ts` 增加窗口登记表，同 route 复用（focus + 进程内导航）
- ✅ B3 滚动复位：AppShell 增加 `.app-scroll` 标记类，scrollBehavior 兼容两种容器 + savedPosition 恢复
- ✅ B4 主题同步：新窗口 backgroundColor 跟随 nativeTheme + setTheme 广播 `theme:changed` +
  preload 暴露 `onThemeChanged` + useTheme 订阅
- ✅ B5 快照推送：preload 补 `subscribeSnapshot()`，MiniTimer 订阅后触发
- ✅ B6 监听器泄漏：useCursorHighlight 命名 handler + 卸载清理，删除 ipc/onPos 死代码
- ✅ B7 导出进度：`clip:exportProgress` 改发 `event.sender`
- ✅ B14 魔法数字：Sidebar 改用 `--shell-topbar-h` / `--shell-sidebar-w` token
- ✅ B16 lint-css-changed 解析缺陷（见下文）
- ✅ B17 幽灵类（见下文）
- ✅ B18 photos 原生 alert/confirm + 非品牌色 `bg-blue-500`：替换为 UToast / UModal 二次确认 /
  UTabs 筛选，高度改 `calc(100vh - var(--shell-topbar-h))`
- ✅ B1 贴图窗口：新增 PinPage + /screenshot/pin 路由 + preload onSetShortcuts（见下文）
- ✅ B8 录制双轨：写入侧登记新 SQLite 记录（start/finalize）、删除走 recording.remove
  （带旧 JSON 回退）、统计改为本地计算（见下文）
- ✅ B9 ESLint error：全量清零（渲染层 + 主进程 0 error）
- ✅ B10 通知回调契约：改为 notification:event 事件模型（见下文）
- ✅ B11 ClipEditor 无效清理：play/pause 用具名 handler
- ✅ B12 右键菜单监听泄漏：SnippetList / Sidebar / Editor 全部保存句柄并在卸载时移除
- ✅ B13 死通道：删除 ping、platform:quit；其余预留通道集中登记（见下文）
- ✅ B15 examples 死订阅：补齐 local-shortcut-triggered / window-shortcut-triggered 发送方
- ✅ B19 检查器壁纸入口不可达：按钮在「多选」footer（`v-else-if="photos.length > 0"`）里，
  而其 `v-if="canSetWallpaper"` 依赖 `single`（仅单选为真）→ 两个条件互斥，永远渲染不出来。
  随 Decision-016 移入单选 footer，与「导出」胶囊并排

## 🔴 高严重度

### B1 贴图（pin）功能整体断裂
- 现象：截图编辑器点「贴图」创建的置顶窗口永远空白
- 根因：`PinService.ts:175` 加载 `#/screenshot/pin`，但 `router/index.ts` 无此路由（hash 模式无 catch-all）；
  主进程推送的 `pin:setImage` 无人接收（`onSetImage` 全仓库 0 调用）；
  `pin:setShortcuts` 连 preload 封装都没有；9 个 pin 通道闲置
- 修复：补 `/screenshot/pin` 路由 + PinWindow 组件（onMounted 调 `onSetImage`），preload 补 `onSetShortcuts`；
  或移除贴图入口

### B2 窗口无限堆积
- 根因：`main/index.ts:149` 的 `create-new-window` 无条件 `new BrowserWindow`（`modules/windows.ts:6`），
  无按 route 去重/复用，返回值丢弃；每个新窗口自带 ⌘1-9 快捷键（useModuleShortcuts），可指数开窗
- 修复：主进程建窗口登记表，同 route 已开则 `focus()`；快捷键注册加主窗口守卫

### B3 路由切换滚动不回顶
- 根因：`router/index.ts:27-39` scrollBehavior 查找 `.App-router`，但该容器只存在于 2 个沉浸式路由；
  常规路由滚动容器是 AppShell 的 `<main>`，querySelector 返回 null；`return { top: 0 }` 滚的是不可滚的 window
- 修复：统一两种分支的滚动容器类名；savedPosition 恢复改用真实容器

### B4 多窗口主题不同步
- 根因：`ipc/preferences.ts:24` setTheme 只写 store 不广播；`windows.ts:17` backgroundColor 写死 `#fafafa`（暗色闪白）
- 修复：setTheme 后 `BrowserWindow.getAllWebContents().forEach(wc => wc.send('theme:changed'))`；
  backgroundColor 改为读偏好

## 🟡 中严重度

### B5 迷你悬浮窗实时同步断裂
- 根因：`modules/pomodoro.ts:207` 等 `subscribeSnapshot` 请求才开始推送，但 preload 未暴露该方法
- 修复：preload 补 `subscribeSnapshot()`，MiniTimer 在订阅 onTraySnapshot 后调用

### B6 useCursorHighlight 监听器泄漏
- 根因：`useCursorHighlight.ts:37-41` 两个匿名 window listener 无清理；onUnmounted 只调 stop()
- 影响：多次进出录屏页后光标推送触发 N 次，闭包阻止 GC
- 修复：提取命名 handler，onUnmounted 中 removeEventListener；顺带删除未用的 `ipc`/`onPos` 残留（L31-45）

### B7 剪辑导出进度只发主窗口
- 根因：`ipc/clips.ts:68` 硬编码 `mainWindow.webContents.send`；从副窗口导出进度条永不动
- 修复：改用 `event.sender`

### B8 录制新旧双轨并存（需产品决策）
- 现状：`recording.*` 28 个新通道已注册，渲染端仅接入 4 组（region/cursor/systemAudio/shortcut.getConfig）；
  保存仍走旧 `screen-recorder:saveFile`（useScreenRecorder.ts:118）；`recording-history:addHistory` 无人调用
- 建议：录屏模块重做时全面切换新 SQLite 通道，废弃旧链路

### B9 ESLint 15 error
- `no-undef EventListener`（类型当值用）、5 处空 catch 块、`prefer-const` ×2、
  computed 无返回值、`no-require-imports` ×2、`no-unused-vars` ×2
- 修复：Phase 5 逐个清零

## 🟢 低严重度

### B10 notification 回调契约虚假
- `index.d.ts` L455-525 五处声明 `onClick/onClose` 函数参数——函数不可过 structured clone，
  传入即抛 "An object could not be cloned"，不传则恒为 undefined
- 修复：删除类型字段；改事件模型（`notification:event` 频道按 id 分发）

### B11 ClipEditor 清理无效
- `ClipEditor.vue:307-316`：removeEventListener 传新匿名函数引用，no-op（video 元素销毁兜底，低危）

### B12 snippets 条件性监听泄漏
- `snippets/Sidebar.vue:201`、`SnippetList.vue:196`、`Editor.vue:615`：菜单展开时卸载组件，document 监听存活到下次全局点击（自愈型）

### B13 死通道 ~40 个
- 主进程注册但渲染端 0 调用：usage.toggleFavorite/isFavorite/clearRecent/removeFavorite、
  photos.getAll/getAllTags/search 等 10 个、snippet.deleteSnippet/restoreSnippet/getStatistics/emptyTrash、
  platform.setDockBadge/setProgressBar/requestUserAttention、pomodoro.sendNotification/mini.show/mini.isVisible 等
- 处理：UI 重做时按需接入（usage 收藏、photos 批量操作等有真实价值），其余标注「预留」或删除

### B14 TopBar 高度魔法数字 ×3
- `TopBar.vue:28` h-10、`Sidebar.vue:30` sticky top-10 + h-[calc(100vh-2.5rem)]
- 处理：Phase 3 壳子重做时改 flex 布局 + `--shell-topbar-h` 变量，三处魔法数字整体删除

### B15 examples 死订阅
- `local-shortcut-triggered` / `window-shortcut-triggered` 主进程无发送方，demo 两张卡片永无响应

### B17 Onboarding/MigrationCenter 使用未定义的「幽灵 Tailwind 类」（已修复）
- 根因：两视图按未落地的 token API（`bg-bg-base` / `text-text-primary` / `border-border-subtle` /
  `ring-focus` 等）编写类名，但 tailwind.config.js 从未定义 `bg` / `text` / `border` 色组，
  全部类静默失效 → 引导页/迁移页样式实际是裸的
- 修复：重写为 v2 token（`fg-*` / `surface-*` / `line-*` / `shadow-ring-focus`）

### B18 photos 页原生对话框 + 跑偏配色（已修复）
- `photos/index.vue` 用原生 `alert()` / `confirm()`（Electron 中观感差、阻塞渲染进程）；
  筛选按钮用 `bg-blue-500`（脱离品牌色板）；`height: 100vh` 未扣除 TopBar 高度
- 修复：UToast（成功/失败反馈）+ UModal 二次确认 + UTabs 筛选 + token 化高度与底色

### B19 wallpaper 模块界面/交互问题（已修复）
- `index.vue` 自维护 Toast 状态机 + 局部 Toast 组件 → 改为全局 `useToast`（局部 Toast.vue 已删除）
- 分页回顶用 `window.scrollTo`（window 不可滚，实际无效）；`LocalFileLibrary` 用
  `querySelector('.overflow-y-auto')` 会命中页面上任意第一个滚动容器 → 均改为定位真实容器
  （`.app-scroll` / scoped ref）
- 手搓 switch（`switch-slider` + 硬编码 `#4a90e2`）→ USwitch；原生 input/select → UInput
- 非品牌色 `bg-blue-500/600`、`bg-gray-*` 全量替换为 v2 token
- 播放模式由原生 radio 改为 UCheckbox 时需保持单选语义：仅在勾选时 emit（否则写入 false 非法值）
- 死引用 `categoryBarRef`（声明未使用）已删除

### B20 snippets 模块界面/交互问题（已修复）
- `Editor.vue` 全局样式写死 `.CodeMirror { background-color: white !important }` ——
  暗色主题下编辑器仍是白底（主题类已切换但被该规则覆盖）→ 改为 `var(--surface-1)` 等 token
- `SnippetList` / `Sidebar` 的原生 `confirm()` → 应用内 UModal 二次确认
- 右键菜单 document 监听在组件卸载时不清理（`showSnippetContextMenu` /
  `showFolderContextMenuHandler`）→ 保存句柄并在 onBeforeUnmount 移除（B12）
- `Editor.vue` 搜索框换组件后 `searchInputRef` 不再指向 DOM，脚本 `focus()` 失效 → 保留原生 input
- 三个组件约 2500 行硬编码 CSS（`#e0e0e0` / `#1976d2` / `#fafafa` 等）全量替换 v2 token

### B21 番茄钟主题适配在 auto 模式下失效（已修复）
- 根因：`TaskEditDialog` / `HourHeatmap` / `ProjectDonut` 用
  `html[data-theme='light']` 打浅色补丁，但默认主题是 `auto`（`data-theme='auto'`），
  补丁不生效 → 浅色系统下对话框沿用深色值（白字浅底）、图表文字不可见
- 修复：改为「基础样式=浅色 + `html.dark` 覆盖深色」，覆盖 dark 与 auto+深色系统两种情况
- 连带：番茄钟引用的 11 个 CSS 变量（`--pomo-dialog-*` / `--pomo-input-*` /
  `--pomodoro-drawer-*`）从未定义，仅靠单一主题 fallback → 全部收归 tokens.css 并按 .dark 切换
- 该模块 60 处存量硬编码色（`#6b7280` / `#4a90e2` / `#1f2937` 等）已替换为新增的
  `--pomo-text-muted/soft/faint`、`--pomo-accent`、`--pomo-panel*` 等语义 token

### B22 录屏模块幽灵渐变 + 主题/布局问题（已修复）
- **`bg-gradient-primary` 被 13 处引用但从未定义**（Tailwind 与 CSS 均无）→ 录屏页背景为空，
  而其上元素多为 `text-white` / `bg-white/10`，浅色主题下白字白底不可读
  → 定义 `--gradient-primary`（浅/深成对）并接入 `tailwind.config.js` 的 backgroundImage
- Layout 用 `h-screen`：位于 AppShell 的 main 内，多出顶栏高度导致内容裁切/双滚动条 → 改
  `calc(100vh - var(--shell-topbar-h))`
- 导航标签依赖深色渐变的白字 → 改为主题感知（品牌色激活态 + 下划指示条）
- 6 个未定义 CSS 变量（`--bg-primary` / `--bg-secondary` / `--bg-hover` / `--border-color` /
  `--primary-color` / `--primary-hover`）仅带深色 fallback → 剪辑时间轴/转场选择器在浅色下
  强制深色，现按主题定义
- `RecordingExportDialog` 的 `recommendedBitrate` computed 的 switch 缺 default →
  分辨率不在预设列表时返回 `undefined`，会写入 API 请求 → 补 default 兜底 5000
- `Layout.vue` 用 `as EventListener`（纯类型，运行时不存在）→ 去掉断言（eslint no-undef）
- ClipPage 空态白字 → UEmpty

### B1 贴图窗口空白（已修复）
- 根因：`PinService` 加载 `#/screenshot/pin`，但路由表无此路由 → Vue Router 无匹配，窗口永远空白；
  `pin:setImage` / `pin:setRotation` 推送无组件接收，`pin:setShortcuts` 连 preload 封装都没有
- 修复：新增 `views/screenshot/pages/PinPage.vue` + `/screenshot/pin` 路由（hideInSidebar）；
  preload 补 `onSetShortcuts`，并让 `onSetImage` / `onSetRotation` 返回取消订阅函数；
  index.d.ts 补齐 pin 的 on* 与 removeListeners 类型声明
- 实现要点：无边框窗口拖拽需 `-webkit-app-region: drag`（只能写在 CSS 类里，
  放内联 style 会被 vue-tsc 判为非法 CSSProperties 键）；控制条用 `no-drag`

### B23 截图主页为 demo 级页面（已重做）
- 旧版仅一个标题 + 一个硬编码 `#1890ff` 按钮，且所有样式写死
- 现提供：主 CTA、截图总数/占用空间/保存目录概览、最近截图宫格（悬浮操作：打开 / 在访达中显示）、
  存储用量与目录设置、截图完成后自动刷新列表
- 注意：`screenshot.onCapture` 未返回取消函数，重复进出会叠加监听 → 用模块级标记保证只注册一次

### B8 录制新旧双轨（已收敛；剩余项已登记）
- 现状澄清：RecordingHistory 的**读取早已走新通道** `recording.list`（带 JSON fallback），
  早期审计结论有误；真正仍走旧通道的是：写入登记、删除、统计
- 已改：
  - 写入：`useScreenRecorder` 在录制开始时调 `recording.start()` 登记 SQLite 记录，
    保存成功后 `recording.finalize()` 落库（任一环节失败静默，旧链路不受影响）
  - 删除：优先 `recording.remove()`，查不到（legacy JSON 记录）时回退旧通道
  - 统计：改为基于新数据源本地计算（旧实现读 JSON，与新数据源数量/大小对不上）
- 仍走旧通道（新通道无对应能力，保留）：`openFile` / `showInFolder` / `updateThumbnail` /
  `clearHistory` —— 需要主进程补充 shell.showItemInFolder、缩略图生成、批量删除等新通道后
  才能进一步收敛

### B10 通知回调契约（已修复）
- 删除 `index.d.ts` 中 5 处 `onClick` / `onClose` 字段（共 10 个），
  `NotificationOptions` 中标记为 `never` 并注明原因
- 新增事件模型：`NotificationService.onNotificationEvent()` → IPC 层广播
  `notification:event`（`{ id, kind: 'click' | 'close' }`）→ preload 暴露 `notification.onEvent()`

### B13 死通道（已清理 + 预留登记）
- 删除：`ping`（electron-vite 脚手架残留）、`platform:quit`（preload 从未暴露，
  Dock/托盘菜单在主进程直接 app.quit()）
- 保留为预留 API（渲染端尚未接入，不删除以免误伤）：`usage.toggleFavorite/isFavorite/
  clearRecent/removeFavorite`、`photos.*` 10 个、`snippet.deleteSnippet/restoreSnippet/
  getStatistics/emptyTrash`、`tag.getTagById/updateTag`、`folder.getFolderById/
  getFoldersByParentId`、`platform.setDockBadge/setProgressBar/requestUserAttention`、
  `pomodoro.*` 若干、`screenshot.history.*` 若干、pin 除 create 外全部
- 建议：随各模块 UI 重做顺手接入（如 Home 加星标按钮即可用上 usage.toggleFavorite）

### B24 截图覆盖层硬编码色（已 token 化）
- 背景：截图工具条 / 延时选择器 / 窗口选择器 / 历史面板 / OCR 结果等悬浮在截图之上，
  **必须恒定深色**以与任意截图内容形成对比（同 macOS 截图 UI）——不能改成主题 token，
  否则浅色主题下会变成白面板盖在截图上
- 处理：新增一组恒定深色的 `--shot-*` token（panel / panel-raised / panel-hover / border /
  text / text-dim / text-muted / text-faint / accent / accent-soft / shadow），
  覆盖层组件 6 个 + 画布组件 2 个的硬编码全部替换
- 保留为数据色（非样式，不应 token 化）：`ScreenshotsColor` 的调色板数组
  `['#ee5126', '#fceb4d', ...]` —— 这是供用户选择的颜色值

### B16 lint-css-changed 静默跳过已暂存文件（Phase 1 中发现并已修复）
- 根因：`scripts/lint-css-changed.mjs` 固定 `line.slice(3)` 解析 porcelain 行；文件处于已暂存状态
  （`M ` 前缀，行内少一个分隔空格）时截掉路径首字符 → `existsSync` 失败 → 该文件被静默排除，
  严格 CSS 检查形同虚设
- 修复：改为 `^(..)\s+(.+)$` 正则解析，兼容未暂存/已暂存/未跟踪三种形态

## 死通道核查中确认无问题的项
- 渲染层调用但 preload 未暴露：无
- 主→渲染推送频道名拼写：全部一致
- screenshot ready/ok/cancel/save、region-overlay、appMenu 跳转链路：闭环 ✅
- router beforeEach 3s 超时兜底：settled 互斥正确，无 next() 双调 ✅

## 修复排期
- B3/B14 → Phase 3 壳子重做时根治
- B2/B4/B5/B6/B7 → Phase 5
- B1 → Phase 4 截图模块重做时决定功能去留
- B8 → Phase 4 录屏重做时切换新通道
- B9/B10/B11/B12 → Phase 5
- B13/B15 → 随各模块重做顺手处理
