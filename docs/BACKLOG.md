# Leaf 素材库 · 前瞻 Backlog

> 建于 2026-09-25（治理评审之后）。本文件接管「接下来做什么」：每项带优先级与状态，
> 完成即勾掉并可择要移入 CHANGELOG；轮次式的过程记录留在《素材库待办清单.md》，
> 决策依据进 `docs/DECISIONS.md`（D-0xx）。新任务一律追加到这里，不再散落。

## P1 · 下一个迭代就该做的

- [ ] **AI 看图能力（自动打标 / 命名 / 描述）**：G1，唯一「有没有」级的 Eagle 差距。DeepSeek 无视觉输入，
  无文字信号的图片没有 AI 入口。文档指路：学 Eagle 的 sidecar/独立进程 + 自选模型，不走 transformers.js。
- [ ] **标注消费端接线**：`photo_annotations`（迁移 023）后端已全通，但预览框选 overlay、卡片数量徽标、
  筛选维度都没接——只能写不能看的功能等于没有。注意含**创建交互**：`rect`（10×10 最小框选）与
  `atMs`（时间点笔记）两列「写得进、读得出」，目前没有任何 UI 能产生。
- [ ] **真机人工验收清单收尾**：09-19 审查报告自列的未覆盖项——拖拽导入、右键逐项、录屏/截图/贴图、
  插件面板、扩展全链路、跨库迁移、真实 OCR；以及「批量 AI 200 上限耗时与费用」「OCR 离线语言包下载」。
- [ ] **真库 5,001 条断链最终处置**：先查废纸篓 / Time Machine 能否找回，再点批量软删
  （入口已就绪；见复盘行动项 #6）。
- [ ] **打包态全链路验证**：asar 下 pdfjs worker / @napi-rs/canvas / native 模块只在 CI 断言过结构，
  真机安装包从未跑过——发给第一个用户前必须真装一次。

## P2 · 排期但别丢

- [ ] **智能夹的形状差距**：编辑器已铺满 43 个谓词键（09-25 核验），剩的是形状——单组 AND/OR
  （Eagle 两层组合 30 组×30 规则）、无正则/开头结尾等算子、智能夹不嵌套（Eagle 树形且子级自动 AND 父级）；
  另有两处残留控件缺口：`folderExcludeIds`（排除文件夹）与 `ratingsInclude`/`ratingsExclude`
  （精确评分多选）引擎支持、编辑器无控件，且 ratings 键无中文名（passthrough 时界面念英文键名）。
- [ ] **FilterBar 的 `aiSemantic` 死分支**：chip 模板与 isDimActive/clearDim 逻辑都在，只差进
  `FILTER_DIMENSIONS` 注册表一行——不进池，语义维永远缺席筛选行，语义搜索与维度筛选的
  「相与」组合在 UI 上少一个入口。
- [ ] **语义阈值大库复验**（D-021 自记边界）：0.40 是 6 张文生图小池的标定，大库/高 graphic
  占比库未复验；复验后把结论回填 D-021。
- [ ] **RAW / Office / CAD QuickLook 通路样本验证**：已接但无样本未验；补真样本走一遍。
- [ ] **jxl 决策**：现在连代码白名单都不在（assetTypes 零命中），要做的不是摘除而是拍板——
  要么接解码通路，要么明确不追并记入「明确不做」清单。
- [ ] **Electron 38 → 44 升级**：跨 6 个大版本，升完格式探针全量重跑。
- [ ] **图片裁切**（要框选交互）、**自定义缩略图**（协议层 + 派生数据两个硬结，等 protocols 落地）。
- [ ] **拼音搜索与繁简互转**（Eagle 用 pinyinlite）。
- [ ] **OcrService / PdfRasterizer 等剩余零单测服务的测试补齐**：破坏性路径的 PhotoRepository
  删除分支与 BackupScheduler 已于 09-25 补上（并钓出幽灵向量 bug），这两个因依赖外部二进制仍未测。
- [ ] **CI lint 存量清零**：ESLint/Stylelint 的 `|| true` 与存量 warning（09-25 实测 eslint 260 +
  stylelint 11 ≈ 271 条）渐进清掉后转必过；`lint:css:changed` 在 CI 干净工作树上恒空转的问题一并处理。

## P3 · 有空再看

- [ ] 大库性能：真 JS 虚拟滚动、排序下推（文档口径「库变大再做」，先立此存照）。
- [ ] `preload/index.d.ts` 死类型清理（893 行契约文件里有已删通道的残留）。
- [ ] 截图骨架 6 组件 + `core/snapshot.ts` 接线完成后，删 tsconfig.web.json 里的排除段（文件内有自注）。
- [ ] 遥测 remote 档的取舍决策（当前 local/off 两档，remote「1.0 暂未启用」）。
- [ ] 完整性门报出的 5 个「零引用」文件逐一判生死（dbBackup / TagManagerModal / useAutoLayout /
  videoFrame / capture 骨架）：要么接上，要么进排期说明，要么删。
- [ ] 3D 预览（要新渲染依赖，暂缓）。

## 已完成（近期治理闭环，2026-09-25）

- [x] 仓库清创：恢复产物出库、`_archive/` 与 `scripts/_probes/` 归档、.gitignore 补全
- [x] CI 触发分支修复（master/main 双认）+ e2e-smoke 转必过
- [x] D-021 决策补记 + DB_SCHEMA/CHANGELOG/README 口径对齐
- [x] LICENSE（MIT）补齐；coverage 基线（只出报告不设阈值）
- [x] 破坏性数据路径单测（PhotoRepository 删除分支、BackupScheduler 可测部分）
- [x] 事故复盘成文 + AGENTS.md 多会话写盘纪律
- [x] NotificationCenter 挂载——09-22 事故恢复轮（f0253fd）已接回 TitleBar，非待办（09-25 核验更正）
- [x] 接远端备份 —— **待用户执行**（唯一未闭环，见复盘行动项 #1）
