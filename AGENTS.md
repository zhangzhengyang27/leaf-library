# AGENTS.md · AI 会话工作约定

本文件是给所有在本仓工作的 AI 会话（和人类协作者）看的最高优先级约定。来由见 `docs/复盘-2026-09-21误删事故.md`——两次事故（2026-09-21 桌面误删、09-23 并行会话覆盖）都源于约定的缺失。

## 一、多会话写盘纪律（P0，无例外）

1. **同一时刻只允许一个会话对工作区有写权限**。其余会话只读；确需并行开发时，各自 `git worktree add` 独立目录，合并走显式流程，不走「直接写同一个工作区」。
2. **开工先对账**。`git status` + `git log --oneline -5` 看清工作区与 HEAD 状态；遇到不认识的在飞改动，**先问、不要顺手修、不要回滚**（09-23 发生过两个会话互相把对方的在飞工作误判为丢失）。
3. **禁止用旧草稿整体覆盖盘上文件**。写盘前先读盘上当前版本；编辑用增补，不凭记忆重写整文件（FilterBar 三处功能就是这么被删掉的——当时 540 条单测依然全绿）。
4. 长任务（build / e2e 电池）与另一会话的写盘错峰，避免半成品互相踩。

## 二、提交前验证口径

- 最低：`pnpm lint` + `pnpm typecheck` + `pnpm test` 全绿；
- 动过主进程/渲染层加载链：加跑 `pnpm build`；
- 动过导入/存储/删除链：加跑对应 e2e（`pnpm test:e2e` 全电池或按 spec）；
- 破坏性动作（rm、覆盖、清库）执行前，先列出将要删的东西并对账——删错一次的代价已经付过了。

## 三、仓库卫生

- `_archive/`、`scripts/_probes/`、`_compiled-from-cache/`、`_recovered-usable/`、`_recovery-partials/`、`_错位-src根/`、`build-snapshot-*/` 是**归档与事故恢复池**：不 import、不删除、不重新纳入 git（已在 .gitignore）。
- `*.bundle.ts` / `*.alt-from-snapshot` 是反编译/快照恢复**参考件，不是源码**：不作为实现依据，不要把它们当上下文喂给任何重构。
- 一次性调试脚本当天进 `scripts/_probes/`，不堆在 `scripts/` 顶层。

## 四、常用命令

```bash
pnpm dev            # 开发
pnpm build          # typecheck + 构建
pnpm lint           # eslint + SFC/源码完整性门
pnpm test           # vitest 单测
pnpm test:coverage  # 单测 + 覆盖率报告
pnpm test:e2e:smoke # Electron 启动冒烟（需先 pnpm build）
pnpm test:e2e       # e2e 全电池（真机，较慢）
node scripts/check-ai-env.mjs   # AI（onnxruntime）环境自查
```

## 五、文档地图

- **决策**：`docs/DECISIONS.md`（D-0xx，改架构/撤功能必须先立新决策条目）
- **Schema**：`docs/DB_SCHEMA.md`（唯一真理来源：先加 migration，再更新文档）
- **变更记录**：`CHANGELOG.md`（只记用户可感知项）
- **前瞻任务**：`docs/BACKLOG.md`（带优先级；完成即移入已完成段）
- **组件**：`docs/COMPONENTS.md`；**快捷键**：`docs/SHORTCUTS.md`
- **事故**：`docs/复盘-2026-09-21误删事故.md`
