<script setup lang="ts">
import { computed } from 'vue'

/**
 * UTooltip · 轻量气泡提示（hover 显示，纯 CSS 过渡）
 * - position: top / bottom / left / right
 */
interface Props {
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  position: 'top',
  disabled: false
})

const wrapCls = computed(() => `u-tip-${props.position}`)
</script>

<template>
  <span class="u-tip inline-flex" :class="wrapCls">
    <slot />
    <span v-if="!disabled" role="tooltip" class="u-tip-bubble">
      {{ content }}
    </span>
  </span>
</template>

<style scoped>
.u-tip {
  position: relative;
}
.u-tip-bubble {
  position: absolute;
  z-index: var(--z-dropdown);
  pointer-events: none;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--surface-3);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
  box-shadow: var(--shadow-md);
  opacity: 0;
  transition:
    opacity var(--motion-fast) ease-out,
    transform var(--motion-fast) ease-out;
}
/* 各方向定位与位移 */
.u-tip-top .u-tip-bubble {
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translate(-50%, 2px);
}
.u-tip-bottom .u-tip-bubble {
  top: calc(100% + 6px);
  left: 50%;
  transform: translate(-50%, -2px);
}
.u-tip-left .u-tip-bubble {
  right: calc(100% + 6px);
  top: 50%;
  transform: translate(2px, -50%);
}
.u-tip-right .u-tip-bubble {
  left: calc(100% + 6px);
  top: 50%;
  transform: translate(-2px, -50%);
}
/* hover 展开 */
.u-tip-top:hover .u-tip-bubble {
  opacity: 1;
  transform: translate(-50%, 0);
}
.u-tip-bottom:hover .u-tip-bubble {
  opacity: 1;
  transform: translate(-50%, 0);
}
.u-tip-left:hover .u-tip-bubble {
  opacity: 1;
  transform: translate(0, -50%);
}
.u-tip-right:hover .u-tip-bubble {
  opacity: 1;
  transform: translate(0, -50%);
}
</style>
