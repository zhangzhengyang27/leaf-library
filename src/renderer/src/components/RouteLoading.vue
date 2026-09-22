<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type LoadingVariant =
  | 'default'
  | 'editor'
  | 'recorder-record'
  | 'recorder-history'
  | 'recorder-playback'
  | 'recorder-clip'
  | 'capture'

interface Props {
  variant?: LoadingVariant
  delay?: number
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  delay: 140
})

const visible = ref(props.delay === 0)
let timer: ReturnType<typeof setTimeout> | undefined

const variantClass = computed(() => {
  return `route-loading--${props.variant}`
})

onMounted(() => {
  if (props.delay <= 0) {
    visible.value = true
    return
  }

  timer = setTimeout(() => {
    visible.value = true
  }, props.delay)
})

onBeforeUnmount(() => {
  if (timer) {
    clearTimeout(timer)
  }
})
</script>

<template>
  <div
    v-if="visible"
    class="route-loading"
    :class="variantClass"
    role="status"
    aria-live="polite"
    aria-label="页面加载中"
  >
    <div class="route-loading__shell">
      <div class="route-loading__header skeleton" />

      <div
        v-if="variant === 'recorder-record'"
        class="route-loading__content route-loading__content--capture-board"
      >
        <div class="route-loading__column">
          <div class="skeleton h-12" />
          <div class="skeleton h-80" />
        </div>
        <div class="route-loading__column">
          <div class="skeleton h-12" />
          <div class="skeleton h-16" />
          <div class="skeleton h-16" />
          <div class="skeleton h-24" />
        </div>
      </div>

      <div
        v-else-if="variant === 'recorder-history'"
        class="route-loading__content route-loading__content--single"
      >
        <div class="route-loading__column">
          <div class="skeleton h-12" />
          <div class="route-loading__list">
            <div class="skeleton h-14" />
            <div class="skeleton h-14" />
            <div class="skeleton h-14" />
            <div class="skeleton h-14" />
            <div class="skeleton h-14" />
          </div>
        </div>
      </div>

      <div
        v-else-if="variant === 'recorder-playback'"
        class="route-loading__content route-loading__content--single"
      >
        <div class="route-loading__column">
          <div class="skeleton h-72" />
          <div class="skeleton h-20" />
          <div class="route-loading__grid route-loading__grid--wide">
            <div class="skeleton h-20" />
            <div class="skeleton h-20" />
            <div class="skeleton h-20" />
            <div class="skeleton h-20" />
          </div>
        </div>
      </div>

      <div
        v-else-if="variant === 'recorder-clip'"
        class="route-loading__content route-loading__content--capture-board"
      >
        <div class="route-loading__column">
          <div class="skeleton h-12" />
          <div class="skeleton h-64" />
          <div class="skeleton h-24" />
        </div>
        <div class="route-loading__column">
          <div class="skeleton h-12" />
          <div class="skeleton h-16" />
          <div class="skeleton h-16" />
          <div class="skeleton h-16" />
        </div>
      </div>

      <div
        v-else-if="variant === 'editor'"
        class="route-loading__content route-loading__content--editor"
      >
        <div class="route-loading__column">
          <div class="skeleton h-12" />
          <div class="skeleton h-9" />
          <div class="skeleton h-9" />
          <div class="skeleton h-9" />
          <div class="skeleton h-9" />
        </div>
        <div class="route-loading__column">
          <div class="skeleton h-12" />
          <div class="skeleton h-72" />
        </div>
        <div class="route-loading__column">
          <div class="skeleton h-12" />
          <div class="skeleton h-72" />
        </div>
      </div>

      <div
        v-else-if="variant === 'capture'"
        class="route-loading__content route-loading__content--single"
      >
        <div class="route-loading__column">
          <div class="skeleton h-12" />
          <div class="skeleton h-64" />
          <div class="route-loading__grid route-loading__grid--wide">
            <div class="skeleton h-20" />
            <div class="skeleton h-20" />
            <div class="skeleton h-20" />
            <div class="skeleton h-20" />
          </div>
        </div>
      </div>

      <div v-else class="route-loading__content">
        <div class="route-loading__sidebar">
          <div class="skeleton h-12" />
          <div class="skeleton h-9" />
          <div class="skeleton h-9" />
          <div class="skeleton h-9" />
        </div>
        <div class="route-loading__main">
          <div class="skeleton h-12" />
          <div class="skeleton h-48" />
          <div class="route-loading__grid">
            <div class="skeleton h-24" />
            <div class="skeleton h-24" />
            <div class="skeleton h-24" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.route-loading {
  --route-loading-bg-start: var(--app-route-loading-bg-start, #f7f8fb);
  --route-loading-bg-end: var(--app-route-loading-bg-end, #f2f4f8);
  --route-loading-skeleton-a: var(--app-route-loading-skeleton-a, #e6e9f0);
  --route-loading-skeleton-b: var(--app-route-loading-skeleton-b, #f6f8fc);
  --route-loading-skeleton-c: var(--app-route-loading-skeleton-c, #e6e9f0);
  min-height: 100%;
  padding: 20px;
  background: linear-gradient(
    180deg,
    var(--route-loading-bg-start) 0%,
    var(--route-loading-bg-end) 100%
  );
}

/* 各路由形态的骨架色统一由 tokens.css 的 --app-route-loading-* 提供（亮/暗成对） */

.route-loading__shell {
  max-width: 1400px;
  margin: 0 auto;
}

.route-loading__header {
  height: 56px;
  margin-bottom: 16px;
  border-radius: 12px;
}

.route-loading__content {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
}

.route-loading__content--single {
  grid-template-columns: 1fr;
}

.route-loading__content--editor {
  grid-template-columns: 220px 320px 1fr;
}

.route-loading__content--capture-board {
  grid-template-columns: 1fr 320px;
}

.route-loading__sidebar,
.route-loading__main,
.route-loading__column {
  display: grid;
  gap: 12px;
  align-content: start;
}

.route-loading__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.route-loading__grid--wide {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.route-loading__list {
  display: grid;
  gap: 10px;
}

.skeleton {
  border-radius: 10px;
  background: linear-gradient(
    90deg,
    var(--route-loading-skeleton-a) 0%,
    var(--route-loading-skeleton-b) 50%,
    var(--route-loading-skeleton-c) 100%
  );
  background-size: 220% 100%;
  animation: skeleton-wave 1.2s ease-in-out infinite;
}

.h-9 {
  height: 36px;
}

.h-10 {
  height: 40px;
}

.h-12 {
  height: 48px;
}

.h-14 {
  height: 56px;
}

.h-16 {
  height: 64px;
}

.h-20 {
  height: 80px;
}

.h-24 {
  height: 96px;
}

.h-48 {
  height: 192px;
}

.h-56 {
  height: 224px;
}

.h-64 {
  height: 256px;
}

.h-72 {
  height: 288px;
}

.h-80 {
  height: 320px;
}

@media (max-width: 900px) {
  .route-loading {
    padding: 12px;
  }

  .route-loading__content,
  .route-loading__content--editor,
  .route-loading__content--capture-board {
    grid-template-columns: 1fr;
  }

  .route-loading__grid,
  .route-loading__grid--wide {
    grid-template-columns: 1fr;
  }
}

@keyframes skeleton-wave {
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: -100% 0;
  }
}
</style>
