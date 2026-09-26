# Leaf 素材库 · 前瞻 Backlog

> 建于 2026-09-25（治理评审之后），**09-26 按「对照 HEAD 逐条核验 + Eagle 4.0.0 实包清点」重排**。
> 本文件接管「接下来做什么」：每项带优先级与状态，完成即勾掉并可择要移入 CHANGELOG；
> 轮次式过程记录留在《素材库待办清单.md》，决策依据进 `docs/DECISIONS.md`（D-0xx）。
> 三个大件各带实施计划：`docs/plans/`（标注消费端 / 智能夹形状 / AI 看图工作流）。
> Eagle 侧清点的一手材料：/tmp/eagle-asar-review（解包方法见记忆库与 docs/research/eagle/）。

## P1 · 大件（各带实施计划，开工前先立决策条目）

- [x] **标注消费端全链** — ✅ 2026-09-26 四期落地（`b7e94e8`/`ebe9cd5`/`f8efd59`）：预览框选圈注、
  音视频时间点笔记、卡片徽标（「标注数」开关）、有/无标注筛选维下推 SQL。留白进计划文档：
  检查器↔overlay 选中联动、标注文本进 FTS（评估缓做，独立 `photo_annotations_fts` 方案留档）、
  全链 e2e 验收。计划：`docs/plans/标注消费端-实施计划.md`。
- [ ] **AI 看图工作流** — 计划：`docs/plans/AI看图工作流-实施计划.md`。定性（09-26 Eagle 实包核验）：
  **Eagle 也没有内置看图**——官方路径是 MCP 插件把库交给外部 AI 客户端。Leaf 的 MCP 缺
  `get_image`（图片内容暴露），补上即成完整「看图打标」工作流；内置视觉 BYOK 为可选第三期。
  语义搜索轴 Leaf 已追平（内置 Chinese-CLIP vs Eagle 插件+Python），不再列差距。
- [ ] **智能夹形状升级** — 计划：`docs/plans/智能夹形状-实施计划.md`。D-022 已立项；M1+M2 ✅ 2026-09-26
  （`1305666`：嵌套条件组 + 组级取反，深度≤8/节点≤300 双闸，v1 逐字节兼容，编辑器组容器 UI）；
  M3 ✅ 2026-09-26（D-023 裁决正则走 UDF 下推 + 补齐 12 缺口算子含编辑器，D-024 立案 MCP get_image
  安全边界）；剩可选 M4（嵌套夹，D-022 明确缓做）。
- [ ] **真机人工验收清单收尾**：09-19 审查报告自列的未覆盖项——拖拽导入、右键逐项、录屏/截图/贴图、
  插件面板、扩展全链路、跨库迁移、真实 OCR；以及「批量 AI 200 上限耗时与费用」「OCR 离线语言包下载」。
- [ ] **真库 5,001 条断链最终处置**：先查废纸篓 / Time Machine 能否找回，再点批量软删
  （入口已就绪；见复盘行动项 #6）。
- [ ] **打包态全链路验证**：asar 结构断言（09-25）+ 打包产物直启冒烟（09-26：真启 .app 壳层渲染零 pageerror，探针 `scripts/_probes/_packaged-smoke.mjs`）已过；**真机安装（dmg 装干净环境 + 完整功能走查）仍未做**——发给第一个用户前必须真装一次。

## P2 · 排期但别丢

- [ ] **视频播放深度二档**：AB 循环、≤30s 自动循环、mpv 式时间轴笔记标记（±10 帧步进 09-26 已补；
  普通 ←/→ 是否改成 Eagle 的 ±1 帧语义需单独拍板——现状是翻素材，改了会动 QuickLook 习惯）。
- [ ] **图片裁切**（要框选交互）、**自定义缩略图**（协议层 + 派生数据两个硬结，等 protocols 落地）、
  **修复缩略图/缩略图背景**（Eagle fixUtils 一族）。
- [ ] **字体安装态**：激活/未激活的标记与筛选（Eagle 字型安装状态维；Leaf 只有图标素材无逻辑）。
- [ ] **拼音搜索与繁简互转**（Eagle 用 pinyinlite；注意 pinyin-pro 已在依赖里，先查现有用点再设计）。
- [ ] **语义阈值大库复验**（D-021 自记边界）：0.40 是 6 张文生图小池的标定，大库/高 graphic
  占比库未复验；复验后把结论回填 D-021。
- [ ] **RAW / Office / CAD QuickLook 通路样本验证**：已接但无样本未验；补真样本走一遍。
- [ ] **jxl / hdr / dds 解码决策**：jxl 已不在代码白名单（assetTypes 零命中），要么接解码通路，
  要么明确不追并记入「明确不做」清单；hdr/dds 同批拍板。
- [ ] **Electron 38 → 44 升级**：跨 6 个大版本，升完格式探针全量重跑。
- [ ] **OcrService / PdfRasterizer 等剩余零单测服务的测试补齐**：破坏性路径的 PhotoRepository
  删除分支与 BackupScheduler 已于 09-25 补上（并钓出幽灵向量 bug），这两个因依赖外部二进制仍未测。
- [ ] **CI lint 存量清零**：ESLint/Stylelint 的 `|| true` 与存量 warning（09-25 实测 eslint 260 +
  stylelint 11 ≈ 271 条）渐进清掉后转必过；`lint:css:changed` 在 CI 干净工作树上恒空转的问题一并处理。

## P3 · 有空再看

- [ ] 大库性能：真 JS 虚拟滚动、排序下推（文档口径「库变大再做」，先立此存照）。
- [ ] `preload/index.d.ts` 死类型清理（893 行契约文件里有已删通道的残留）；`libraryTabs.ts` 的
  `aiSearchMode` 死字段已于 09-26 清掉。
- [ ] 检查器区块排序（Eagle Inspector 可拖拽排序）。
- [ ] 书签可交互预览（iframe + 前进/后退 + mhtml 离线档；现仅截图+标题+链接）。
- [ ] 截图骨架 6 组件 + `core/snapshot.ts` 接线完成后，删 tsconfig.web.json 里的排除段（文件内有自注）。
- [ ] 遥测 remote 档的取舍决策（当前 local/off 两档，remote「1.0 暂未启用」）。
- [ ] 完整性门报出的 5 个「零引用」文件逐一判生死（dbBackup / TagManagerModal / useAutoLayout /
  videoFrame / capture 骨架）：要么接上，要么进排期说明，要么删。
- [ ] 3D 预览（three.js 全家桶，Eagle 有 Draco/OCCT/Rhino3dm/IFC 加载器；明确暂缓）。

## 对标决策项（Eagle 独有——要不要追需逐项拍板，不默认补课）

09-26 对 Eagle 4.0.0 实包清点出的独有能力，Leaf 侧均无。建议裁决顺序：EaglePack 与网站批量收藏器
是收集面真需求，Actions 宏服务整理重度用户，其余边缘。

- [ ] **EaglePack**（.eaglepack 打包导入/导出，含重复项策略）——迁移/交换场景的真实格式。
- [ ] **网站批量收藏器**（内置 Pinterest/花瓣网/ArtStation 抓取，按域名/格式/尺寸筛选）。
- [ ] **Actions 宏**（快捷键触发的一连串整理动作：加夹/移动/加标签/评分，可克隆）。
- [ ] 内置 mini 浏览器 webview（前进/后退/另存图/复制图链）。
- [ ] 色彩管理（色彩空间切换）、通知音效 4 事件、Touch ID 解锁、悬停放大、131 组可改快捷键、
  欢迎引导 onboarding、IPTC 关键字转标签、代理设置。

## 已完成（近期批次）

### 2026-09-26 批量重命名 token 扩容（P2 清偿）
- [x] **批量重命名 token 扩容**：6 → 19 种，token 词表与求值统一进 `@shared/filename.ts`
  （`RenameContext` + `evaluateRenameTokens`，渲染端预览 / 主进程 renameFiles pattern 路径 /
  AI 产出闸口三端同一份实现）。对标 Eagle 4.0.0 实包（batch-rename-modal.js，22 种 % 形态）：
  可行子集全部落地（`{add date}`/`{today}`/`{create date}`/`{modified date}`/`{taken date}`/
  `{size}`/`{rating}`/`{duration}`/`{width}`/`{height}`/`{id}`/`{tags}`/`{library}`），
  日期格式跟 Eagle（%D 家族连字符、%B/%M 家族下划线）；HM/HMS 时分秒变体与 %NNNNN+ 更长补零
  留待需要时加。作用域天然全类型（token 求值不挑 kind）。

### 2026-09-26 小件批次（11 条真差距的一次性清偿）
- [x] 反向图搜：卡片右键五引擎子菜单（Lens/Bing/Yandex/SauceNAO/TinEye），位图进剪贴板 + 打开引擎页；
  取代原单引擎「以图找图（谷歌）」
- [x] 卡片右键「复制素材链接」（`leaf://item/<id>`，补齐 folder 侧之后的最后一处）
- [x] FilterBar `aiSemantic` 死分支接入维度注册表（chip 与 TitleBar 语义开关同源联动，顺带清掉
  `aiSearchMode` 死字段）
- [x] 智能夹编辑器补三处残留控件（排除文件夹 / 评分包含 / 评分排除，ratings 两键不再念英文键名）
- [x] 视频 Shift+←/→ ±10 帧步进（复用实测 fps 链路；顺带修 ±1 也中招的 NaN clamp bug）
- [x] 二十九轮差距分析勘误块 + 本文件按核验结果全面重排

### 2026-09-25 治理闭环
- [x] 仓库清创：恢复产物出库、`_archive/` 与 `scripts/_probes/` 归档、.gitignore 补全
- [x] CI 触发分支修复（master/main 双认）+ e2e-smoke 转必过
- [x] D-021 决策补记 + DB_SCHEMA/CHANGELOG/README 口径对齐
- [x] LICENSE（MIT）补齐；coverage 基线（只出报告不设阈值）
- [x] 破坏性数据路径单测（PhotoRepository 删除分支、BackupScheduler 可测部分；钓出幽灵向量 bug 并修）
- [x] 事故复盘成文 + AGENTS.md 多会话写盘纪律
- [x] NotificationCenter 挂载——09-22 事故恢复轮（f0253fd）已接回 TitleBar，非待办（09-25 核验更正）
- [x] 接远端备份 —— **待用户执行**（唯一未闭环，见复盘行动项 #1）
