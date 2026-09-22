<script setup lang="ts">
/**
 * LibraryCommandPalette · 全局唯一命令面板（D-011 审查修复）
 *
 * 合并原 shell CommandPalette（⌘K 监听/聚焦模式）与原 photos 本地面板
 * （库内视图跳转/随机/新建命令）：AppShell 挂载，全路由可用。
 * 显隐状态走 useLibraryCommandPalette 单例（TitleBar 🔍 同源）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@components/AppIcon.vue'
import { useLibraryCommandPalette } from '../../composables/useLibraryCommandPalette'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'
import { usePhotoActions } from '@views/photos/composables/usePhotoActions'
import { useDuplicateScan } from '@views/photos/composables/useDuplicateScan'
import { useToast } from '@composables/useToast'
import { useRunInLibrary } from '@composables/useRunInLibrary'
import { isEscTop, popEscScope, pushEscScope } from '@renderer/utils/escStack'

const router = useRouter()
const palette = useLibraryCommandPalette()
const tabs = useLibraryTabs()
const actions = usePhotoActions()
const scan = useDuplicateScan()
const toast = useToast()
const runInLib = useRunInLibrary()
let escScope: symbol | null = null

const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const activeIdx = ref(0)

interface Cmd {
  id: string
  title: string
  hint?: string
  run: () => void
}

const commands = computed<Cmd[]>(() => {
  const list: Cmd[] = [
    { id: 'view-all', title: '跳转到：全部', run: () => goView('all', '全部') },
    { id: 'view-untagged', title: '跳转到：未加标签', run: () => goView('untagged', '未加标签') },
    { id: 'view-unsorted', title: '跳转到：未分类', run: () => goView('unsorted', '未分类') },
    { id: 'view-recent', title: '跳转到：最近添加', run: () => goView('recent', '最近添加') },
    { id: 'view-recents', title: '跳转到：最近查看', run: () => goView('recents', '最近查看') },
    { id: 'view-favorites', title: '跳转到：收藏', run: () => goView('favorites', '收藏') },
    { id: 'view-map', title: '跳转到：地图', run: () => goView('map', '地图') },
    { id: 'view-trash', title: '跳转到：回收站', run: () => goView('trash', '回收站') },
    {
      id: 'toggle-shuffle',
      title: '切换：随机模式',
      run: () => {
        const t = tabs.active
        t.shuffle = !t.shuffle
        tabs.persist()
        toast.info(t.shuffle ? '已开启随机模式' : '已关闭随机模式')
      }
    },
    {
      id: 'new-album',
      title: '新建：相册',
      hint: '弹窗',
      run: () => runInLib(() => actions.openAlbumModal())
    },
    {
      id: 'new-folder',
      title: '新建：文件夹',
      hint: '弹窗',
      run: () => runInLib(() => actions.openFolderModal())
    },
    {
      id: 'new-smart',
      title: '新建：智能文件夹',
      hint: '弹窗',
      run: () => runInLib(() => actions.openSmartAlbumModal(null))
    },
    {
      id: 'new-bookmark',
      title: '新建：书签',
      hint: '弹窗',
      run: () => runInLib(() => (actions.bookmarkModalOpen.value = true))
    },
    { id: 'duplicates', title: '工具：相似查重', run: () => void scan.openDuplicateScan() },
    {
      id: 'open-actions',
      title: '打开：素材动作',
      hint: '弹窗',
      run: () => window.dispatchEvent(new CustomEvent('leaf:open-actions'))
    },
    { id: 'go-stats', title: '打开：统计面板', run: () => router.push('/stats') },
    { id: 'go-settings', title: '打开：设置', run: () => router.push('/settings') },
    { id: 'go-about', title: '打开：关于', run: () => router.push('/about') }
  ]
  const q = query.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((c) => c.title.toLowerCase().includes(q))
})

/** 命令执行统一先回图库（视图/新建类命令的模态都挂在 photos 视图） */
function goView(view: string, title: string): void {
  tabs.setView(view, title)
  if (router.currentRoute.value.path !== '/photos') {
    router.push('/photos').catch(() => {})
  }
}

const filtered = computed<Cmd[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return commands.value
  return commands.value.filter((c) => c.title.toLowerCase().includes(q))
})

watch(filtered, () => {
  activeIdx.value = 0
})

function exec(cmd: Cmd): void {
  palette.close()
  query.value = ''
  cmd.run()
}

const onKeyDown = (e: KeyboardEvent): void => {
  // ⌘K / Ctrl+K 唤起（全路由可用）
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K') && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    palette.toggle()
    return
  }

  if (!palette.isOpen.value) return
  if (e.key === 'Escape') {
    // 层级裁决（审查 P2-34）：模态叠加在面板之上时 Esc 先关模态
    if (escScope && isEscTop(escScope)) {
      e.preventDefault()
      palette.close()
    }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, filtered.value.length - 1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const cmd = filtered.value[activeIdx.value]
    if (cmd) exec(cmd)
  }
}

watch(
  () => palette.isOpen.value,
  async (open) => {
    if (open) {
      escScope = pushEscScope()
      query.value = ''
      activeIdx.value = 0
      await nextTick()
      inputRef.value?.focus()
    } else if (escScope) {
      popEscScope(escScope)
      escScope = null
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  // 卸载时若面板仍开着，出栈防止 Esc 栈泄漏（审查 P2-34）
  if (escScope) {
    popEscScope(escScope)
    escScope = null
  }
})
</script>

<template>
  <teleport to="body">
    <div
      v-if="palette.isOpen.value"
      class="fixed inset-0 z-[1200] flex items-start justify-center bg-overlay pt-[14vh] backdrop-blur-[2px]"
      @click.self="palette.close()"
    >
      <div
        class="w-[min(600px,92vw)] overflow-hidden rounded-lg border border-line-default bg-surface-3 shadow-lg"
      >
        <div class="flex items-center gap-2 border-b border-line-subtle px-3 py-2.5">
          <AppIcon icon="ic_search" :size="16" class="text-fg-muted" />
          <input
            ref="inputRef"
            v-model="query"
            placeholder="搜索命令、跳转视图…"
            class="flex-1 bg-transparent text-sm text-fg-primary outline-none placeholder:text-fg-muted"
          />
          <kbd class="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-fg-muted">ESC</kbd>
        </div>
        <ul class="max-h-[50vh] overflow-y-auto py-1">
          <li v-if="filtered.length === 0" class="px-4 py-6 text-center text-xs text-fg-muted">
            没有匹配的命令
          </li>
          <li v-for="(cmd, idx) in filtered" :key="cmd.id">
            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors duration-instant"
              :class="
                idx === activeIdx
                  ? 'bg-brand-500/12 text-fg-brand'
                  : 'text-fg-primary hover:bg-surface-hover'
              "
              @mouseenter="activeIdx = idx"
              @click="exec(cmd)"
            >
              <span class="min-w-0 flex-1 truncate">{{ cmd.title }}</span>
              <span v-if="cmd.hint" class="shrink-0 text-[10px] text-fg-muted">{{ cmd.hint }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </teleport>
</template>
