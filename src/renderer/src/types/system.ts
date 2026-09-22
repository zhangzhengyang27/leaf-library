/**
 * Leaf 素材库 · System Info 类型（renderer 端副本）
 *
 * 主进程对应实现：src/main/ipc/system.ts
 * - userDataPath：Electron userData 根目录
 * - dbPath：leaf.db 绝对路径
 */

export interface SystemInfo {
  userDataPath: string
  dbPath: string
}
