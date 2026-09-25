# Leaf 素材库 · 前瞻 Backlog

> 建于 2026-09-25（治理评审之后）。本文件接管「接下来做什么」：每项带优先级与状态，
> 完成即勾掉并可择要移入 CHANGELOG；轮次式的过程记录留在《素材库待办清单.md》，
> 决策依据进 `docs/DECISIONS.md`（D-0xx）。新任务一律追加到这里，不再散落。

## P1 · 下一个迭代就该做的

- [ ] **AI 看图能力（自动打标 / 命名 / 描述）**：G1，唯一「有没有」级的 Eagle 差距。DeepSeek 无视觉输入，
  无文字信号的图片没有 AI 入口。文档指路：学 Eagle 的 sidecar/独立进程 + 自选模型，不走 transformers.js。
- [ ] **标注消费端接线**：`photo_annotations`（迁移 023）后端已全通，但预览框选 overlay、卡片数量徽标、
  筛选维度都没接——只能写不能看的功能等于没有。
- [ ] **真机人工验收清单收尾**：09-19 审查报告自列的未覆盖项——拖拽导入、右键逐项、录屏/截图/贴图、
  插件面板、扩展全链路、跨库迁移、真实 OCR；以及「批量 AI 200 上限耗时与费用」「OCR 离线语言包下载」。
- [ ] **真库 5,001 条断链最终处置**：先查废纸篓 / Time Machine 能否找回，再点批量软删
  （入口已就绪；见复盘行动项 #6）。
- [ ] **打包态全链路验证**：asar 下 pdfjs worker / @napi-rs/canvas / native 模块只在 CI 断言过结构，
  真机安装包从未跑过——发给第一个用户前必须真装一次。

## P2 · 排期但别丢

- [ ] **智能夹编辑器补谓词**：SQL 引擎 40+ 谓词，编辑器只暴露约 16 项；Eagle 是两层组合（30 组×30 规则）
  + 正则等 27 算子，Leaf 是单组 AND/OR（G2）。
- [ ] **RAW / Office / CAD QuickLook 通路样本验证**：已接但无样本未验；补真样本走一遍。
- [ ] **jxl 假绿灯处理**：无解码通路却可入选型白名单——要么接解码，要么从白名单摘掉。
- [ ] **Electron 38 → 44 升级**：跨 6 个大版本，升完格式探针全量重跑。
- [ ] **NotificationCenter 挂载**：组件完整但从未挂载，通知开关形同虚设；批量任务完成感知弱。
- [ ] **图片裁切**（要框选交互）、**自定义缩略图**（协议层 + 派生数据两个硬结，等 protocols 落地）。
- [ ] **拼音搜索与繁简互转**（Eagle 用 pinyinlite）。
- [ ] **CI lint 存量清零**：ESLint/Stylelint 的 `|| true` 与 946 条存量 warning 渐进清掉后转必过；
  `lint:css:changed` 在 CI 干净工作树上恒空转的问题一并处理。

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
- [x] 接远端备份 —— **待用户执行**（唯一未闭环，见复盘行动项 #1）
