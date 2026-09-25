# Leaf 素材库 · 全库代码审查报告

- **日期**：2026-09-18
- **范围**：全仓库（src/main、src/preload、src/renderer、native/macos-share、extension（含 chrome/ 双实现）、plugins、scripts、e2e、根配置），约 290 个源文件 / 5 万行
- **方法**：按模块分 9 组并行逐文件深读（每个文件完整读取），五维检查清单（正确性 / 资源 / 性能 / 安全 / 可维护性），发现须沿调用链交叉验证后才可上报；**全部 P0/P1 再由主审逐条亲读源码复核**，P2/P3 保留原始证据（行号 + 置信度），未逐条二次复核
- **统计**：去重后 **129 条** —— P0×2、P1×13、P2×34、P3×80

## 严重级别定义

| 级别 | 含义 |
|---|---|
| P0 | 核心功能失效 / 任意代码或 SQL 执行 |
| P1 | 功能整体失效（静默）/ 明确安全漏洞 / 明确 bug |
| P2 | 安全隐患（需组合条件）/ 性能缺陷 / 非默认路径的功能错误 |
| P3 | 边界 bug、可维护性、死代码、测试有效性 |

---

## 一、Top 10 优先修复清单

| # | 问题 | 级别 | 类型 | 预估 |
|---|---|---|---|---|
| 1 | 全局搜索链路整体失效：spec 不带 searchKeyword + 主进程忽略 query + advancedAst 被 gating 吞掉 | P0 | 正确性 | 0.5~1 天 |
| 2 | 分页游标 `e` 字段渲染层可控 SQL 片段 → 任意 SQL 执行 | P0 | 安全 | 0.5 天 |
| 3 | `tagNamesExact` 漏推 N 个绑定参数 → 标签「完全匹配」必抛 RangeError | P1 | 正确性 | 10 分钟 |
| 4 | preload 漏暴露 `convertPhotos`（批量转换 100% 失效）+ `getDuplicateGroups` 丢 opts（查重模式失真） | P1 | 正确性 | 1 小时 |
| 5 | 分页加载无请求序号守卫：快速切换筛选/页签显示过期数据（家族性，含 8 处同型） | P1 | 正确性 | 1 天 |
| 6 | `onPaste` 依赖 Electron 38 已移除的 `File.path` → 粘贴导入静默失效 | P1 | 正确性 | 1 小时 |
| 7 | PhotoGrid `renamingId` 死属性 → 右键/F2/⌘R 重命名静默失效 | P1 | 正确性 | 1 小时 |
| 8 | 安全面三连：`renameFiles` pattern 未消毒（任意文件移动）、`storage:relinkPhoto` 任意换绑（绕过 pathPolicy 读任意文件）、`system:openWith` appPath 未白名单（变相 RCE） | P1 | 安全 | 1 天 |
| 9 | 打包正确性：files 只负向模式夹带 170MB 开发目录；extension 未进 extraResources（打包版扩展引导失效） | P1/P2 | 正确性 | 0.5 天 |
| 10 | PluginSandbox CSP 注入可被构造 HTML 绕过（`</head>` 首个匹配落在注释内） | P1 | 安全 | 0.5 天 |

---

## 二、P0（2 条，均经主审亲读源码复核）

### P0-1 全局搜索链路整体失效：默认分页路径返回全库，昨日的「高级语法下推」未生效

**位置**（四处叠加，缺一不成立，均已核实）：
- 渲染端 `src/renderer/src/views/photos/composables/usePhotoFilterSpec.ts:50-53`——`buildFiltersSpec()` 注释自述「不含搜索词；搜索词由调用方单独传」，spec 永远不带 `searchKeyword`；
- `usePhotoSearch.ts:48-56`——防抖回调只把 `advancedAst` 塞进 spec，`query` 仅作为独立参数传 `loadSearchPage(true, query, spec)`；
- 主进程 `src/main/ipc/photos.ts:305-307`——`case 'search': where = 'deleted_at IS NULL'`，声明的 `req.query`（:260）在整个 handler 中从未使用；
- 主进程 `src/main/db/smartAlbumRules.ts:281、301`——关键词与 `advancedAst` 的编译整体 gating 在 `if (rules.searchKeyword && ...)` 内，因此 spec 中仅有 `advancedAst` 也是死代码。

**展示端闭环**：`usePhotoFilters.ts:646-651`——分页搜索开启（默认）且池关键词比对一致时，直接返回分页池内容、不再做客户端关键词过滤。

**影响**：键入任何关键词，先短暂显示客户端过滤的正确结果，约 250ms 后被「未过滤的全库 imported_at DESC 前 N 条」覆盖。搜索（含高级语法）实质失效且具有误导性。回滚开关 `leaf:use-paged-search` 是唯一可用路径。

**建议**：三处择一，推荐 a)：
- a) 渲染端把 `spec.searchKeyword = query`（及 searchScopes）并入 spec，主进程 search 分支保持 `buildSmartAlbumWhere(req.filters)` 即可生效；
- b) 主进程 search 分支把 `req.query` 并入 filters 后再 `buildSmartAlbumWhere({ ...filters, searchKeyword: req.query })`——注意同时修复 P3-71 的 advancedAst gating；
- c) 无论如何补一条集成测试：`getPage({ view:'search', query, filters })` 断言结果不含未命中关键词的素材。

### P0-2 分页游标自描述键表达式 `e` 直接内插 SQL——渲染层可构造游标执行任意 SQL

**位置**：
- `src/main/db/pageCursor.ts:36`——`decodePageCursor` 只校验 `e` 是数组，不校验元素内容；
- `src/main/db/repos/PhotoRepository.ts:945-948`——`decoded.e` 非空即作为 `keyExprs` 传给 `buildKeyChainCond`；
- `PhotoRepository.ts:190-197`——`sql = \`(${expr} ${cmp} ?)\``，`expr` 即注入点（WHERE 内子查询可执行）。

**证据链**：渲染端 `cursor` 经 `photos:getPage`（photos.ts:326）原样透传 → base64url(JSON) 解码 → `e` 数组元素直接拼进 WHERE。注入示例 `{r:1, e:["CASE WHEN (SELECT COUNT(*) FROM photo_photos)>0 THEN 1 ELSE 0 END"]}` 可按行差分盲读全库（photo_photos / tag_tags / pref_preferences）。与 photos.ts:254-255 与 PhotoRepository.ts:908 两处注释自述的信任模型「渲染层不可传 SQL 片段 / where 由主进程构造」直接矛盾。附带缺陷：`ks`/`e` 长度与元素类型不校验，旧格式 `{c,r}` 游标配双键排序时以 `undefined` 绑定报错；跨 sort 复用游标会漏/重页。

**建议**：游标不再携带 `e`（续页按本次请求的 `sort` 重新查 `PAGE_SORT_KEYS` 取表达式）——最小改动且消除整类问题；若保留兼容，`decodePageCursor` 后校验 `e` 每个元素严格等于 `PAGE_SORT_KEYS` 登记的表达式，且 `ks.length === e.length`。补「占位符数 == 参数数」不变量测试（见 P3-6）。

---

## 三、P1（13 条，均经主审亲读源码复核）

### P1-1 `tagNamesExact` 漏推 N 个绑定参数，「完全匹配」查询必抛 RangeError

`src/main/db/smartAlbumRules.ts:260-267`：`NOT EXISTS (... NOT IN (LOWER(?),...))` 生成 N 个占位符，但循环里 push 的参数全部被前面的 EXISTS 条件消费，NOT IN 的 N 个占位无参数。better-sqlite3 抛 `Too few parameter values were provided`。真实 UI 路径：标签筛选「完全匹配」（TagsFilterPanel → `usePhotoFilterSpec.ts:74`）与智能收藏夹同规则。**建议**：NOT EXISTS 后补 `params.push(...rules.tagNamesExact)`。

### P1-2 `renameFiles` pattern 分支未消毒，可把库内文件移动到任意路径

`src/main/db/repos/PhotoRepository.ts:1107-1119`：`{id,name}` 分支过了 `sanitizeFileNameBase`，`{id,pattern,start}` 分支的 `pattern` 原样 `replace(/\{n\}/g)` 后拼进 `joinPath(dir, newName)`，`../` 可逃出素材目录并 `renameSync`。IPC 入口 `ipc/photos.ts:510` 无字段校验。**建议**：pattern 同样过 sanitizer；落盘前 `path.relative(dir, target)` 校验不越出 `dir`。

### P1-3 `storage:relinkPhoto` 接受任意路径换绑，架空 pathPolicy 形成任意文件读取链

`src/main/ipc/storage.ts:25-32` → `PhotoDataStore.ts:159-162` → `PhotoRepository.ts:1648-1657`：仅校验 `existsSync`，无对话框、无 `isOpenPathAllowed`。换绑后该路径即成「已入库素材」，下游 `photos:readTextFile`（photos.ts:77-129）、`photos:copyBase64`（:696-706，≤5MB 任意字节回传）、`photos:openWithDefault`（:708-718）全部放行——可读取 `~/.ssh/id_rsa` 等。**建议**：改为主进程弹 `showOpenDialog`（对齐 replaceFile），或至少过 `isOpenPathAllowed`。

### P1-4 `system:openWith` 的 `appPath` 未白名单——变相 RCE

`src/main/ipc/system.ts:112-141`：filePath 有白名单，`appPath` 仅 `existsSync`。darwin `execFile('open', ['-a', appPath, filePath])` 可指定 Terminal.app 打开已入库的任意脚本（`photos:add('/tmp/evil.sh')` 即可通过 filePath 白名单）；win/linux `execFile(appPath, [filePath])` 直接执行任意二进制。代码注释（:108-111）自述此威胁，但缓解只覆盖 filePath。`system:revealInApp`（:165-181）同病，风险略低。**建议**：appPath 必须来自 `system:pickApp` / `system:listFileManagers` 的会话级白名单。

### P1-5 preload 漏暴露 `photos.convertPhotos`，批量格式转换 100% 失效

`src/preload/index.d.ts:349` 声明、`usePhotoActions.ts:624` 实际调用，但 `src/preload/index.ts` photos 块只有 `convertPhotosToWebP`（:360），无 `convertPhotos`。调用即抛 `not a function`，用户只看到「转换失败」。主进程 handler 存在（ipc/photos.ts:668）。**建议**：补一行透传；并加 CI 比对 d.ts 键集与实现键集防再漂移（本组另有一条同型：P1-6）。

### P1-6 preload `getDuplicateGroups` 丢弃 `opts`，查重模式与范围被静默改写

`src/preload/index.ts:329-330` 只透传 `threshold`；`index.d.ts:298-301` 声明 `{ mode, photoIds }`；`useDuplicateScan.ts:79-82` 实际传参；主进程支持（photos.ts:363-367、PhotoRepository.ts:1511-1516）。UI 显示「相同文件 · 已选/当前视图」，实际永远 phash 全库扫描——hash 精确匹配变相似匹配 + 大库卡顿。**建议**：补 opts 透传。

### P1-7 分页加载无请求序号守卫，重置请求在飞行中被丢弃、旧响应以新筛选身份展示

`src/renderer/src/views/photos/composables/usePhotoData.ts:116`（`if (mainPageInFlight) return`，布尔在飞标记）、同模式 ：231-233 / :290-292 / :316-319 / :370-371；spec watch（usePhotoFilters.ts:557-566）只 `void data.loadPhotos()`，被丢弃后无重试；展示端（usePhotoFilters.ts:742-747）仅凭 `mainPagedActive` 就跳过 matchAll。筛选 A 在途时切到筛选 B，B 的重载被静默丢弃，网格持续显示 A 的结果。**建议**：每池引入单调递增 seq（落地时比对，过期即弃）或 AbortController；重置请求在飞行中应替换而非丢弃；显示层可附带 spec 指纹兜底。相关同型：P2-11（useDuplicateScan）、P2-13（FolderInspector loadStats）、P2-14（FreeformCanvas 文件夹切换）、P2-15（PhotoPreview zip/字体）、P3-33（usePhotoSearch 防抖跨页签）。

### P1-8 `deleteWithUndo` 异步失败静默，撤销链路同样无错误处理

`src/renderer/src/views/photos/composables/usePhotoActions.ts:175-198`：`void promise.then(...)` 外包同步 try/catch，catch 捕获不到异步拒绝——删除 IPC 失败时无 toast、选中集不清理；撤销回调 `restoreMultiple(...).then(...)` 无 `.catch`，且撤销成功后未刷新回收站计数。**建议**：改 await + try/catch，或补 `.catch(toast.error)`；撤销成功后补 `loadRecycleBin()`。

### P1-9 `photoIndex` 只覆盖主池，回收站/收藏/文件夹池的 `byIds` 返回空，多个右键操作静默失效

`usePhotoData.ts:40-50` 索引仅在主池加载（:129-130、:164-167）与 replacePhotoLocal（:491）维护；trash/favorites/folder/search 池不写入。回收站素材永不在 allPhotos → index.vue:484「在访达中打开」必然空转；:763-771 分享、:913-917 复制文件、:804-810 复制路径同因；文件夹分页窗口外的素材同样命中；:553 拼图 disabled 判定 `[].every(...)===true` 恒假值。**建议**：`byIds` 回退线性查各内容池，或各池加载时同步维护索引。

### P1-10 ⌘V 粘贴文件导入在 Electron 38 下静默失效（仍读取已移除的 `File.path`）

`usePhotoImport.ts:174-176`：`Array.from(dt.files).map(f => f.path)`——Electron ≥32 已移除 `File.path`（同文件 ：108 注释自证并在 onDrop 迁移到了 `webUtils.getPathForFile`，onPaste 漏迁）。paths 为空 → `importPaths([])` 直接 return，且走不进 IPC 回退分支。**建议**：onPaste 复用 onDrop 的 preload 解析；全失败时给出显式提示。

### P1-11 PhotoGrid `renamingId` 是死属性，就地重命名整体失效

`PhotoGrid.vue:327` 声明 prop、:337 默认值，但全文件只用本地 `renamingPhotoId`（:506-509，仅 `startRename` 赋值），模板判定 :155/:212/:271 均用本地值，无 `watch(props.renamingId)`。父层 index.vue:781（右键）与 ：1108-1110（F2/⌘R）只写 `renamingId.value`，从未调用 `startRename`。PhotoListView 连 prop 都没有。**建议**：PhotoGrid 内 watch prop 触发 `startRename`，或父层直调暴露的方法。

### P1-12 PluginSandbox CSP 注入可被构造 HTML 绕过，插件网络封禁失效

`src/renderer/src/components/plugins/PluginSandbox.vue:36-40`：`html.replace(/<\/head>/i, ...)` 只替换第一个 `</head>`；恶意插件 HTML 让首个 `</head>` 出现在注释/属性中，meta 落入无效位置，插件回到「无 CSP」状态——`connect-src 'none'` 的封网目标失效，可 fetch/WebSocket 外传 payload（:47/:53 postMessage 注入的素材元数据）。前置条件是安装恶意插件（用户可安装目录）。**建议**：DOMParser 解析后向真实 `<head>` prepend；或改自定义协议加载、以 HTTP 响应头下发 CSP。另注：`connect-src 'none'` 拦不住 WebRTC，可注入置空 `RTCPeerConnection`。

### P1-13 electron-builder files 只负向模式，安装包夹带约 170MB 开发内容

`electron-builder.yml:5-15`：仅负向 ignore 时 electron-builder 自动补默认 `**/*`（dot:true），`.pnpm-store`（实测 170MB）、docs/、test-results/、.codebuddy/、native 构建中间产物等全部进 asar。**建议**：追加显式排除（`!**/.pnpm-store/**`、`!docs/**`、`!test-results/**`、`!.codebuddy/**`、`!e2e/**`、`!scripts/**`、`!extension/**`、`!native/**`），或改正向白名单 `['out/**','package.json',...]`。关联 P2-30：extension 未进 extraResources 导致打包版「安装扩展」引导失效。

---

## 四、P2（34 条，紧凑格式；证据为行号级，置信度标注）

### 安全类（9）

1. **`services/ClipServer.ts:350-356、70`** `fromBase64` 的 `body.ext` 未过白名单直接拼文件名，`../../` 可逃出 clips 目录任意写文件（同入口 fromUrl 有白名单，唯独此口未设防）→ ext 强制白名单或最终 `basename` 复检。【置信度高】
2. **`ipc/photos.ts:983-1048` + `ipc/watchedFolders.ts:7-10`** `photos:getFilesFromFolder` / `watched:add` 接受任意目录，递归枚举文件清单回传渲染层（侦察面）→ 建立用户选过的目录白名单。【高】
3. **`ipc/photos.ts:139-160、696-706`** 导入类接口接受任意路径 + `copyBase64` 无扩展名限制 → 「导入任意文件→读回内容」外传原语；短期给 copyBase64 加 kind 约束（排除 TEXT_EXTS）。【中】
4. **`services/PhotosLockService.ts:30-34` + `FolderLockService.ts:14-20`** 设置密码不验旧密码（lockClear 反而要求验）、verify 无速率限制 → 被利用的 renderer 可静默重置锁 → 主进程强制「已设密码时 set 前须 verify」+ 失败退避。【高】
5. **`services/BookmarkService.ts:38-58、61-86`** fetch/截图只校验初始 URL，重定向后不复查（对照 ClipServer.downloadImage 逐跳校验）→ `redirect:'manual'` 逐跳 + `will-navigate` 拦截。【高】
6. **`extension/background.js:41-54`** 扩展侧对页面收集的任意 URL 直接 fetch（带 Cookie、绕过应用端 assertPublicUrl）→ 内网 SSRF/CSRF 桥 → 校验公网或删掉扩展内 fetch 回退。【高】
7. **`plugins/hello-inspector/index.html:60-101`（同 exif-metadata、media-info）** 元数据未转义写 innerHTML，恶意文件元数据可在插件 iframe 执行脚本并自导航外带 GPS → textContent / escapeHtml（hello-formatter 是正确样板）。【中】
8. **`extension/chrome/manifest.json:6-17`** host_permissions `<all_urls>` + 全站常驻 content script 超出最小必要 → 收敛为 activeTab+scripting 按需注入；根目录版同查。【高】
9. **`ipc/screenshots.ts:11-16`** `screenshot.settings.set` 的 saveDir 未校验 → 任意目录写文件（文件名/扩展名受限）→ 设置时主进程校验来源。【中】

### 正确性类（14）

10. **`db/repos/PhotoRepository.ts:647-667`（及 relink 系列 :1648-1679）** replaceFile 更新 file_name 不更新 file_ext → 格式筛选/排序键/m016 部分索引对该行永久失真 → 一并 `file_ext = extOfFileName(...)`。【高】
11. **`db/repos/PhotoRepository.ts:1101-1126`** renameFiles 无事务、中途抛错留半完成批，重试序号错位 → 预检 + 结构化返回成功/失败清单。【中】
12. **`db/photoSimilarity.ts:69-83`** MIH segmentVariants 只枚举半径 ≤2，threshold ≥12 漏配对（当前 UI 固定 10，潜伏）→ 补 distance-3 或显式拒绝。【高】
13. **`views/photos/components/SmartAlbumModal.vue:302-368`** 编辑/保存智能夹静默丢弃 `descriptionExact`/`sourceUrlExact` 规则 → 回填与输出补上。【高】
14. **`views/photos/components/PhotoInspector.vue:429-448、798`** EXIF 折叠后迷你地图不初始化、旧 maplibre 实例泄漏（watch 依赖缺折叠态）→ watch 加 `inspectorCollapsed.exif`。【高】
15. **`views/photos/components/LibraryPanel.vue:313 等 8 处`** prompt onSubmit 异步回调无 try/catch，IPC 失败弹窗永久卡住（UPromptModal.vue:28-35 无 catch）→ 在 UPromptModal 统一 catch 一处止血。【高】
16. **`views/photos/components/PhotoPreview.vue:896-928`** ZIP 条目加载/提取无竞态守卫无 catch：连点显示错误条目、失败后「提取中…」永久卡住 → 加 photoId 守卫 + catch。【高】
17. **`usePhotoData.ts:394-396、469-473`** 搜索池 loadMore/重置不带 spec → P0-1 修复后导入/翻页即丢筛选 → `loadSearchPage` 缓存 lastSearchSpec。【高】
18. **`views/photos/index.vue:435-460`** `pagedViewTarget()` 不含 `'search'`：loadMoreSearch/searchHasMore UI 不可达，搜索永远只有第一页 200 条 → 补 search 分支。【高】
19. **`usePhotoData.ts:490-502`** replacePhotoLocal 不更新 favorites/searchPool/unsorted/recent 池 → 分页收藏视图取消收藏后卡片状态陈旧 → replaceIn 补齐四池。【高】
20. **`usePhotoActions.ts:244-271`** handleRemoveAll 确认弹窗显示窗口条数（≤500），实际清空全库 → 改用 `photos:getCount()` 取真实总数。【高】
21. **`usePhotoFilterSpec.ts:42-48` vs `useAdvancedSearch.ts:227`** hasAdvancedSyntax 双实现语义漂移（`cat -dog` 两处判定相反）→ 删副本统一引用。【高】
22. **`App.vue:338-341`** 一次性迁移标志只在读到持久化数据时写入：新用户第二次启动布局/显示设置被静默改写（waterfall→auto、showName/showSummary 关闭）→ 标志在 loadPersisted 入口无条件写入，或给 JSON 加版本号。【高】
23. **`App.vue:84-89、138`** 原生菜单 bookmark/new-smart/map 漏包 `runInLibrary`：非 photos 路由触发无效果且状态残留（TitleBar.vue:230、LibraryCommandPalette.vue:62/68 同病）→ 统一套 runInLibrary。【高】

### 性能/资源类（11）

24. **`services/ThumbnailService.ts:48-64、95-108`** 缩略图非原子直写 + thumb:// 协议与后台管线并发 generate 同一文件 → 交叉写坏图被永久缓存 → 临时文件+rename 或 in-flight Map 去重。【高】
25. **`services/PsdThumbnail.ts:87-104`** RAW 分支临时 .raw 成功路径不删 → 每张 RAW-PSD 泄漏数 MB tmp → try/finally rmSync。【高】
26. **`services/OcrService.ts:93-112`** worker 初始化/语言包下载失败也被写 `ocr_text=''` → 永不再重试（listOcrPending 条件 `IS NULL`）→ 区分错误类别，瞬时失败保留 NULL。【高】
27. **`services/ClipboardWatcherService.ts:70-76`** 剪贴板有图时每秒全图 PNG 编码+md5（大图数百 ms 主线程阻塞）→ 廉价指纹（getSize+抽样哈希）。【高】
28. **`views/photos/components/PhotoGrid.vue:169-281、379-421`** masonry/justified 布局函数模板内直调无 computed 缓存，任意选中变化全量重排+整树 diff；`cutPhotoIds.includes` 每卡片 O(n) → 布局 computed 化、剪切片 Set 化。【高】
29. **`ipc/libraries.ts:340-356`** 跨库 moveTo 两段事务无回滚补偿（目标库提交后源库失败→两库重复）；merge/move 全同步阻塞主进程 → 失败补偿删除或异步+进度。【高】
30. **打包**：`extension/`（含 chrome/）被默认文件集打进 asar 而 `system:getExtensionDir`（ipc/system.ts:63-66）用 `app.getAppPath()` 定位 → 打包版「在 Finder 显示扩展目录」指向 asar 内不存在路径，扩展引导静默失效 → extension/chrome 进 extraResources + 主进程改 `process.resourcesPath`。【高】
31. **`modules/libraryRegistry.ts:39-66`** 注册表非原子写（崩溃留截断 JSON）+ parse 失败静默重建为仅默认库（用户库「消失」）→ 临时文件+rename；坏文件改名备份并告警。另每次调用 readFileSync 无缓存（P3-58 相关）。【高】
32. **`modules/protocols.ts:16-25、43-47`** image:// 契约：渲染端 `encodeURI` 不编码 `#`（Chromium 截断 fragment）+ Windows 反斜杠改写，而主进程查库是 `file_path = ?` 精确匹配 → 文件名含 `#` 全平台 404、Windows 原图预览全挂 → 双侧路径归一化 + 逐段 encodeURIComponent（AssetThumb.vue:277、PhotoPreview.vue:1293-1301、HoverPreview.vue:25 同改）。【#/高；Windows/中（未实测 Windows）】
33. **`utils/clipboardPaths.ts:24`** 只接受 `/` 开头路径 → Windows 剪贴板导入整体失效 → `isAbsolute()` + `fileURLToPath`。【中（未实测 Windows）】
34. **`views/SettingsView.vue:720-722` + `LibraryCommandPalette.vue:119-122`**（+ 各 UModal 实例）Esc 处理器互不感知，一次 Esc 同时关闭多层 overlay → 统一「Esc 栈」或层级检查。【高】

---

## 五、P3（80 条，按模块一行式）

### 主进程 · 数据层（db）
1. `smartAlbumRules.ts:281-338` advancedAst 嵌套在 searchKeyword 判断内：AST-only 规则退化为 1=1（P0-1 修复时必须同步外提，否则高级语法仍失效）
2. `dbBackup.ts` 全文件死代码且内含危险逻辑（import 覆盖现库前不备份）→ 删除
3. `PhotoRepository.ts:1584-1630` importMany 死代码 + 不维护 usage_count；001 迁移 file_path 无 UNIQUE 兜底
4. `PhotoRepository.ts:771-833、1220-1247、1492-1576` 多处全量加载/N+1（getUnsortedPhotos 全表、getPhotosByDateSection 全量分组、批量打标签逐张 2 查、查重结果逐 id 取）
5. `PhotoRepository.ts:566-623` updatePhoto(Partial<Photo>) 合同误导：实际只持久化 4 字段，其余静默丢弃 → 类型收窄
6. `db/__tests__/photoPage.test.ts、014_assets.test.ts` 分页关键路径无测试：多键游标、恶意/旧游标、tagNamesExact 占位符、advancedAst 均未覆盖（P0-2/P1-1 直接逃逸）→ 补「占位符数==参数数」不变量测试
7. `PhotoRepository.ts:785-796` getDateSections 按 UTC 分桶与 dateSectionOf 本地时区不一致（现无调用方）

### 主进程 · 服务层（services）
8. `LogService.ts:172-193` 磁盘日志无轮转清理（DB 侧有界、磁盘无界）
9. `LogService.ts:104-160` 每次 warn/error 触发 COUNT(*) 全表，注释与实现矛盾
10. `ClipServer.ts:183-265` 剪藏入库主线程同步大 IO（writeFileSync + 同步入库）→ setImmediate/worker 队列
11. `PluginService.ts:52-69` parseManifest 不校验 category 枚举
12. `AssetProcessingService.ts:171-199、279-287` 进度计数跨批次不重置，retry 后 done/total 失真
13. `BookmarkService.ts:42-47` fetch 全量下载后才截断，无传输上限 → 流式读 200KB 即 cancel
14. `AssetProcessingService.ts:398-407 + ThumbnailService.ts:70-92` 同一 1024 预览被解码 3 次、原图 2 次 → 一次 raw 解码喂三方
15. `AssetProcessingService.ts:331-358` 视频抽帧与时长探测两个 ffmpeg 串行 → Promise.all
16. `WatchedFoldersService.ts:204-212` setEnabled(false) 后在途扫描仍会导入（collect 后不复查）
17. `EmbeddingService.ts:254-275、367-401` indexMissingPhotos 可重入，共享 progress 串扰 → 本地计数器 + 复用在跑任务

### 主进程 · IPC / stores
18. `ipc/photos.ts:127 等 10 处` handler 把原始 fs 错误 message（含绝对路径）回传渲染层 → registerHandlers 统一包装为 `{ok:false, code}`
19. `stores/PhotoDataStore.ts:59-74` copy 模式逐文件调用 activeRoot() → 每次同步读盘解析 libraries.json（5000 文件 = 5000 次读）
20. `ipc/photos.ts:60、432-442` getAll/ocrStatus 全量扫描传输；getDateSections 未用 repo SQL 版；getRecent 负数 limit 变无限制 → COUNT(*) 下推 + limit 钳制
21. `ipc/preferences.ts:24-33` setTheme 不校验 THEME_VALUES，任意值持久化并广播
22. `ipc/photos.ts:249-252` clearAll 一条 IPC 软删全库无二次把关 → 确认 token 或主进程对话框
23. `ipc/libraries.ts:139-180` mergeFrom 全量行单事务同步遍历，大库冻结主进程（与 #29 关联）

### 主进程 · modules / utils / 入口 / preload
24. `modules/appMenu.ts:87-95` 库子菜单启动时固化，库变更不重建；「清除缓存并重新加载」实际只 relaunch
25. `index.ts:80-87` second-instance 无窗口时未重建主窗口（macOS 全关后再启动无反馈）
26. `index.ts:56-62` uncaughtException/unhandledRejection 只 console 吞掉，DB 异常时带伤运行
27. `modules/windows.ts:84-88` 生产 will-navigate 放行任意 file:// URL（窗口仍带 window.api）
28. `modules/protocols.ts:67-75` HEIC 预览主进程同步 readFileSync 整图 → net.fetch 流式透传
29. `modules/libraryRegistry.ts`（性能面）每次调用同步读盘+parse，热路径反复触发 → 模块内缓存
30. `preload/index.ts:356-357` renamePhotos 内联类型与 d.ts/主进程联合形状不一致（运行时碰巧兼容）

### 渲染层 · 核心（App/stores/utils）
31. `stores/libraryTabs.ts:537-554` invalidateViews 回退「全部」时维度筛选泄漏（setView 有 applyFreshFilterFields，此处没有）
32. `utils/color-extractor.ts` 246 行死代码 → 删除
33. `usePhotoSearch.ts:48-57` 防抖回调读 tabs.active：250ms 内切页签把关键词写到新页签 → 捕获 tab 并校验
34. `useDuplicateScan.ts:60-98` runDuplicateScan/handleFindSimilar 无在飞守卫与 seq → 慢响应覆盖新视图
35. `views/photos/index.vue:435-460` unsorted/recent/recents 视图 hasMore 落主池：滚动到底反复加载永不显示的页 → 固定 hasMore=false
36. `views/photos/index.vue:798-803` 右键菜单 async 派发器大量裸 await 无 catch；handleUnlock 同
37. `usePhotoActions.ts:161-170` addTagToMany 不刷新标签字典：新标签不在筛选面板出现 → 补 loadDictionaryTags()
38. `usePreview.ts:31-43` 地图视图预览翻页池用 flatDisplayPhotos，可翻到无坐标素材 → 支持显式池参数
39. `App.vue:195-221` organize-tag-clear 逐张逐标签 N×M 次 IPC（已有批量 API 未用）+ 成功 toast 先于完成
40. `App.vue:191、247` copyText/getClipboardText fire-and-forget 无 catch：失败仍报成功
41. `composables/useTrackpadGesture.ts:4-7` 头注释仍写 history.back/forward，实际已改 libraryTabs 历史

### 渲染层 · photos 视图
42. `AssetThumb.vue:275-280`（同 PhotoPreview 多处、PhotoInspector:571、HoverPreview:25）`encodeURI` 不转义 `#`/`?` → 特殊文件名媒体 404（主进程侧同 P2-32，双侧同修）
43. `FreeformCanvas.vue:154-170` 文件夹切换无序号守卫：乱序返回把 A 夹布局持久化到 B 夹 → fid 校验
44. `PhotoInspector.vue:209-224、597-598` commitName 无重入守卫：Enter+blur 双触发产生误导性失败 toast → settled 标志（LibraryPanelRow 是正面样板）
45. `PhotoInspector.vue:875-882` 批量评分「清除」只重置本地不下发 API → applyBatchRating(0)
46. `FolderInspector.vue:43-51、79-134` loadStats 无守卫统计串位；saveName/export 等无 catch
47. `TagManagerModal.vue:251-255` 删除标签无确认且无 catch → requestConfirm
48. `LibraryInfoPanel.vue:88-134` 描述输入、设置密码、导出三个死控件（无 v-model/无 handler）→ 接逻辑或移除
49. `FilterBar.vue:370-374` MOD_PRESETS「今日/近7日」在组件生命周期内冻结，跨午夜偏差一天 → nowTick 依赖
50. `ColorPickerPanel.vue:103-124` 拖色每次 pointermove 写 store + tabs.persist() 全量序列化 → move 只改本地态，pointerup 落盘
51. `PhotoMapView.vue:193-196、144-150` 每次 photos 引用变化都 fitToMarkers，用户视野被反复重置 → 仅首次/未交互时 fit
52. `PhotoPreview.vue:807-833` 预览内 ESC 无输入框判断：标签/描述输入框按 ESC 直接关预览丢内容 → target.closest('input,textarea') 守卫
53. `PhotoPreview.vue:1045-1072` PDF 快速翻页并发渲染同一 canvas，pdf.js 抛错显示「页面渲染失败」→ 渲染序号/串行化
54. `PhotoPreview.vue:1220-1264` 字体快速切换 FontFace 加载乱序：样张串字体 + document.fonts 泄漏 → photoId 守卫
55. `BookmarkModal.vue:45-50` 任意 http(s) URL 以 allow-scripts+allow-same-origin iframe 内嵌执行第三方 JS → 去 allow-same-origin / 快照式预览
56. `PhotoPreview.vue、PhotoInspector.vue、LockModal.vue` 多处 window.api 调用未捕获 rejection（setWallpaper/openExternal/setPinned/copyToClipboard 等）→ safeInvoke 统一兜底
57. `FreeformCanvas.vue:227-296` 未处理 pointercancel：触摸中断后「幽灵拖拽」→ 补 pointercancel + e.buttons 校验
58. `BatchRenameModal.vue:163-165` 载荷 `{id,name}` 与 preload 内联类型 `{id,pattern,start}` 不一致（三处签名互异，运行时碰巧兼容）

### 渲染层 · 其余视图与通用组件
59. `views/SettingsView.vue:398-399、441-451、515-521` migrate 干跑/OCR/截图设置多处 IPC 无 catch，失败静默
60. `views/tags/index.vue:391-427` 重命名/设色/设分组三个 updateTag 无 try/catch（同文件 handleDelete 有完整样板）
61. `components/plugins/PluginManagerModal.vue:52-84` 安装/切目录无错误处理无 pending 防重，双击重复安装
62. `capture/components/PinWindow.vue:58-67` toast 只写 ref 无渲染方，「已复制/已入库」永远不可见
63. `PinWindow.vue:33-37` 拖动贴图每 mousemove 一次 IPC（高刷屏 120+/s）→ rAF 合并
64. `components/shell/LayoutPopover.vue:24-39 + DimensionPoolPopover.vue:85-90` setTimeout 延迟注册监听的卸载竞态（泄漏 capture Esc 监听会吞下一次全局 Esc）→ 同步注册 + @mousedown.stop
65. `components/ui/UModal.vue:39-52` 无焦点陷阱、关闭不归还焦点
66. `components/ui/UDrawer.vue:29-34` 空 watch + 注释宣称的修复不存在 → 删除
67. `components/ui/UPromptModal.vue:26-36` onSubmit 抛错留 unhandled rejection 且弹窗卡住（与 P2-15 一并修）
68. `components/shell/QuickSwitcherModal.vue:88-96` 标签跳转改写 tagFilter 未 persist，重启丢失
69. `components/ui/UContextMenu.vue:147-155` 键盘 Enter 选中子菜单父项当作普通项触发 onPick 并关菜单 → pickable 排除 children

### 原生 / 扩展 / 插件 / 脚本 / 配置
70. `native/macos-share/share.mm:63` 死三元 `anchor.contentView ?: anchor.contentView`
71. `share.mm:36-47` N-API 返回状态全部未检查，非字符串元素靠实现巧合跳过；binding.gyp exceptions 配置自相矛盾
72. `native/macos-share/package.json:9-11` 声明并安装 node-gyp-build 但 index.js 不使用
73. `package.json:11、28、73` `postadd:native` 非 pnpm 钩子永不自动执行；`@types/node-fetch` 无对应依赖；`lint:css || true` 对崩溃免疫
74. `extension/chrome/popup.js:31-52` init() 无错误处理，受限页面弹窗永久停在「正在读取页面图片…」
75. `extension/chrome/background.js:42-46 + extension/background.js:101` MV3 SW 内 setTimeout 清徽标不可靠；消息形状零校验时 sendResponse 永挂起 → 入口校验 Array.isArray
76. `scripts/run-e2e.mjs` 等待全仓无人开启的 CDP 9222，必然超时失败 → 删除或改 _electron.launch
77. `e2e/launch-smoke.spec.mjs:79-82` 首屏断言含 `body` 兜底恒真，白屏也通过
78. `e2e/extension-real.spec.mjs:59-65、129-159` 用真实默认 userData 启动并向真实素材库写测试图、无清理 → 独立 userData
79. `playwright.config.mjs:16-18` trace:'on-first-retry' 但 retries=0，trace 永不生成
80. `scripts/lint-css-changed.mjs:62、79-88` git 路径拼 shell 可被特殊文件名破坏；`code === 'D'` 死分支 → execFileSync 免 shell
81. `scripts/bench-embedding.mjs:96-100` 未归一化向量点积阈值 0.2，命中数统计失真

*（编号 1-81 为 P3 流水号；上文本与源文件行号一致，均可按 `文件:行` 直接定位。）*

---

## 六、架构层面建议（跨文件主题）

1. **竞态守卫统一模式**：本报告 8+ 处发现同型根因——异步操作无 seq/AbortController（分页池、zip、字体、地图统计、查重、画布、搜索防抖）。建议在 `usePhotoData` 一层建立统一「请求序号」工具（每池一个 `makeSequencer()`），其余组件复用，一次性消灭该家族。
2. **IPC 边界中间件**：`registerHandlers`/`registerPrefixedHandlers` 统一包两层——入参 schema 校验（至少 zod-lite：类型 + 路径字段必须来自白名单/对话框）+ 错误包装（log 原始错误、renderer 只收 `{ok, code}`）。可同时消化 6 条发现（P1-2/3/4、P2-1/2、P3-18）。
3. **preload 契约防漂移**：`index.d.ts` 与 `index.ts` 两处手工维护已出现 2 条 P1（convertPhotos、getDuplicateGroups opts）+ 2 条 P3 类型失真。建议 CI 脚本对比 d.ts 键集与实现键集（20 行脚本可写）。
4. **分页化迁移的「半下推」是本次最大风险区**：P0-1、P1-7/9、P2-17/18/19 全部产生于「窗口取数已切换、spec/索引/load-more 未跟上」的中间态。建议：补齐三池（favorites/folder/search）的 spec 下推与集成测试后再删回滚开关；「占位符数 == 参数数」「游标键 == ORDER BY 键」写成 repo 层不变量测试。
5. **双扩展实现合并**：根目录 `extension/` 与 `extension/chrome/` 已实质漂移（权限模型不同、e2e 测的是不分发的那套）。确认 chrome/ 为唯一分发版后删除根版，e2e `EXT_PATH` 对齐。
6. **死代码清单**（删除即可减重）：`db/dbBackup.ts`、`PhotoRepository.importMany`、`renderer/utils/color-extractor.ts`、`scripts/run-e2e.mjs`、`UDrawer` 空 watch、根目录版 extension。
7. **打包白名单**：electron-builder `files` 改正向白名单 + `extension/chrome` 进 extraResources，一次解决 P1-13 与 P2-30。

## 七、覆盖矩阵（9 组 × 文件数 / 发现数）

| 组 | 范围 | 文件数 | 有发现文件 | 干净文件 |
|---|---|---|---|---|
| 1 | src/main/db | 29 | 5（PhotoRepository×7、smartAlbumRules×2、pageCursor、photoSimilarity、dbBackup） | 24（含 16 个迁移文件全部干净） |
| 2 | src/main/services | 21 | 11 | 10（Notification/McpHandler/BackupScheduler/GeoCoder/PdfRasterizer/锁服务×2 等） |
| 3 | src/main/ipc + stores | 23 | 7 | 16（plugins/backup/tags/platform 等 IPC 干净；pathPolicy 加固到位） |
| 4 | src/main/utils+modules+index + preload | 22 | 7 | 15（zipBrowse 无 Zip Slip、netSafety、dialogs、tray 等干净） |
| 5 | renderer 核心 | 26 | 4 | 22（composables/types/router 大多干净） |
| 6a | photos 组件 | 35 | 13 | 22（PhotoListView/TagsFilterPanel/DuplicateScanModal 等） |
| 6b | photos index + composables | 15 | 9 | 6（usePhotoKeyboard/useMarquee/useDialogs 等） |
| 7 | 其余视图 + 通用组件 + capture | 38 | 13 | 25（TitleBar/stats/ActionsModal/AppShell 等干净） |
| 8 | native/extension/plugins/scripts/e2e/配置 | 49 | 17 | 32 |

**已确认加固良好、未列为发现的重点面**：自定义协议的素材白名单（无 path traversal 可达 fs）、zipBrowse 流式限额与路径校验、`plugins:readAsset` 双重 realpath + 512KB 上限、迁移逐版本单事务且可重放、marked 渲染实际接入 sanitize-html、`shell.openExternal` 有协议白名单、窗口 `sandbox:true`/`webSecurity:true`、单例锁与 will-quit 清理链完整、TagRepository.mergeTags 防环。

## 附录：可信度说明

- P0×2、P1×13：主审逐条亲读源码复核，置信度高；其中游标注入与 tagNamesExact 由审查代理用项目内 better-sqlite3 内存库实际复现。
- P2×34、P3×80：代理报告原文保留（行号 + 置信度），主审抽核了 encodeURI/#、libraryRegistry 非原子写、renameFiles、CSP 注入等关键条目；**未逐条二次复核**，采纳前建议按行号快速过目。
- 两处标注「未实测 Windows」的发现（P2-32 Windows 面、P2-33）逻辑链完整但需在 Windows 上验证。

---

## 八、修复状态附录（2026-09-18 当日修复批次）

全部 129 条发现已按 Top10 → P0 → P1 → P2 → P3 顺序处理完毕。验证：`pnpm typecheck` 0 error、`pnpm vitest run` 303/303 通过、`pnpm lint` 0 error。

**修复完成**：P0×2、P1×13、P2×34 全部；P3 中除下列 4 项按工程判断调整外全部完成（含新增回归测试 `src/main/db/__tests__/cursorSecurity.test.ts`：游标注入载荷被忽略、键值/排序键数量不变量、extension 双键 roundtrip、tagNamesExact 参数配对 + 真实执行）。

**P3 中按工程判断调整的 4 项**：

1. **P3-4（部分保留）**：`getUnsortedPhotos` 反连接下推、批量打/删标签集合 SQL 已实施；`getPhotosByDateSection` 全量加载保留——它是「筛选激活时主视图」的既有数据路径，属分页化设计的回退面，待「带筛选分页」阶段一并处理；查重结果逐 id 取（N+1）保留——组员数量小（通常 2-5），收益低于改动风险。
2. **P3-14（不实施）**：合并 pHash/stats 的重复解码需重实现 libvips `stats().dominant` 语义，任何偏差都会改写已持久化的 colorDominant/palette（影响颜色筛选与检查器显示的存量数据）。两次全量解码发生在并发 2 的后台队列，成本可接受。
3. **P3-23（部分实施）**：`libraries:mergeFrom` 保持单事务原子语义（正确性优先，未做分块提交）；同步阻塞主进程的彻底解法需异步化 + 进度推送，涉及跨库事务状态机重构，另行立项。
4. **P3-49（已实施，补充说明）**：FilterBar「今日/近 7 日」时间边界改为 60s tick 驱动，跨午夜后最多延迟 1 分钟对齐。

**行为变更提示（需在发布说明中告知）**：

- 游标格式变更：新游标不再携带 `e` 字段；旧格式游标仍可续页（`e` 被忽略），键值数量与排序键不符的游标降级回首页。
- `storage:relinkPhoto` 改为主进程弹对话框（渲染层不再传路径）；`clearAll` 需带确认计数。
- `system:openWith/revealInApp` 的 appPath 仅接受会话内 pickApp/已知文件管理器白名单。
- 截图 saveDir、监控目录、文件夹扫描均需来自主进程对话框（目录白名单）。
- 文件夹锁/素材库锁：已设密码时修改必须先验旧密码；verify 连续失败有 30s 退避。
- 根目录 `extension/` 旧版已删除，统一分发 `extension/chrome/`（打包后位于 resources/extension）。
- 三条一次性迁移标志改为无条件先写，修复新用户第二次启动布局被改写的问题。

---

## 九、验证批次补充（同日 E2E 修复）

按「重编译原生模块 → 同步 lockfile → 补跑 E2E」执行时，新发现并修复了 3 个阻断 E2E 的真实问题：

1. **`clipServer:getConfig` / `regenerateToken` 返回密文 token（新发现，属 P0-8 的回归）**
   `src/main/ipc/clipServer.ts` 旧实现回读 `clip-server.json` 并原样返回——P0-8 之后落盘的是
   safeStorage 密文，导致**设置页展示的 token 一直是密文，用户手动配置浏览器扩展必然 401**；
   `regenerateToken` 还会以明文重写文件且不同步运行中的服务。
   修复：`getConfig` 改返回运行中服务的内存明文配置；`regenerateToken` 下沉为
   `ClipServer.regenerateToken()`（同步内存 token + 按 P0-8 语义加密落盘）。

2. **E2E launch-smoke 与真实应用抢单实例锁**
   spec 未传独立 userData，`requestSingleInstanceLock()` 失败使新实例秒退、
   `_electron.launch` 永久等待。已改为 mkdtemp 临时目录（与 extension-real 的隔离修复一致），
   afterAll 清理；首屏断言同步更新为当前真实标记（`#app .LeafAppShell` 挂载 + `#splash` 退场；
   旧断言的 `.leaf-onboarding`/`.LeafHome` 类名已不存在于 UI）。

3. **playwright 1.50.1 与 Node ≥24 不兼容（环境级）**
   test runner 在 Node v24.14 上启动即挂（含 `--list`；最小化配置复现，跨项目成立）。
   升级 `playwright` 1.50.1 → 1.63.0 并补装 chromium；测试代码无需改动。

**产品行为调整（经权衡，需要知悉）**：`ClipServer` 鉴权后的剪藏下载（fromUrl）现在允许
回环目标（127.0.0.1/::1），以支持本地/内网图片剪藏——这是 P0-4 SSRF 加固后回归的合法场景；
实现为 `assertPublicUrl(url, { allowLoopback: true })`，仅限 ClipServer 鉴权路径，
书签抓取与其余私网/链路本地段仍全段封锁。

**验证**：E2E 3/3 通过（launch-smoke ×2 + extension-real 全链路）、原生模块 ARC 版编译成功并
加载验证、typecheck 0 error、vitest 307/307、lint 0 error。
