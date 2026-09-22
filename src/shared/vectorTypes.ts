/**
 * Leaf · 向量档的共享合同（G1）
 *
 * 单源放这里的原因是本模块反复踩过的同一件事：类型抄两份就会分叉。
 * 主进程服务、preload 声明、设置页 UI 三处都要读同一份状态。
 */

export interface VectorProgress {
  done: number
  total: number
  failed: number
}

export interface VectorStatus {
  installed: boolean
  /** 模型在位且 warm-up 推理通过（.ready 标记存在）——只有这个为 true 才有向量档 */
  ready: boolean
  bytesOnDisk: number
  /** 已建向量的素材数 */
  indexed: number
  /** 待建向量的素材数（thumb_status=1 的 image） */
  pending: number
  /** 索引进度（null = 不在跑；结束后留最后一次结果供 UI 收尾显示） */
  progress: VectorProgress | null
  /** 下载进度（字节） */
  downloadGot: number
  downloadTotal: number
  modelId: string
  /** 设置页要写清"下的是哪个模型、多大、从哪下" */
  modelUrl: string
  approxBytes: number
  lastError: string | null
  /**
   * 两档相关性下限，随状态一起回给渲染层。
   * 放这儿是为了别再出现"UI 里手抄一份 0.40"——换模型或重标阈值时只有代码会改、
   * 界面文案还留着旧数字，正是本模块反复拆的那类漂移。
   */
  minScore: { text: number; image: number }
}
