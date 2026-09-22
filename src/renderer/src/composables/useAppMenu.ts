/**
 * Leaf · 主进程 → 渲染端：菜单 / dock / tray 跳转统一处理
 *
 * 订阅的 channel（src/main/modules/appMenu.ts 发出）：
 * - app:openModule           { moduleId, path }
 * - app:goHome
 * - app:openCommandPalette
 * - app:openSettings
 * - app:openAbout
 *
 * 跳转路径与 ⌘1-9 / CommandPalette 完全一致：router.push + usage.recordUse。
 * 调用方（App.vue）在挂载时 install() 一次；卸载时 uninstall() 释放 listener。
 */

import { useRouter, type Router } from 'vue-router'

type Unsubscribe = () => void

export function useAppMenu(): {
  install: () => Unsubscribe
} {
  // install() 在 onMounted 钩子内同步调用（此时组件实例仍有效，inject 可用），
  // router 必须在 install 时捕获；navigateAndRecord 由 IPC 回调触发，
  // 回调执行时无组件实例，届时再 useRouter() 会拿到 undefined 导致菜单跳转失效
  let routerRef: Router | null = null

  function navigateAndRecord(_moduleId: string, path: string): void {
    // 代码审查 P2：usage.recordUse 是死通道（主进程无 handler），
    // 调用会触发 unhandled rejection，删除埋点
    if (!routerRef) return
    void routerRef.push(path)
  }

  function install(): Unsubscribe {
    const unsubs: Unsubscribe[] = []
    const router = useRouter()
    routerRef = router

    if (window.api?.onAppOpenModule) {
      unsubs.push(
        window.api.onAppOpenModule(({ moduleId, path }) => {
          navigateAndRecord(moduleId, path)
        })
      )
    }
    if (window.api?.onAppGoHome) {
      unsubs.push(window.api.onAppGoHome(() => router.push('/')))
    }
    if (window.api?.onAppOpenCommandPalette) {
      unsubs.push(
        window.api.onAppOpenCommandPalette(() => {
          void import('./useLibraryCommandPalette').then(({ useLibraryCommandPalette }) => {
            useLibraryCommandPalette().open()
          })
        })
      )
    }
    if (window.api?.onAppOpenSettings) {
      unsubs.push(window.api.onAppOpenSettings(() => router.push('/settings')))
    }
    if (window.api?.onAppOpenAbout) {
      unsubs.push(window.api.onAppOpenAbout(() => router.push('/about')))
    }

    return () => {
      for (const u of unsubs) u()
    }
  }

  return { install }
}
