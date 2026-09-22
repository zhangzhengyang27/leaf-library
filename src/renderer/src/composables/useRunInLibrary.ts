import { useRoute, useRouter } from 'vue-router'

/**
 * 十五轮 C14 / 审查 P2-23：选择/批量/弹窗类动作依赖 photos 视图挂载的
 * 组件与选中态，在其它路由触发时先切回 /photos 再执行。
 * App.vue 原生菜单、TitleBar 导入菜单、LibraryCommandPalette 共用。
 */
export function useRunInLibrary(): (fn: () => void) => void {
  const router = useRouter()
  const route = useRoute()
  return (fn: () => void): void => {
    void (async () => {
      if (String(route.name || '') !== 'photos') await router.push('/photos')
      fn()
    })()
  }
}
