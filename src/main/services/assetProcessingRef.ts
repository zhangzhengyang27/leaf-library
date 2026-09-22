/**
 * Leaf · AssetProcessingService 全局引用
 *
 * 主进程在 installDatabase 后创建服务并 setAssetProcessingRef 注入；
 * 懒加载模块（截图等）通过 getAssetProcessingRef 入队，避免循环依赖。
 */

import type { AssetProcessingService } from './AssetProcessingService'

let ref: AssetProcessingService | null = null

export function setAssetProcessingRef(service: AssetProcessingService): void {
  ref = service
}

export function getAssetProcessingRef(): AssetProcessingService | null {
  return ref
}
