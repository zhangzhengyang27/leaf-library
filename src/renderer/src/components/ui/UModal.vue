<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isEscTop, popEscScope, pushEscScope } from '@renderer/utils/escStack'

/**
 * UModal · 模态弹窗
 * - Teleport 到 body，遮罩 + 居中面板
 * - ESC 关闭（escStack 层级裁决，多层叠加一次只关一层）、遮罩点击关闭（closeOnOverlay）
 * - 打开时记录焦点、关闭后归还；Tab 循环限制在面板内（焦点陷阱）
 * - v-model 控制显隐，带 Raycast 式缩放入场动画
 */
interface Props {
  modelValue: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg'
  /** 点击遮罩是否关闭 */
  closeOnOverlay?: boolean
  /** ESC 是否关闭 */
  closeOnEsc?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  size: 'md',
  closeOnOverlay: true,
  closeOnEsc: true
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const panelRef = ref<HTMLElement | null>(null)
let escScope: symbol | null = null
let lastFocused: Element | null = null

const close = (): void => {
  emit('update:modelValue', false)
}

const onOverlayClick = (): void => {
  if (props.closeOnOverlay) close()
}

const onKeydown = (e: KeyboardEvent): void => {
  if (!props.modelValue) return
  if (e.key === 'Escape') {
    // 层级裁决（审查 P2-34）：只有栈顶浮层响应 Esc
    if (props.closeOnEsc && escScope && isEscTop(escScope)) {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    return
  }
  // 焦点陷阱（审查 P3-65）：Tab 循环限制在面板内
  if (e.key === 'Tab' && panelRef.value) {
    const focusables = panelRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !panelRef.value.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  if (escScope) popEscScope(escScope)
  escScope = null
})

// 打开时聚焦面板、关闭时归还焦点（审查 P3-65）
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      lastFocused = document.activeElement
      if (!escScope) escScope = pushEscScope()
      requestAnimationFrame(() => {
        const panel = panelRef.value
        if (!panel) return
        // 面板内部已经拿到焦点（如 UPromptModal 自动聚焦的输入框）时不再抢过去，
        // 否则输入框失焦、Enter 提交与打字全部失效
        if (!panel.contains(document.activeElement)) panel.focus()
      })
    } else {
      if (escScope) popEscScope(escScope)
      escScope = null
      void nextTick(() => {
        if (lastFocused instanceof HTMLElement && document.contains(lastFocused)) {
          lastFocused.focus()
        }
        lastFocused = null
      })
    }
  }
)

const sizeCls: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="umodal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[1000] flex items-center justify-center p-6"
        @click.self="onOverlayClick"
      >
        <div class="absolute inset-0 bg-overlay backdrop-blur-[2px]" aria-hidden="true" />
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          class="relative w-full overflow-hidden rounded-lg border border-line-default bg-surface-3 shadow-lg focus:outline-none"
          :class="sizeCls[size]"
        >
          <!-- 顶部 1px 内高光 -->
          <div
            class="pointer-events-none absolute inset-x-0 top-0 h-px bg-glass-highlight"
            aria-hidden="true"
          />
          <header v-if="title || $slots.title" class="flex items-center px-5 pt-4">
            <slot name="title">
              <h3 class="text-sm font-semibold text-fg-primary">{{ title }}</h3>
            </slot>
            <button
              type="button"
              class="ml-auto flex size-7 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-primary"
              aria-label="关闭"
              @click="close"
            >
              <svg
                class="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" />
              </svg>
            </button>
          </header>
          <div class="px-5 py-4">
            <slot />
          </div>
          <footer
            v-if="$slots.footer"
            class="flex justify-end gap-2 border-t border-line-subtle px-5 py-3.5"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.umodal-enter-active,
.umodal-leave-active {
  transition: opacity var(--motion-normal);
}
.umodal-enter-active > div:last-child,
.umodal-leave-active > div:last-child {
  transition:
    transform var(--motion-spring),
    opacity var(--motion-normal);
}
.umodal-enter-from,
.umodal-leave-to {
  opacity: 0;
}
.umodal-enter-from > div:last-child,
.umodal-leave-to > div:last-child {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}
</style>
