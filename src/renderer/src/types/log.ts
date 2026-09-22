/**
 * Leaf · Log types（renderer 副本）
 *
 * 主进程对应实现：src/main/services/LogService.ts
 * 类型真相源：src/shared/types.ts
 *
 * 复制到这里而不是反向 import 是为了避免：
 * - 主进程反向依赖 renderer 路径
 * - vue-tsc 优先解析 .ts，preload/index.ts 不 export TelemetryMode
 */

export type TelemetryMode = 'off' | 'local' | 'remote'
