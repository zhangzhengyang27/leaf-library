import { Notification } from 'electron'
import { existsSync } from 'fs'
import icon from '../../../resources/icon.png?asset'

/**
 * 通知类型
 */
export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  POMODORO = 'pomodoro',
  RECORDING = 'recording'
}

/**
 * 通知选项
 */
export interface NotificationOptions {
  /** 通知图标路径 */
  icon?: string
  /** 是否播放声音 */
  sound?: boolean
  /** 通知超时时间（毫秒），0 表示不自动关闭 */
  timeout?: number
  /** 操作按钮 */
  actions?: Array<{ text: string; action: string }>
  /**
   * @deprecated 已移除：函数无法跨 IPC 传输（structured clone 不可克隆），
   * 该字段在主进程侧恒为 undefined。请改用 notification:event 事件（BUGS.md B10）
   */
  onClick?: never
  /**
   * @deprecated 已移除：同上，改用 notification:event 事件
   */
  onClose?: never
}

/** 通知事件（点击 / 关闭），由 IPC 层广播给渲染进程 */
export interface NotificationEventPayload {
  id: number
  kind: 'click' | 'close'
}

/**
 * 通知服务
 * 提供系统通知功能，支持多种通知类型和自定义选项
 */
export class NotificationService {
  private static instance: NotificationService
  private notifications: Map<number, Notification> = new Map()
  private nextId = 1
  private eventListeners: Array<(e: NotificationEventPayload) => void> = []

  /** 订阅通知事件；返回取消订阅函数 */
  onNotificationEvent(cb: (e: NotificationEventPayload) => void): () => void {
    this.eventListeners.push(cb)
    return () => {
      const i = this.eventListeners.indexOf(cb)
      if (i >= 0) this.eventListeners.splice(i, 1)
    }
  }

  private emitEvent(e: NotificationEventPayload): void {
    for (const cb of [...this.eventListeners]) {
      try {
        cb(e)
      } catch (err) {
        console.warn('[NotificationService] event listener failed:', err)
      }
    }
  }

  private constructor() {
    // 确保在 macOS 上请求通知权限
    if (process.platform === 'darwin') {
      // macOS 10.14+ 需要请求通知权限
      if (Notification.isSupported()) {
        // 权限会在首次显示通知时自动请求
      }
    }
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  /**
   * 显示通知
   * @param type 通知类型
   * @param title 通知标题
   * @param body 通知内容
   * @param options 通知选项
   * @returns 通知 ID
   */
  show(
    type: NotificationType,
    title: string,
    body: string,
    options: NotificationOptions = {}
  ): number {
    const id = this.nextId++

    // 检查通知是否支持
    if (!Notification.isSupported()) {
      console.warn('Notifications are not supported on this system')
      return id
    }

    // 获取通知图标
    const notificationIcon = this.getNotificationIcon(options.icon)

    // 创建通知
    const notification = new Notification({
      title,
      body,
      icon: notificationIcon,
      silent: !options.sound,
      urgency: this.getUrgency(type)
    })

    // 设置超时
    if (options.timeout && options.timeout > 0) {
      setTimeout(() => {
        notification.close()
        this.notifications.delete(id)
      }, options.timeout)
    }

    // 点击 → 广播事件（渲染端订阅 notification:event 后按 id 分发）
    // 说明：渲染层无法通过 IPC 传函数（structured clone 不可克隆），
    // 旧的 options.onClick / onClose 字段恒为 undefined（BUGS.md B10）
    notification.on('click', () => {
      this.emitEvent({ id, kind: 'click' })
    })

    // 设置关闭回调
    notification.on('close', () => {
      this.notifications.delete(id)
      this.emitEvent({ id, kind: 'close' })
    })

    // 显示通知
    notification.show()
    this.notifications.set(id, notification)

    return id
  }

  /**
   * 关闭通知
   * @param id 通知 ID
   */
  close(id: number): void {
    const notification = this.notifications.get(id)
    if (notification) {
      notification.close()
      this.notifications.delete(id)
    }
  }

  /**
   * 关闭所有通知
   */
  closeAll(): void {
    this.notifications.forEach((notification) => {
      notification.close()
    })
    this.notifications.clear()
  }

  /**
   * 获取通知图标
   */
  private getNotificationIcon(customIcon?: string): string | undefined {
    // 如果提供了自定义图标，优先使用
    if (customIcon && existsSync(customIcon)) {
      return customIcon
    }

    // 根据类型返回默认图标
    // 目前使用应用图标，后续可以添加类型特定的图标
    return icon
  }

  /**
   * 获取通知紧急程度
   */
  private getUrgency(type: NotificationType): 'normal' | 'critical' {
    switch (type) {
      case NotificationType.ERROR:
      case NotificationType.WARNING:
        return 'critical'
      default:
        return 'normal'
    }
  }

  /**
   * 显示番茄钟通知
   * - 接受可选 NotificationOptions，覆盖默认配置（timeout / sound / etc.）
   */
  showPomodoroNotification(
    type: 'start' | 'break' | 'complete' | 'pause' | 'remind',
    message?: string,
    options?: NotificationOptions
  ): number {
    let title = '番茄钟'
    let body = message || ''
    let defaultSound = false
    let defaultTimeout = 3000

    switch (type) {
      case 'start':
        title = '🍅 番茄钟开始'
        body = message || '专注时间开始，加油！'
        defaultSound = false
        defaultTimeout = 3000
        break
      case 'break':
        title = '☕ 休息时间'
        body = message || '该休息一下了，放松一下眼睛和大脑'
        defaultSound = true
        defaultTimeout = 3000
        break
      case 'complete':
        title = '✅ 任务完成'
        body = message || '恭喜完成一个番茄钟！'
        defaultSound = true
        defaultTimeout = 5000
        break
      case 'pause':
        title = '⏸️ 已暂停'
        body = message || '番茄钟已暂停'
        defaultSound = false
        defaultTimeout = 3000
        break
    }

    return this.show(NotificationType.POMODORO, title, body, {
      sound: options?.sound ?? defaultSound,
      timeout: options?.timeout ?? defaultTimeout,
      ...options
    })
  }

  /**
   * 显示屏幕录制通知
   */
  showRecordingNotification(type: 'start' | 'stop' | 'error', message?: string): number {
    let title = '屏幕录制'
    let body = message || ''

    switch (type) {
      case 'start':
        title = '🔴 录制开始'
        body = message || '屏幕录制已开始'
        break
      case 'stop':
        title = '⏹️ 录制完成'
        body = message || '屏幕录制已保存'
        break
      case 'error':
        title = '❌ 录制错误'
        body = message || '录制过程中发生错误'
        break
    }

    return this.show(NotificationType.RECORDING, title, body, {
      sound: type === 'stop',
      timeout: type === 'error' ? 0 : 3000
      // urgency 由 show 方法内部根据 NotificationType 决定，无需在此再次指定
    })
  }

  /**
   * 显示通用信息通知
   */
  showInfo(title: string, body: string, options?: NotificationOptions): number {
    return this.show(NotificationType.INFO, title, body, options)
  }

  /**
   * 显示成功通知
   */
  showSuccess(title: string, body: string, options?: NotificationOptions): number {
    return this.show(NotificationType.SUCCESS, title, body, options)
  }

  /**
   * 显示警告通知
   */
  showWarning(title: string, body: string, options?: NotificationOptions): number {
    return this.show(NotificationType.WARNING, title, body, {
      ...options
      // urgency 由 show 方法内部根据 NotificationType 决定，无需在 showWarning 中再次指定
    })
  }

  /**
   * 显示错误通知
   */
  showError(title: string, body: string, options?: NotificationOptions): number {
    return this.show(NotificationType.ERROR, title, body, {
      ...options,
      timeout: 0 // 错误通知不自动关闭
    })
  }
}
