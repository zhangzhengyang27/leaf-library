<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RouteLoading from './components/RouteLoading.vue'
import AppShell from './components/shell/AppShell.vue'
import AppIcon from './components/AppIcon.vue'
import UButton from './components/ui/UButton.vue'
import UCheckbox from './components/ui/UCheckbox.vue'
import UModal from './components/ui/UModal.vue'
import UPromptModal from './components/ui/UPromptModal.vue'
import { useAppMenu } from './composables/useAppMenu'
import { installTrackpadSwipe } from './composables/useTrackpadGesture'
import { useLibraryUI } from './composables/useLibraryUI'
import { useLibraryTabs, type LibraryLayout } from './stores/libraryTabs'
import { usePhotoActions } from './views/photos/composables/usePhotoActions'
import { usePhotoSelection } from './views/photos/composables/usePhotoSelection'
import { useDuplicateScan } from './views/photos/composables/useDuplicateScan'
import { useTheme } from './composables/useTheme'
import { useToast } from './composables/useToast'
import { usePhotoData } from './views/photos/composables/usePhotoData'
import { useDialogs } from './views/photos/composables/useDialogs'

// 代码审查：全局二次确认 / 输入弹窗（tags 等非 photos 路由也能调用 requestConfirm/requestPrompt）
const { pendingConfirm, confirmChecked, confirming, runConfirmed } = useDialogs()

type LoadingVariant =
  | 'default'
  | 'editor'
  | 'recorder-record'
  | 'recorder-history'
  | 'recorder-playback'
  | 'recorder-clip'
  | 'capture'

const route = useRoute()
const router = useRouter()

/**
 * 哪些路由不显示 AppShell（顶栏 + 侧边栏）：
 * - screenshotCapture：截图捕获层，沉浸式覆盖
 * - screenRecorderClip：录屏剪辑画布，沉浸式
 */
const HIDE_SHELL_ROUTES = new Set<string>(['screenshotCapture', 'screenRecorderClip'])

const showShell = computed(() => !HIDE_SHELL_ROUTES.has(String(route.name || '')))

/**
 * 十五轮 C14：选择/批量类菜单动作依赖 photos 视图挂载的弹层与选中态，
 * 在其它路由触发时先切回 /photos 再执行。
 */
function runInLibrary(fn: () => void): void {
  void (async () => {
    if (String(route.name || '') !== 'photos') await router.push('/photos')
    fn()
  })()
}

// 订阅主进程菜单 / dock / tray 跳转指令
let uninstallAppMenu: (() => void) | null = null
// 截图入库刷新订阅的取消函数
let unbindScreenshotImported: (() => void) | null = null
let uninstallTrackpad: (() => void) | null = null
let uninstallMenuAction: (() => void) | null = null
onMounted(() => {
  uninstallAppMenu = useAppMenu().install()

  // 截图入库联动：遮罩窗是独立渲染进程，主窗口监听入库事件刷新素材池
  unbindScreenshotImported = window.api.screenshot.onImported(() => {
    void usePhotoData().refreshAllPools()
  })

  // D-012 原生菜单动作（文件导入 / 查找 / 标签 / 显示）
  // 注意：这里不能在回调里调 useRouter()——IPC 回调执行时无组件实例，
  // inject 会返回 undefined（外层 setup 的 router 闭包捕获即可）
  uninstallMenuAction = window.api.onAppMenuAction((e) => {
    const { action } = e
    const ui = useLibraryUI()
    switch (action) {
      case 'import-folder':
        void usePhotoActions().handleImportFolder()
        break
      case 'import-files':
        void usePhotoActions().handleImportFiles()
        break
      case 'bookmark':
        // 弹窗宿主在 /photos 视图（审查 P2-23）：非 photos 路由下先切回，
        // 否则菜单无反应且 modalOpen 残留导致回跳后突然弹窗
        runInLibrary(() => {
          usePhotoActions().bookmarkModalOpen.value = true
        })
        break
      case 'new-smart':
        runInLibrary(() => usePhotoActions().openSmartAlbumModal(null))
        break
      case 'focus-search':
        document.getElementById('library-search')?.focus()
        break
      case 'synthesize-shortcut': {
        // 编辑菜单加速键（⌘C/⌘X/⌘A）在 macOS 会被原生菜单吞掉 renderer 的
        // keydown（electron#32477），主进程 native copy/cut 后要求这里合成
        // keydown，让 usePhotoKeyboard 的既有分支统一裁决。
        // 焦点在可编辑元素内时必须跳过：原生文本复制/剪切已由主进程
        // webContents.copy()/cut() 完成，合成事件若放行会把选中「文件」
        // 覆盖进剪贴板，破坏输入框内的复制语义
        const el = document.activeElement as HTMLElement | null
        const editable =
          !!el &&
          (el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.tagName === 'SELECT' ||
            el.isContentEditable)
        const { key, code, metaKey, ctrlKey } = e
        if (!key || !code || editable) break
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            code,
            metaKey: !!metaKey,
            ctrlKey: !!ctrlKey,
            cancelable: true
          })
        )
        break
      }
      case 'open-tags':
        void router.push('/tags')
        break
      case 'layout-next': {
        const tabs = useLibraryTabs()
        const order: LibraryLayout[] = ['grid', 'waterfall', 'list', 'auto']
        const cur = order.indexOf(tabs.active.layout)
        tabs.active.layout = order[(cur + 1) % order.length] as LibraryLayout
        tabs.persist()
        break
      }
      case 'toggle-filter':
        ui.toggleFilterBar()
        break
      case 'toggle-sidebar':
        ui.togglePanel()
        break
      // ── 十五轮 C14：原 ⋯更多菜单入口迁移（Eagle 工具栏无 ⋯）──
      case 'map': {
        // SmartAlbumModal/地图宿主在 /photos 视图（审查 P2-23）：先切回再设置
        runInLibrary(() => useLibraryTabs().setView('map', '地图'))
        break
      }
      case 'duplicates':
        runInLibrary(() => void useDuplicateScan().openDuplicateScan())
        break
      case 'selection-mode':
        runInLibrary(() => usePhotoSelection().toggleSelectionMode())
        break
      case 'batch-rename':
        runInLibrary(() => {
          usePhotoActions().batchRenameOpen.value = true
        })
        break
      case 'convert-webp':
        runInLibrary(() =>
          usePhotoActions().handleConvertToWebP([...usePhotoSelection().selectedIds.value])
        )
        break
      case 'export-selected':
        runInLibrary(
          () => void usePhotoActions().exportSelected([...usePhotoSelection().selectedIds.value])
        )
        break
      case 'remove-selected':
        runInLibrary(() =>
          usePhotoActions().handleDeleteIds([...usePhotoSelection().selectedIds.value])
        )
        break
      case 'remove-all':
        runInLibrary(() => usePhotoActions().handleRemoveAll())
        break
      case 'lock':
        runInLibrary(() => usePhotoActions().handleLockAction())
        break
      case 'toggle-theme': {
        const { theme, setTheme } = useTheme()
        void setTheme(theme.value === 'dark' ? 'light' : 'dark')
        break
      }
      // ── 十五轮批6：整理菜单（对选中批量评分/标签/归组，Eagle organize.* 语义）──
      case 'organize-folder-add':
        runInLibrary(() => usePhotoActions().openFolderModal())
        break
      case 'organize-tag-copy':
        runInLibrary(() => {
          const ids = [...usePhotoSelection().selectedIds.value]
          const first = usePhotoData().allPhotos.value.find((p) => ids.includes(p.id))
          if (!first || first.tags.length === 0) {
            useToast().warning('选中素材没有标签')
            return
          }
          void window.api.photos
            .copyText(first.tags.join(', '))
            .then(() => useToast().success('已复制标签'))
            .catch((err: unknown) =>
              useToast().error('复制失败', { description: (err as Error).message })
            )
        })
        break
      case 'organize-tag-clear':
        runInLibrary(() => {
          void (async () => {
            const data = usePhotoData()
            const ids = [...usePhotoSelection().selectedIds.value]
            const targets = data.allPhotos.value.filter((p) => ids.includes(p.id))
            if (targets.length === 0) {
              useToast().warning('请先选中素材')
              return
            }
            // 每标签一次批量 IPC（审查 P3-39）：旧实现逐张逐标签 N×M 次调用
            // 且成功 toast 先于实际完成弹出
            const allTags = new Set<string>()
            for (const p of targets) for (const t of p.tags) allTags.add(t)
            try {
              for (const tag of allTags) {
                await window.api.photos.removeTagFromMultiple(ids, tag)
              }
              await usePhotoData().loadPhotos()
              useToast().success(`已清除 ${targets.length} 项的全部标签`)
            } catch (err) {
              useToast().error('清除标签失败', { description: (err as Error).message })
            }
          })()
        })
        break
      default:
        // organize-rating-N / organize-tag-add / organize-tag-paste 需要输入或参数化
        if (action.startsWith('organize-rating-')) {
          const rating = Number(action.slice(-1))
          runInLibrary(() => {
            const ids = [...usePhotoSelection().selectedIds.value]
            if (ids.length === 0) {
              useToast().warning('请先选中素材')
              return
            }
            // 批量 API 一次完成（审查 P3-39）：逐张 N 次 IPC 换成 1 次
            void usePhotoActions()
              .handleBatchUpdate(ids, { rating })
              .then(() => useToast().success(`已为 ${ids.length} 项设置 ${rating} 星`))
              .catch((err: unknown) =>
                useToast().error('批量设置评分失败', { description: (err as Error).message })
              )
          })
        } else if (action === 'organize-tag-add' || action === 'organize-tag-paste') {
          runInLibrary(() => {
            const ids = [...usePhotoSelection().selectedIds.value]
            if (ids.length === 0) {
              useToast().warning('请先选中素材')
              return
            }
            const applyTags = async (raw: string): Promise<void> => {
              const tags = raw
                .split(/[\s,，、]+/)
                .map((t) => t.trim())
                .filter(Boolean)
              if (tags.length === 0) return
              for (const tag of tags) await usePhotoActions().addTagToMany(ids, tag)
              useToast().success(`已为 ${ids.length} 项添加 ${tags.length} 个标签`)
            }
            if (action === 'organize-tag-add') {
              useDialogs().requestPrompt({
                title: '添加标签',
                label: '标签名称（空格/逗号分隔多个）',
                initialValue: '',
                confirmLabel: '添加',
                onSubmit: (v) => applyTags(v)
              })
            } else {
              void window.api.photos
                .getClipboardText()
                .then((raw) => applyTags(raw))
                .catch((err: unknown) =>
                  useToast().error('读取剪贴板失败', { description: (err as Error).message })
                )
            }
          })
        }
        break
    }
  })

  // Trackpad 双指水平 swipe → 视图历史前进/后退
  // （代码审查 P1：旧实现走 window.history（路由），与工具栏 ‹ › 的
  //   libraryTabs 视图历史语义不一致——photos 内横滑会跳出路由）
  const tabs = useLibraryTabs()
  uninstallTrackpad = installTrackpadSwipe(
    window,
    () => {
      if (route.name === 'photos') tabs.back()
    },
    () => {
      if (route.name === 'photos') tabs.forward()
    }
  )
})
onBeforeUnmount(() => {
  unbindScreenshotImported?.()
  unbindScreenshotImported = null
  uninstallAppMenu?.()
  uninstallAppMenu = null
  uninstallMenuAction?.()
  uninstallMenuAction = null
  uninstallTrackpad?.()
  uninstallTrackpad = null
})

const loadingVariant = computed<LoadingVariant>(() => {
  const routeName = String(route.name || '')

  if (routeName === 'snippets') {
    return 'editor'
  }

  if (routeName === 'screenRecorderRecord') {
    return 'recorder-record'
  }

  if (routeName === 'screenRecorderHistory') {
    return 'recorder-history'
  }

  if (routeName === 'screenRecorderPlayback') {
    return 'recorder-playback'
  }

  if (routeName === 'screenRecorderClip') {
    return 'recorder-clip'
  }

  if (routeName === 'screenshot' || routeName === 'screenshotCapture') {
    return 'capture'
  }

  return 'default'
})

const loadingDelay = computed(() => {
  if (loadingVariant.value.startsWith('recorder') || loadingVariant.value === 'capture') {
    return 160
  }

  return 120
})
</script>

<template>
  <!-- 沉浸式路由：直接渲染（无壳子） -->
  <div v-if="!showShell" class="App-router h-screen overflow-auto">
    <router-view v-slot="{ Component }">
      <Suspense timeout="0">
        <component :is="Component" />
        <template #fallback>
          <RouteLoading :variant="loadingVariant" :delay="loadingDelay" />
        </template>
      </Suspense>
    </router-view>
  </div>

  <!-- 普通路由：AppShell 包裹（顶栏 + 侧边栏） -->
  <AppShell v-else>
    <router-view v-slot="{ Component }">
      <Suspense timeout="0">
        <component :is="Component" />
        <template #fallback>
          <RouteLoading :variant="loadingVariant" :delay="loadingDelay" />
        </template>
      </Suspense>
    </router-view>
  </AppShell>

  <!-- 全局危险操作二次确认（所有路由共享，替代原生 confirm） -->
  <!-- overlay-z 1050：必须浮在功能弹窗（插件中心/图片预览等 z-1000）之上，否则确认框被盖住 -->
  <UModal
    :model-value="pendingConfirm !== null"
    size="sm"
    :overlay-z="1050"
    @update:model-value="pendingConfirm = null"
  >
    <template #title>
      <span class="flex items-center gap-2 text-danger">
        <AppIcon icon="ic-modal-status-warning" />
        {{ pendingConfirm?.title }}
      </span>
    </template>
    <p class="whitespace-pre-line text-sm leading-relaxed text-fg-secondary">
      {{ pendingConfirm?.body }}
    </p>
    <UCheckbox
      v-if="pendingConfirm?.checkbox"
      v-model="confirmChecked"
      :label="pendingConfirm.checkbox.label"
      class="mt-3"
    />
    <template #footer>
      <UButton variant="ghost" :disabled="confirming" @click="pendingConfirm = null">取消</UButton>
      <UButton variant="danger" :loading="confirming" @click="runConfirmed">
        {{ pendingConfirm?.confirmLabel }}
      </UButton>
    </template>
  </UModal>

  <!-- 全局输入弹窗（重命名等） -->
  <UPromptModal />
</template>
