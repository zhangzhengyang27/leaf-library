import { BrowserWindow } from 'electron'
import { registerHandlers } from './utils'
import { NotificationService, NotificationType } from '../services/NotificationService'

export function registerNotificationIpcHandlers(): void {
  const notificationService = NotificationService.getInstance()

  // B10：把通知的点击/关闭转成事件广播（渲染端不可能通过 IPC 传回调函数）
  notificationService.onNotificationEvent((payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('notification:event', payload)
      }
    }
  })

  registerHandlers({
    'notification:show': (
      _event,
      type: NotificationType,
      title: string,
      body: string,
      options?: any
    ) => {
      return notificationService.show(type, title, body, options)
    },
    'notification:pomodoro': (
      _event,
      type: 'start' | 'break' | 'complete' | 'pause',
      message?: string
    ) => {
      return notificationService.showPomodoroNotification(type, message)
    },
    'notification:recording': (_event, type: 'start' | 'stop' | 'error', message?: string) => {
      return notificationService.showRecordingNotification(type, message)
    },
    'notification:info': (_event, title: string, body: string, options?: any) => {
      return notificationService.showInfo(title, body, options)
    },
    'notification:success': (_event, title: string, body: string, options?: any) => {
      return notificationService.showSuccess(title, body, options)
    },
    'notification:warning': (_event, title: string, body: string, options?: any) => {
      return notificationService.showWarning(title, body, options)
    },
    'notification:error': (_event, title: string, body: string, options?: any) => {
      return notificationService.showError(title, body, options)
    },
    'notification:close': (_event, id: number) => {
      notificationService.close(id)
    },
    'notification:closeAll': () => {
      notificationService.closeAll()
    }
  })
}
