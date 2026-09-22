import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { homedir } from 'node:os'
import { log } from '../services/LogService'

type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any | Promise<any>

/**
 * 错误脱敏（审查 P3-18）：原始 fs/DB 错误 message 常含绝对路径（甚至库外路径），
 * 直接抛给渲染层是信息泄露面。主进程日志留全量，渲染层只收脱敏后的 message。
 */
function sanitizeError(err: unknown): Error {
  return new Error(sanitizeIpcMessage(err), { cause: err instanceof Error ? err : undefined })
}

/** 供 catch 块里以 `{ ok:false, error }` 形式返回的 handler 复用的脱敏版 */
export function sanitizeIpcMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  let msg = raw
  try {
    const userData = app.getPath('userData')
    const home = homedir()
    if (msg.includes(userData)) msg = msg.split(userData).join('~/.leaf')
    if (msg.includes(home)) msg = msg.split(home).join('~')
  } catch {
    /* ignore */
  }
  return msg
}

/**
 * 批量注册 IPC 处理器，减少样板代码。
 * 先移除已有 handler 防止重复注册报错。
 * 统一错误包装：log 原始错误，向渲染层抛脱敏后的错误。
 */
export function registerHandlers(map: Record<string, IpcHandler>): void {
  for (const [channel, handler] of Object.entries(map)) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...args)
      } catch (err) {
        log.error('ipc', `${channel} failed`, err)
        throw sanitizeError(err)
      }
    })
  }
}

/**
 * 将对象方法按前缀注册为 IPC 处理器。
 * 例如：prefix = 'photos', methods = { getAll: store.getAll }
 * 会注册 'photos:getAll' → handler
 * 先移除已有 handler 防止重复注册报错。
 * 统一错误包装：log 原始错误，向渲染层抛脱敏后的错误。
 */
export function registerPrefixedHandlers(
  prefix: string,
  methods: Record<string, (...args: any[]) => any | Promise<any>>
): void {
  for (const [name, fn] of Object.entries(methods)) {
    const channel = `${prefix}:${name}`
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await fn(...args)
      } catch (err) {
        log.error('ipc', `${channel} failed`, err)
        throw sanitizeError(err)
      }
    })
  }
}
