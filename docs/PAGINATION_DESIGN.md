# 素材列表分页化改造 · 前置设计

> 状态：阶段 0（主进程原语）已实现并有测试；阶段 1-3 待渲染层接手。
> 关联：审查报告「10 万级素材库」规模化项；DB 审查 P1-9（无分页/无 FTS）。
> FTS 部分已先行落地（m014 + `searchPhotos` 混合搜索），本文只覆盖分页。

## 1. 现状与瓶颈

```
loadPhotos() → photos:getByDateSection → getPhotosByDateSection() = getAll() 整表
            → 渲染层重建 allPhotos + photoIndex
loadUnsorted/loadRecent/loadRecycleBin/album/folder/smartAlbum → 5 个池各自全量
usePhotoFilters.displaySections → 全池 15 谓词过滤 + 排序 + 按日期分组（JS 侧）
```

10 万级库的代价：每次刷新把整表经 IPC 结构化克隆（数百 MB 级峰值）；
筛选每次变化全池 O(N×谓词数)；6 个池常驻内存。

渲染层窗口化渲染（PhotoGrid/PhotoListView）已经解决「画多少 DOM」，
但没解决「传多少数据、算多少谓词」。瓶颈必须从数据层拆掉。

## 2. 目标架构

```
渲染层视图窗口 ──getPage(cursor, limit)──▶ 主进程 SQL：WHERE(筛选下推) + ORDER BY + LIMIT
      ▲                                        │
      └──────── items + nextCursor + total ────┘
```

- **keyset 分页**（`(sort_col, rowid)` 复合游标），不用 OFFSET：
  深页码不衰减、插入/删除不漂移错页。
- 筛选与排序下推 SQL；渲染层只保留「已加载窗口」的 photoIndex（O(1) byIds
  保留，服务于选中/拖拽/键盘导航）。
- 计数走 `COUNT(*)`（同 WHERE），统计与列表彻底分离。

## 3. 游标协议

- 游标 = `base64url(JSON { c: <排序键值>, r: <rowid> })`，对渲染层不透明。
- WHERE 续页条件（DESC）：`(col < :c) OR (col = :c AND rowid < :r)`；ASC 反号。
- **只开放 NOT NULL 排序列**：`imported_at / file_name / file_size`。
  `taken_at` 可空，NULL 与游标比较在 keyset 下是经典坑，暂不开放
  （需要时用 `ORDER BY taken_at IS NULL, taken_at` 显式分组再议）。
- 非法游标：降级为首页 + console.warn（不抛错，列表永不因游标损坏而空白）。
- 排序一致性约束：游标比较的 COLLATE 必须与 ORDER BY 完全一致
  （当前全部 BINARY，无 NOCASE 特例）。

## 4. API（已实现：PhotoRepository.getPhotosPage）

```ts
interface PhotoPage { items: Photo[]; nextCursor: string | null; total: number }

getPhotosPage(opts: {
  where: string; params?: unknown[]      // 主进程内部构造，不透出到 IPC
  sort?: 'imported_at' | 'file_name' | 'file_size'
  desc?: boolean                         // 默认 true
  cursor?: string | null
  limit?: number                         // 1..500，默认 100（fetch limit+1 探测 hasMore）
})
```

**IPC 契约（阶段 1 接线，请求必须是语义形状、where 由主进程构造）：**

```ts
'photos:getPage' (req: {
  view: 'all' | 'trash' | 'favorites' | 'folder' | 'search'
  folderId?: string; query?: string
  sort?: 'imported_at' | 'file_name' | 'file_size'
  desc?: boolean; cursor?: string; limit?: number
}) => PhotoPage
```

安全约束：IPC 只收语义参数；where/params 一律主进程拼装（与现有
`resolveAssetPath`/pathPolicy 同一信任模型——渲染层不可传 SQL 片段）。

## 5. 分阶段迁移

| 阶段 | 内容 | 判定标准 |
|---|---|---|
| 0（已完成） | 仓储原语 + 测试；设计文档 | 游标遍历无重无漏 |
| 1 | IPC `photos:getPage` 接线；「全部」视图改为窗口取数（日期分组改为取相邻页聚合或按 fetched 顺序分组）；其余视图暂维持全量 | 10 万库冷启动 < 500ms、内存 < 300MB |
| 2 | 回收站/收藏/文件夹/搜索四视图换 getPage（search 直接复用 FTS where 构造器）；池缩小 | 各视图内存同「窗口大小」成正比 |
| 3 | usePhotoFilters 只保留「窗口内二次过滤」（智能收藏夹等仍在主进程 queryByRules 内下推）；删除整表 getAll/loadPhotos | IPC 克隆峰值 < 5MB |

## 6. 不变式（阶段 1-3 必须守住）

1. **选中/拖拽/键盘导航的 O(1) 索引不消失**：photoIndex 只覆盖已加载窗口，
   byIds 对未加载 id 返回空——调用方需容忍（当前拖出/导出已按 id 走
   `getPhotosByIds` 主进程路径，不受影响）。
2. **统计数字永远来自 SQL 聚合**（getLibraryStats），不来自池长度。
3. **搜索框是服务端搜索**（FTS），渲染层 matchKeyword 只做窗口内即时高亮过滤，
   逐步退役全池 matchKeyword。
4. 回滚开关：阶段 1-2 每个视图保留 `leaf:use-paged-<view>` pref 开关，
   出问题可逐视图回退全量路径。

## 7. 已知取舍

- keyset 游标不支持「跳转到第 N 页」（Eagle 的列表本身没有页码跳转，无碍）。
- 窗口化取数后「按日期分组」需要在渲染层按 fetched 顺序就地分组（阶段 1 实现），
  不再依赖主进程 groupByDate。
- file_name 排序为 BINARY（与现库行为一致）；NOCASE 需求出现时排序列与游标
  同步加 COLLATE，协议不变。
