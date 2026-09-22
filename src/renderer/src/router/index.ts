import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * Leaf 素材库 · 路由表（独立版）
 *
 * 素材库是主应用：`/` 直接落到素材库；settings/about 为应用级页面。
 */
const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(_to, _from, savedPosition) {
    const scrollContainer =
      document.querySelector<HTMLElement>('.App-router') ??
      document.querySelector<HTMLElement>('.app-scroll')
    if (!scrollContainer) return { top: 0 }
    scrollContainer.scrollTop = savedPosition?.top ?? 0
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      redirect: '/photos'
    },
    {
      path: '/photos',
      name: 'photos',
      component: () => import('../views/photos/index.vue')
    },
    {
      path: '/tags',
      name: 'tags',
      component: () => import('../views/tags/index.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue')
    },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('../views/stats/index.vue')
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue')
    }
  ]
})

export default router
