# Leaf 素材库 · 二轮代码审查报告（2026-09-19）

- **范围**：全仓库；重点是 2026-09-18 那批 129 条修复（commit `87b5bc2` ~ `b614026`）**引入的回归**，以及上一轮未覆盖的面
- **方法**：4 组并行逐文件深读（db+ipc / services+modules+preload / renderer 核心+photos / 打包+脚本+扩展），发现须沿调用链交叉验证后才上报；**所有 P0/P1 由主审逐条复核，其中 8 条用真实 Electron 实例（playwright `_electron.launch` + 独立 userData）与 better-sqlite3 内存库实测复现**
- **基线**：接手时 typecheck 0 error、vitest 308/308 绿——本轮全部问题都是「绿灯下的失效」
- **统计**：新发现 24 条（P0×1、P1×10、P2×9、P3×4），已全部处置；另修正上一轮 1 条无效断言

---

## 一、P0（1 条）

### P0-1 `better-sqlite3` 留在 devDependencies + 被 externalize → 打包版启动即崩

`package.json` 的 dependencies 里没有 `better-sqlite3`，而 `electron.vite.config.ts:8` 把它列入 externalize，
`out/main/index.js` 保留裸 `require("better-sqlite3")`；electron-builder 只收集**生产依赖闭包**，
打包后该模块不存在 → 打开/创建任何素材库都 MODULE_NOT_FOUND。开发态永远发现不了。

修复：移入 `dependencies`（v13 走 N-API prebuilds，无需重编）。
**已在真产物验证**：`app.asar` 内出现 `node_modules/better-sqlite3/package.json`，并纳入 CI 结构断言。

---

## 二、P1（10 条，均为上一批修复的回归或半修）

| # | 问题 | 位置 | 修法 |
|---|---|---|---|
| 1 | 打开预览即 setup 抛 `ReferenceError: Cannot access 'inspectorCollapsed' before initialization`（P2-14 的 watch 加折叠态时，把 `immediate` watcher 放在了声明之前） | `PhotoInspector.vue:450` vs `:519` | 折叠态声明上移；同类潜在点 `PhotoGrid.vue:629` 已核为不可达（首轮 callback 时 sentinel 为 null） |
| 2 | 高级语法搜索恒 0 条：AST 分支把 `%词%` 交给 `INSTR()`（字面子串、不认通配）。P0-1 外提 gating 后该分支首次真实执行即暴露 | `smartAlbumRules.ts:315-317` | 绑定原值（scope 列已 LOWER，天然大小写不敏感）；补 3 条 AST 测试 |
| 3 | 渲染端 PDF/AI 预览整体失效，三处叠加：① CSP `connect-src` 不含 `rawfile:`/`pdfres:`；② `rawfile` 未进 `registerSchemesAsPrivileged`（Chromium 判 "URL scheme not supported"）；③ 全仓未设 `GlobalWorkerOptions.workerSrc`，pdfjs v6 在 `try` 外解构它 → `getDocument` 同步抛错 | `index.html:14`、`protocols.ts:51-57`、`PhotoPreview.vue:openPdf` | CSP 放行两协议 + rawfile 注册 `supportFetchAPI`；worker 源码 `?raw` 内联成 blob module worker 走 `workerPort`；另补 `'wasm-unsafe-eval'`（qcms wasm 同步编译需要，仍不开 `unsafe-eval`） |
| 4 | 收藏/文件夹视图的维度筛选完全失效：`getPage` 不带 `filters`，而展示层已删本地 `matchAll` 兜底 | `usePhotoData.ts:361/400`、`usePhotoFilters.ts:673/704` | 四个分页池共用注入的 spec（`setPagedFilters`），spec 变化重载「当前展示的那个池」 |
| 5 | 搜索态下改任何筛选维度都不重发（带 spec 的 `loadSearchPage` 只有防抖回调一个调用点） | `usePhotoFilters.ts` spec watch | watch 内补搜索分支；关键词装配统一为 `buildSearchSpec`，消掉与 `usePhotoSearch` 的重复实现 |
| 6 | 搜索池在飞重放用的是第一次的 query/spec（P1-7 半修：`spec` 在循环外求值） | `usePhotoData.ts:465-471` | `lastSearchQuery`/`lastSearchSpec` 移入循环内读取 |
| 7 | 离开 photos 页再回来，侧栏切换不再刷新内容池（`bindViewWatcher` 把 watch 的原始 stop 存进守卫标志并原样返回，调用后标志永不清零）→ 网格持续显示上一文件夹的数据 | `usePhotoData.ts:760` | 返回置 null 的包装（对齐同文件 `bindProcessingProgress`） |
| 8 | 「更改文件夹密码」100% 抛错：主进程要求先验旧密码，UI 只弹一个框且不传第三参 | `FolderLockService.ts:22-25` vs `LibraryPanel.vue:751` | 两步收密码，先 `verifyFolderPassword` 再带旧密码提交 |
| 9 | 检查器「来源链接」保存后静默丢失但仍 toast 成功（批量 `updatePhotos` 只持久化 4 个字段，P3-5 收窄时漏改这个活调用点；d.ts 仍写 `Partial<Photo>` 所以 typecheck 不报） | `PhotoInspector.vue:268`、`PhotoRepository.ts:1202` | 改走支持 `source_url` 的单张通道；d.ts 的 `update`/`updatePhotos` 收窄到与主进程一致，防再漂移 |
| 10 | 删标签后素材标签显示**裸 UUID**、usage_count 不回退、这批绑定再也清不掉（`softDelete` 只打标记，读路径 `COALESCE(tt.name, pt.tag_id)` 回退到 id；实测 `removeTagFromPhotos` 返回 0） | `TagRepository.ts:189`、`PhotoRepository.ts:283/301/1330` | 软删事务内清绑定 + usage 归零；三处读 SQL 去掉 UUID 回退；`untaggedOnly` 只算活动标签（存量孤儿行自动归位）+ 2 条测试 |

另修 **P1 级数据丢失**：自由网格一次 `pointercancel`（触摸中断/系统手势接管）把 `positions` 整体替换成「仅被拖那几张」，
随后任何一次 persist 走 `DELETE FROM photo_freeform_pos WHERE folder_id=?` + 逐条 INSERT → **整夹布局被清空**
（`FreeformCanvas.vue:310`，改为逐项回写）。

---

## 三、P2（9 条）

1. `.app`/`.framework` 等应用包被静默丢弃：目录扫描按「单个素材项」收集 bundle 目录，而新加的 `isRegularFile`（lstat）又把它判为非普通文件——两条规则直接冲突。修法：bundle 判定收进 `pathPolicy.isBundlePath`，扫描器与导入守卫同源。
2. `PAGE_SORT_KEYS` 的 `modified`/`created` 引用**不存在的列** `modified_at`（表上只有 `updated_at`/`fs_modified_at`，且 `Photo.createdAt` 映射自 `imported_at`、并无 `created_at` 列）。修法：改列 + 新增「10 个排序键 × 双向都能出页续页」测试（该测试当场抓出第一版修复又写错了 `created_at`）。
3. keyset 分页 `ORDER BY (pinned_at IS NOT NULL) DESC` 使每页退化为全表排序。实测 5 万行：现状 20 页 **268ms**（`SCAN + USE TEMP B-TREE`），去掉置顶 19ms，加表达式偏索引 **8ms**；建索引 8ms、3000 次插入 71→79ms → 新增迁移 `017_pin_sort_index`（只覆盖 imported_at 这组，其余排序键待真正下推时再按同形状补）。
4. `video://` 不支持 Range：实测 `net.fetch(file://)` 收到 Range 会**按区间切片却仍回 200、不给 Content-Range**，转发头不足以修好。改为自持 206 + `createReadStream` 区间流（不入内存），MIME 用 `bytes=0-0` 探一次按扩展名缓存。真产物验证：`206 / bytes 0-25501/25502 / video/mp4`，seek 到 4.2s 成功。
5. `second-instance` 重建的主窗口未挂 `closed → null`（与 `:232/:254` 不一致），关窗后 `mainWindow?.webContents.send` 对已销毁实例抛 `Object has been destroyed`，素材处理管线静默失败。
6. 相册/文件夹成员变更只刷列表不刷当前池 →「已移出相册」提示了、卡片还在原地（4 处补 `refreshAlbumPhotos`/`refreshFolderPhotos`）。
7. 就地重命名只接了网格：列表布局无该 prop、自由网格画布不渲染名称行 → F2/右键静默无反应（P1-11 的残留面）。修法：PhotoListView 补行内编辑（与网格同 `rename-commit/rename-cancel` 契约）+ 4 条组件测试；自由网格退回应用内提示框；两处 watcher 补 `immediate`（测试抓出：带 `renamingId` 挂载时不进入编辑态，布局来回切换即触发）。
8. OCR 全文检索在默认配置下**搜不到**：搜索范围默认勾满 → 永远走多列 LIKE，而 LIKE 分支不含 `ocr_text`（FTS 分支含），m014 的 FTS5 因此是死代码。按产品决策新增第 8 个范围项「OCR 文本」（`ocr`），主进程 `scopeColExpr.ocr` 与渲染层 `scopeHaystack` 同步；存量「旧 7 项默认」自动升级到新默认，否则老用户的新项被静默留在未勾选态。
9. FilterBar 的 AI 开关绕过 `usePhotoSearch.toggleAiSearch`（不清关键词/不清 aiMatches/AI 不可用时不告警）→ 开着关键词切 AI 模式变空视图；同时发现 TitleBar 的同一开关**漏 persist**（重启丢失）。修法：两处统一走 `toggleAiSearch`，持久化收敛到该函数内。

---

## 四、P3 与测试有效性（4 条）

1. `photoSimilarity.getDuplicatePhotoGroups` 的断言拿 `groups[0][2]` 自己当预期值，只在特定返回顺序下成立——连跑 3 次挂 2 次的**随机通过测试**。改为逐一点名成员。
2. `libraryRegistry` 把「合法 JSON 但空列表」与「真损坏」混为一条路径（现均为重建默认库，但空列表不该被改名备份）；`.corrupt-*` 备份永不清理（现只留最近 3 份）；`listLibraries()` 返回缓存数组活引用（现返回副本）。
3. 凭据导入黑名单可绕过：`~/.config/gh/hosts.yml`（GitHub PAT）既不命中目录段也不命中扩展名，而 `readTextFile` 放行 `.yml` → 「入库再读回」对它是通的。补 `.config/gh`、`.config/gcloud` 的目录对判定。
4. `electron-builder.yml` 的公证注释与实际行为不符。已核 `app-builder-lib/out/macPackager.js`：**完全没有 Apple 环境变量时是 warn 后跳过并正常出包**，只有「凭据只配一半」才抛 `InvalidConfigurationError`——注释按此改写（本地无需额外开关）。

---

## 五、打包与 CI

- `files` 排除经**真产物**核对：`app.asar` 126M；`.pnpm-store`/`docs`/`*.map`/`*.tsbuildinfo`/transformers 包内模型缓存（实测包外 146MB 的 `.cache`）全部为 0；`better-sqlite3`、`pdfjs-dist/cmaps`、`pdf.worker.mjs` 必须在内的都在。
- 修正一处**上一轮报告与本审自己的错误结论**：`!node_modules/onnxruntime-web/**` 确实生效——删掉它 `app.asar` 从 126M 涨到 **234M**（+108MB 即 ort-wasm 载荷）。包内只剩它嵌套的 `onnxruntime-common` 副本（`onnxruntime-node` 依赖树需要）。教训：整包体积结论必须以产物为准，不能以 `du node_modules` 为准。
- CI 的 build job 新增 **「打包结构断言」**步骤（`electron-builder --dir` + `@electron/asar list`，3 项必须在 / 5 项必须在外的精确 grep 集合）。断言正文已在本地真产物跑通（6409 条）。此前 CI 只跑 `electron-vite build`，P1-13/P2-30/本轮 P0-1 这类问题对它完全隐形。

---

## 六、验证口径

- `pnpm typecheck`（node + web）0 error；`pnpm test` **319/319**；`pnpm lint` 0 error（417 条为仓库既有 prettier 风格警告）。
- 渲染层与协议层改动不依赖绿灯，全部在**真实 Electron 实例**验收：启动 → 导入素材 → 双击开预览 → 断言 canvas 有实际笔画、`page.on('console'|'pageerror')` 无错误；`video://` 断到 `206 + Content-Range`；分页筛选/AST 搜索/标签软删断到 `window.api.*` 的真实返回。

## 七、行为变更提示（发布说明需要告知）

- 搜索范围面板新增「OCR 文本」项；老用户若从未改动过勾选，会自动升级为新默认（含 OCR）。
- 删除标签现在会**同时移除素材上的该标签绑定**（此前留下指向已删标签的残行）。
- 分页游标续页依赖排序键集合，`modified`/`created` 两个排序键此前会直接报错，现已可用（UI 尚未接入）。
- 新增迁移 `017_pin_sort_index`（启动时建一条表达式偏索引，5 万行实测 8ms）。
- 打包体积：`app.asar` 126M（模型权重与浏览器版 ORT 不再夹带）。

---

## 八、真机全功能面验收（同日，修完上述条目后跑）

36 项检查一次跑完，33 项直接通过；3 项「失败」逐一定位后均为**验收脚本自身的问题**，不是应用缺陷：

- `#/stats` 断言用「正文 > 50 字」，而当时库为空 → 单独复验正常（素材总数/类型分布/大小分布齐全）。
- `fontInfo` 返回 null → 接口签名收 `filePath`，脚本传了 id；换 filePath 后返回 Arial/Regular。
- 「回收站不刷新」→ 是同视图重复点击（view 未变，watch 本就不该触发）；改用存在的侧栏行重测后，
  「未分类 ↔ 回收站」切换刷新正常，且**跳到设置页再回来后仍然正常**（`bindViewWatcher` 那处修复的直接验证）。
- `thumbStatus: 0` 是查得太早；等 9s 后 image/video 全部为 1，pHash 也已产出（查重组命中）。

**验收暴露并修正的一处一致性问题**：`thumb:` / `image:` 注册了 `supportFetchAPI + corsEnabled`
（注释写明确是为 fetch/像素读取），但主窗口文档 CSP 的 `connect-src` 并不放行——两边口径不一致，
任何主窗口代码 fetch 这些协议都会得到毫无信息量的 `Failed to fetch`。这正是 P1-3（PDF 预览）
栽过的同一个坑，因此统一口径：

- `index.html` 的 `connect-src` 补齐 `thumb: image: video:`（`rawfile:`/`pdfres:` 已在 P1-3 修好）；
  这些 scheme 只能取已入库素材或包内只读资源，不构成对外出口，安全边界不变。
- `video://` 补 `registerSchemesAsPrivileged`（它此前只靠 `<video src>` 加载，根本没注册；
  只在 CSP 里加而 scheme 不注册是半个修复）。
- 更正 F20 注释：插件沙箱读像素实际用 `new Image() + crossOrigin='anonymous'`
  （`plugins/histogram/index.html:44`），而沙箱自身 CSP 是 `connect-src 'none'`——
  插件里 fetch 不通也不该通，`corsEnabled + ACAO` 服务的是 crossOrigin 图像的像素读取。

修正后回归实测：`thumb 200/574B`、`image 200/9566B`、`video 200/15050B`、
`video:// + Range → 206/100B @ bytes 100-199/15050`、`rawfile 200`、`pdfres 200/43366B`；
同时 `rawfile:///etc/hosts → 404`、`pdfres://cmaps/../../../etc/hosts → 400` 两条越权仍被拒
（控制台上仅剩这两条刻意失败的日志），PDF 预览重新渲染正常。

**刻意未改**：删除确认框对 Enter 无默认动作（破坏性操作要求显式点击，符合 macOS 惯例；
实测按下后既不删也不关，不存在误触）。

**真机未覆盖，需人工**：拖拽导入/拖入相册与文件夹、右键菜单逐项、录屏/截图/贴图、
剪贴板监听导入、插件面板交互、浏览器剪藏扩展全链路（E2E 有 spec 但未在本轮跑）、跨库迁移、
真实 tesseract OCR（耗时；OCR 的搜索范围下推已由单测覆盖）。

---

## 九、能力级验收（预览面板逐条真跑）

前面 36 项是 IPC/DOM 层面的，这轮把预览面板的每种素材类型逐个双击打开、断言实际效果：

| 能力 | 结果 |
|---|---|
| 图片 / 字体（FontFace 真加载）/ ZIP 条目 / 纯文本 / HTML / Markdown / PDF 三页翻页 / 视频 Range | 逐条通过（PDF 页码 1/3→2/3→3/3、末页按钮禁用、回退 2/3；三页画布内容互不相同） |
| Markdown XSS 剥离 | 通过：`.leaf-md` 内 onerror/script/iframe/svg-onload 全部被清洗，javascript: 链接未成为 href（此前一次「onerror 仍在」是脚本扫了整页 body，误判） |
| 语义/AI/OCR 通道 | aiAvailable=false 如实上报（本机 onnxruntime 缺架构支持），embeddingStatus/ocrStatus 正常返回 |

**修掉的四个真问题：**

1. 「设为壁纸」对 Markdown/文本/HTML/ZIP 等所有类型都显示。预览工具栏整排动作**无任何 kind 判定**，而右键菜单早有 `photo.kind !== 'image'` 禁用——两处口径不一致。现把「设为壁纸」「找相似」「AI 命名」都收敛到图片类（后两者依赖 pHash / CLIP 向量，非图片必然空转）。
2. `wallpaper:set` 只判 `existsSync`，等于把「任意路径改写桌面 + 存在性探测」开放给渲染层：真机 `setWallpaper('/etc/hosts')` 返回 `ok:true`。现要求路径必须是已入库素材（与 image://rawfile:// 同口径），实测非素材路径返回 `ok:false, 只能将素材库内的图片设为壁纸`。
3. HTML 预览的相对资源全挂：注入的 `<base href="rawfile://素材目录/">` 被文档 CSP 的 `base-uri 'self'` 拒绝（srcdoc 继承父文档策略），相对路径回落到应用自身目录并报 `Not allowed to load local resource`。现 `base-uri 'self' rawfile:`，截图确认 iframe 内图片渲染出来。
4. Markdown 里的相对图片同样解析到 `out/renderer/` 而 404（真机 `REQFAIL file:///…/out/renderer/ok.png`）。改为清洗后按素材目录改写 img src 为 `rawfile://…`——放在 sanitize 之后，避免为 rawfile: 放宽 img 的 scheme allowlist；改写后仍由协议侧「必须是已入库素材」把关。

未改的一处判断：`sandbox=""` 的 srcdoc 帧父页读不到 contentDocument（连 data: URI 都读不到），因此该项以截图而非 DOM 断言验收。
