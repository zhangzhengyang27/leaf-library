/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import.meta.env = {"BASE_URL": "/", "DEV": true, "MODE": "development", "PROD": false, "SSR": false, "VITE_DEV_PROXY_TARGET": "http://localhost:3200", "VITE_ELEMENTS_API_BASE_URL": "/api"};import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "/src/stores/auth.ts";
const devOnlyRoutes = import.meta.env.DEV ? [
  {
    path: "/test",
    component: () => import("/src/views/EditorTest.vue")
  }
] : [];
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/knowledge"
    },
    ...devOnlyRoutes,
    {
      path: "/share/:shareKey",
      name: "public-share",
      component: () => import("/src/views/public/ShareView.vue")
    },
    {
      path: "/auth/login",
      name: "login",
      component: () => import("/src/views/auth/LoginView.vue?t=1789981910203"),
      meta: {
        requiresGuest: true
      }
    },
    {
      // 密码找回：无 token=申请表单，带 token=重置表单（邮件链接落地页）
      path: "/auth/reset",
      name: "auth-reset",
      component: () => import("/src/views/auth/ResetPasswordView.vue"),
      meta: {
        requiresGuest: true
      }
    },
    {
      // 锁定窗口（LockWindow，#27）加载的路由：不经认证守卫——锁屏恰恰要无视登录态渲染
      path: "/lock",
      name: "desktop-lock",
      component: () => import("/src/views/lock/DesktopLockView.vue")
    },
    {
      path: "/account",
      name: "account",
      component: () => import("/src/views/auth/AccountView.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("/src/views/settings/DesktopSettingsView.vue"),
      meta: {
        // 语雀的偏好设置入口本身要求已登录（菜单项 visible: currentUser.isLogin）
        requiresAuth: true
      }
    },
    {
      // KB 设置独立窗口（⋯ 菜单「更多设置」落点）：只含设置功能，无工作台外壳
      path: "/kb-settings/:kbId",
      name: "kb-settings-standalone",
      component: () => import("/src/views/knowledge/KnowledgeSettingsStandaloneView.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/knowledge",
      name: "knowledge",
      component: () => import("/src/views/knowledge/KnowledgeBasesView.vue?t=1789982017328"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/knowledge/start",
      name: "knowledge-start",
      component: () => import("/src/views/knowledge/KnowledgeStartView.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/knowledge/ai-writing",
      name: "knowledge-ai-writing",
      component: () => import("/src/views/knowledge/KnowledgeAiWritingView.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/knowledge/notes",
      name: "knowledge-notes",
      component: () => import("/src/views/knowledge/KnowledgeNotesView.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/knowledge/recent",
      name: "knowledge-recent",
      component: () => import("/src/views/knowledge/KnowledgeRecentView.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/knowledge/boards",
      name: "knowledge-boards",
      component: () => import("/src/views/knowledge/KnowledgeBoardsView.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/knowledge/favorites",
      name: "knowledge-favorites",
      component: () => import("/src/views/knowledge/KnowledgeFavoritesView.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/knowledge/trash",
      name: "knowledge-trash",
      component: () => import("/src/views/knowledge/KnowledgeTrashView.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/knowledge/:kbId",
      component: () => import("/src/views/knowledge/KnowledgeWorkspaceLayout.vue?t=1789982017328"),
      meta: {
        requiresAuth: true
      },
      children: [
        {
          path: "",
          name: "knowledge-workspace-home",
          component: () => import("/src/views/knowledge/KnowledgeWorkspaceHomeView.vue?t=1789981910203")
        },
        {
          path: "overview",
          name: "knowledge-overview",
          component: () => import("/src/views/knowledge/KnowledgeOverviewView.vue")
        },
        {
          path: "search",
          name: "knowledge-search",
          component: () => import("/src/views/knowledge/KnowledgeSearchView.vue")
        },
        {
          path: "doc/:docId",
          name: "knowledge-doc-editor",
          component: () => import("/src/views/knowledge/KnowledgeDocEditorView.vue?t=1789981949961")
        },
        {
          path: "board/:docId",
          name: "knowledge-board-editor",
          component: () => import("/src/views/knowledge/KnowledgeBoardEditorView.vue?t=1789981910203")
        },
        {
          path: "datatable/:docId",
          name: "knowledge-datatable-editor",
          component: () => import("/src/views/knowledge/KnowledgeDataTableEditorView.vue?t=1789981910203")
        },
        {
          path: "sheet/:docId",
          name: "knowledge-sheet-editor",
          component: () => import("/src/views/knowledge/KnowledgeSheetEditorView.vue")
        },
        {
          path: "mindmap/:docId",
          name: "knowledge-mindmap-editor",
          component: () => import("/src/views/knowledge/KnowledgeMindmapEditorView.vue")
        },
        {
          path: "settings",
          name: "knowledge-settings",
          component: () => import("/src/views/knowledge/KnowledgeSettingsView.vue")
        }
      ]
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/knowledge"
    }
  ]
});
const resolveSafeRedirect = (value) => {
  if (typeof value !== "string") {
    return "/knowledge";
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/auth")) {
    return "/knowledge";
  }
  return trimmed;
};
router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  await authStore.ensureHydrated();
  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return {
      name: "login",
      query: {
        redirect: to.fullPath
      }
    };
  }
  if (to.meta.requiresGuest && authStore.isLoggedIn) {
    return resolveSafeRedirect(to.query.redirect);
  }
  return true;
});
export default router;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKiDphY3nva7lupTnlKjot6/nlLHjgIHorqTor4HlrojljavkuI7pobXpnaLot7Povazop4TliJnjgIIgKi9cblxuaW1wb3J0IHsgY3JlYXRlUm91dGVyLCBjcmVhdGVXZWJIaXN0b3J5LCB0eXBlIFJvdXRlUmVjb3JkUmF3IH0gZnJvbSBcInZ1ZS1yb3V0ZXJcIlxuaW1wb3J0IHsgdXNlQXV0aFN0b3JlIH0gZnJvbSBcIkAvc3RvcmVzL2F1dGhcIlxuXG4vKiog6IGU6LCD6aG177yIRWRpdG9yVGVzdO+8ieWPquazqOWGjOi/m+W8gOWPkeaehOW7uu+8jOmBv+WFjemaj+eUn+S6p+WMheWIhuWPkeaXoOWuiOWNq+WFpeWPo+OAgiAqL1xuY29uc3QgZGV2T25seVJvdXRlczogUm91dGVSZWNvcmRSYXdbXSA9IGltcG9ydC5tZXRhLmVudi5ERVZcbiAgPyBbXG4gICAgICB7XG4gICAgICAgIHBhdGg6IFwiL3Rlc3RcIixcbiAgICAgICAgY29tcG9uZW50OiAoKSA9PiBpbXBvcnQoXCJAL3ZpZXdzL0VkaXRvclRlc3QudnVlXCIpLFxuICAgICAgfSxcbiAgICBdXG4gIDogW11cblxuY29uc3Qgcm91dGVyID0gY3JlYXRlUm91dGVyKHtcbiAgaGlzdG9yeTogY3JlYXRlV2ViSGlzdG9yeSgpLFxuICByb3V0ZXM6IFtcbiAgICB7XG4gICAgICBwYXRoOiBcIi9cIixcbiAgICAgIHJlZGlyZWN0OiBcIi9rbm93bGVkZ2VcIixcbiAgICB9LFxuICAgIC4uLmRldk9ubHlSb3V0ZXMsXG4gICAge1xuICAgICAgcGF0aDogXCIvc2hhcmUvOnNoYXJlS2V5XCIsXG4gICAgICBuYW1lOiBcInB1YmxpYy1zaGFyZVwiLFxuICAgICAgY29tcG9uZW50OiAoKSA9PiBpbXBvcnQoXCJAL3ZpZXdzL3B1YmxpYy9TaGFyZVZpZXcudnVlXCIpLFxuICAgIH0sXG4gICAge1xuICAgICAgcGF0aDogXCIvYXV0aC9sb2dpblwiLFxuICAgICAgbmFtZTogXCJsb2dpblwiLFxuICAgICAgY29tcG9uZW50OiAoKSA9PiBpbXBvcnQoXCJAL3ZpZXdzL2F1dGgvTG9naW5WaWV3LnZ1ZVwiKSxcbiAgICAgIG1ldGE6IHtcbiAgICAgICAgcmVxdWlyZXNHdWVzdDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICAvLyDlr4bnoIHmib7lm57vvJrml6AgdG9rZW4955Sz6K+36KGo5Y2V77yM5bimIHRva2VuPemHjee9ruihqOWNle+8iOmCruS7tumTvuaOpeiQveWcsOmhte+8iVxuICAgICAgcGF0aDogXCIvYXV0aC9yZXNldFwiLFxuICAgICAgbmFtZTogXCJhdXRoLXJlc2V0XCIsXG4gICAgICBjb21wb25lbnQ6ICgpID0+IGltcG9ydChcIkAvdmlld3MvYXV0aC9SZXNldFBhc3N3b3JkVmlldy52dWVcIiksXG4gICAgICBtZXRhOiB7XG4gICAgICAgIHJlcXVpcmVzR3Vlc3Q6IHRydWUsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgLy8g6ZSB5a6a56qX5Y+j77yITG9ja1dpbmRvd++8jCMyN++8ieWKoOi9veeahOi3r+eUse+8muS4jee7j+iupOivgeWuiOWNq+KAlOKAlOmUgeWxj+aBsOaBsOimgeaXoOinhueZu+W9leaAgea4suafk1xuICAgICAgcGF0aDogXCIvbG9ja1wiLFxuICAgICAgbmFtZTogXCJkZXNrdG9wLWxvY2tcIixcbiAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9sb2NrL0Rlc2t0b3BMb2NrVmlldy52dWVcIiksXG4gICAgfSxcbiAgICB7XG4gICAgICBwYXRoOiBcIi9hY2NvdW50XCIsXG4gICAgICBuYW1lOiBcImFjY291bnRcIixcbiAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9hdXRoL0FjY291bnRWaWV3LnZ1ZVwiKSxcbiAgICAgIG1ldGE6IHtcbiAgICAgICAgcmVxdWlyZXNBdXRoOiB0cnVlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIHBhdGg6IFwiL3NldHRpbmdzXCIsXG4gICAgICBuYW1lOiBcInNldHRpbmdzXCIsXG4gICAgICBjb21wb25lbnQ6ICgpID0+IGltcG9ydChcIkAvdmlld3Mvc2V0dGluZ3MvRGVza3RvcFNldHRpbmdzVmlldy52dWVcIiksXG4gICAgICBtZXRhOiB7XG4gICAgICAgIC8vIOivrembgOeahOWBj+Wlveiuvue9ruWFpeWPo+acrOi6q+imgeaxguW3sueZu+W9le+8iOiPnOWNlemhuSB2aXNpYmxlOiBjdXJyZW50VXNlci5pc0xvZ2lu77yJXG4gICAgICAgIHJlcXVpcmVzQXV0aDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICAvLyBLQiDorr7nva7ni6znq4vnqpflj6PvvIjii68g6I+c5Y2V44CM5pu05aSa6K6+572u44CN6JC954K577yJ77ya5Y+q5ZCr6K6+572u5Yqf6IO977yM5peg5bel5L2c5Y+w5aSW5aOzXG4gICAgICBwYXRoOiBcIi9rYi1zZXR0aW5ncy86a2JJZFwiLFxuICAgICAgbmFtZTogXCJrYi1zZXR0aW5ncy1zdGFuZGFsb25lXCIsXG4gICAgICBjb21wb25lbnQ6ICgpID0+IGltcG9ydChcIkAvdmlld3Mva25vd2xlZGdlL0tub3dsZWRnZVNldHRpbmdzU3RhbmRhbG9uZVZpZXcudnVlXCIpLFxuICAgICAgbWV0YToge1xuICAgICAgICByZXF1aXJlc0F1dGg6IHRydWUsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgcGF0aDogXCIva25vd2xlZGdlXCIsXG4gICAgICBuYW1lOiBcImtub3dsZWRnZVwiLFxuICAgICAgY29tcG9uZW50OiAoKSA9PiBpbXBvcnQoXCJAL3ZpZXdzL2tub3dsZWRnZS9Lbm93bGVkZ2VCYXNlc1ZpZXcudnVlXCIpLFxuICAgICAgbWV0YToge1xuICAgICAgICByZXF1aXJlc0F1dGg6IHRydWUsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgcGF0aDogXCIva25vd2xlZGdlL3N0YXJ0XCIsXG4gICAgICBuYW1lOiBcImtub3dsZWRnZS1zdGFydFwiLFxuICAgICAgY29tcG9uZW50OiAoKSA9PiBpbXBvcnQoXCJAL3ZpZXdzL2tub3dsZWRnZS9Lbm93bGVkZ2VTdGFydFZpZXcudnVlXCIpLFxuICAgICAgbWV0YToge1xuICAgICAgICByZXF1aXJlc0F1dGg6IHRydWUsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgcGF0aDogXCIva25vd2xlZGdlL2FpLXdyaXRpbmdcIixcbiAgICAgIG5hbWU6IFwia25vd2xlZGdlLWFpLXdyaXRpbmdcIixcbiAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9rbm93bGVkZ2UvS25vd2xlZGdlQWlXcml0aW5nVmlldy52dWVcIiksXG4gICAgICBtZXRhOiB7XG4gICAgICAgIHJlcXVpcmVzQXV0aDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBwYXRoOiBcIi9rbm93bGVkZ2Uvbm90ZXNcIixcbiAgICAgIG5hbWU6IFwia25vd2xlZGdlLW5vdGVzXCIsXG4gICAgICBjb21wb25lbnQ6ICgpID0+IGltcG9ydChcIkAvdmlld3Mva25vd2xlZGdlL0tub3dsZWRnZU5vdGVzVmlldy52dWVcIiksXG4gICAgICBtZXRhOiB7XG4gICAgICAgIHJlcXVpcmVzQXV0aDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBwYXRoOiBcIi9rbm93bGVkZ2UvcmVjZW50XCIsXG4gICAgICBuYW1lOiBcImtub3dsZWRnZS1yZWNlbnRcIixcbiAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9rbm93bGVkZ2UvS25vd2xlZGdlUmVjZW50Vmlldy52dWVcIiksXG4gICAgICBtZXRhOiB7XG4gICAgICAgIHJlcXVpcmVzQXV0aDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBwYXRoOiBcIi9rbm93bGVkZ2UvYm9hcmRzXCIsXG4gICAgICBuYW1lOiBcImtub3dsZWRnZS1ib2FyZHNcIixcbiAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9rbm93bGVkZ2UvS25vd2xlZGdlQm9hcmRzVmlldy52dWVcIiksXG4gICAgICBtZXRhOiB7XG4gICAgICAgIHJlcXVpcmVzQXV0aDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBwYXRoOiBcIi9rbm93bGVkZ2UvZmF2b3JpdGVzXCIsXG4gICAgICBuYW1lOiBcImtub3dsZWRnZS1mYXZvcml0ZXNcIixcbiAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9rbm93bGVkZ2UvS25vd2xlZGdlRmF2b3JpdGVzVmlldy52dWVcIiksXG4gICAgICBtZXRhOiB7XG4gICAgICAgIHJlcXVpcmVzQXV0aDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBwYXRoOiBcIi9rbm93bGVkZ2UvdHJhc2hcIixcbiAgICAgIG5hbWU6IFwia25vd2xlZGdlLXRyYXNoXCIsXG4gICAgICBjb21wb25lbnQ6ICgpID0+IGltcG9ydChcIkAvdmlld3Mva25vd2xlZGdlL0tub3dsZWRnZVRyYXNoVmlldy52dWVcIiksXG4gICAgICBtZXRhOiB7XG4gICAgICAgIHJlcXVpcmVzQXV0aDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBwYXRoOiBcIi9rbm93bGVkZ2UvOmtiSWRcIixcbiAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9rbm93bGVkZ2UvS25vd2xlZGdlV29ya3NwYWNlTGF5b3V0LnZ1ZVwiKSxcbiAgICAgIG1ldGE6IHtcbiAgICAgICAgcmVxdWlyZXNBdXRoOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGNoaWxkcmVuOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBwYXRoOiBcIlwiLFxuICAgICAgICAgIG5hbWU6IFwia25vd2xlZGdlLXdvcmtzcGFjZS1ob21lXCIsXG4gICAgICAgICAgY29tcG9uZW50OiAoKSA9PiBpbXBvcnQoXCJAL3ZpZXdzL2tub3dsZWRnZS9Lbm93bGVkZ2VXb3Jrc3BhY2VIb21lVmlldy52dWVcIiksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBwYXRoOiBcIm92ZXJ2aWV3XCIsXG4gICAgICAgICAgbmFtZTogXCJrbm93bGVkZ2Utb3ZlcnZpZXdcIixcbiAgICAgICAgICBjb21wb25lbnQ6ICgpID0+IGltcG9ydChcIkAvdmlld3Mva25vd2xlZGdlL0tub3dsZWRnZU92ZXJ2aWV3Vmlldy52dWVcIiksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBwYXRoOiBcInNlYXJjaFwiLFxuICAgICAgICAgIG5hbWU6IFwia25vd2xlZGdlLXNlYXJjaFwiLFxuICAgICAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9rbm93bGVkZ2UvS25vd2xlZGdlU2VhcmNoVmlldy52dWVcIiksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBwYXRoOiBcImRvYy86ZG9jSWRcIixcbiAgICAgICAgICBuYW1lOiBcImtub3dsZWRnZS1kb2MtZWRpdG9yXCIsXG4gICAgICAgICAgY29tcG9uZW50OiAoKSA9PiBpbXBvcnQoXCJAL3ZpZXdzL2tub3dsZWRnZS9Lbm93bGVkZ2VEb2NFZGl0b3JWaWV3LnZ1ZVwiKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHBhdGg6IFwiYm9hcmQvOmRvY0lkXCIsXG4gICAgICAgICAgbmFtZTogXCJrbm93bGVkZ2UtYm9hcmQtZWRpdG9yXCIsXG4gICAgICAgICAgY29tcG9uZW50OiAoKSA9PiBpbXBvcnQoXCJAL3ZpZXdzL2tub3dsZWRnZS9Lbm93bGVkZ2VCb2FyZEVkaXRvclZpZXcudnVlXCIpLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcGF0aDogXCJkYXRhdGFibGUvOmRvY0lkXCIsXG4gICAgICAgICAgbmFtZTogXCJrbm93bGVkZ2UtZGF0YXRhYmxlLWVkaXRvclwiLFxuICAgICAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9rbm93bGVkZ2UvS25vd2xlZGdlRGF0YVRhYmxlRWRpdG9yVmlldy52dWVcIiksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBwYXRoOiBcInNoZWV0Lzpkb2NJZFwiLFxuICAgICAgICAgIG5hbWU6IFwia25vd2xlZGdlLXNoZWV0LWVkaXRvclwiLFxuICAgICAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9rbm93bGVkZ2UvS25vd2xlZGdlU2hlZXRFZGl0b3JWaWV3LnZ1ZVwiKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHBhdGg6IFwibWluZG1hcC86ZG9jSWRcIixcbiAgICAgICAgICBuYW1lOiBcImtub3dsZWRnZS1taW5kbWFwLWVkaXRvclwiLFxuICAgICAgICAgIGNvbXBvbmVudDogKCkgPT4gaW1wb3J0KFwiQC92aWV3cy9rbm93bGVkZ2UvS25vd2xlZGdlTWluZG1hcEVkaXRvclZpZXcudnVlXCIpLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcGF0aDogXCJzZXR0aW5nc1wiLFxuICAgICAgICAgIG5hbWU6IFwia25vd2xlZGdlLXNldHRpbmdzXCIsXG4gICAgICAgICAgY29tcG9uZW50OiAoKSA9PiBpbXBvcnQoXCJAL3ZpZXdzL2tub3dsZWRnZS9Lbm93bGVkZ2VTZXR0aW5nc1ZpZXcudnVlXCIpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIHtcbiAgICAgIHBhdGg6IFwiLzpwYXRoTWF0Y2goLiopKlwiLFxuICAgICAgcmVkaXJlY3Q6IFwiL2tub3dsZWRnZVwiLFxuICAgIH0sXG4gIF0sXG59KVxuXG4vKipcbiAqIOagoemqjOeZu+W9leWQjuWbnui3s+ebruagh++8muWPquaOpeWPl+ermeWGhei3r+W+hO+8iOS7peWNleS4quaWnOadoOW8gOWktOOAgemdnuiupOivgemhte+8ie+8jFxuICog5ouS57ud5aSW6ZO+77yI5Y2P6K6u55u45a+55Zyw5Z2A77yJ5LiO6K6k6K+B6aG16Ieq5byV55So5b6q546v77yM6Z2e5rOV5YC85Zue6JC955+l6K+G5bqT6aaW6aG144CCXG4gKi9cbmNvbnN0IHJlc29sdmVTYWZlUmVkaXJlY3QgPSAodmFsdWU6IHVua25vd24pOiBzdHJpbmcgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIFwiL2tub3dsZWRnZVwiXG4gIH1cblxuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpXG5cbiAgaWYgKCF0cmltbWVkLnN0YXJ0c1dpdGgoXCIvXCIpIHx8IHRyaW1tZWQuc3RhcnRzV2l0aChcIi8vXCIpIHx8IHRyaW1tZWQuc3RhcnRzV2l0aChcIi9hdXRoXCIpKSB7XG4gICAgcmV0dXJuIFwiL2tub3dsZWRnZVwiXG4gIH1cblxuICByZXR1cm4gdHJpbW1lZFxufVxuXG5yb3V0ZXIuYmVmb3JlRWFjaChhc3luYyB0byA9PiB7XG4gIGNvbnN0IGF1dGhTdG9yZSA9IHVzZUF1dGhTdG9yZSgpXG4gIGF3YWl0IGF1dGhTdG9yZS5lbnN1cmVIeWRyYXRlZCgpXG5cbiAgaWYgKHRvLm1ldGEucmVxdWlyZXNBdXRoICYmICFhdXRoU3RvcmUuaXNMb2dnZWRJbikge1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiBcImxvZ2luXCIsXG4gICAgICBxdWVyeToge1xuICAgICAgICByZWRpcmVjdDogdG8uZnVsbFBhdGgsXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIGlmICh0by5tZXRhLnJlcXVpcmVzR3Vlc3QgJiYgYXV0aFN0b3JlLmlzTG9nZ2VkSW4pIHtcbiAgICByZXR1cm4gcmVzb2x2ZVNhZmVSZWRpcmVjdCh0by5xdWVyeS5yZWRpcmVjdClcbiAgfVxuXG4gIHJldHVybiB0cnVlXG59KVxuXG5leHBvcnQgZGVmYXVsdCByb3V0ZXJcbiJdLCJtYXBwaW5ncyI6IkFBRUEsU0FB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