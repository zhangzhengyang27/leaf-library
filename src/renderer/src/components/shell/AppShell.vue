<script setup lang="ts">
import LibraryCommandPalette from './LibraryCommandPalette.vue'
import UToastProvider from '../ui/UToastProvider.vue'
import { useModuleShortcuts } from '../../composables/useModuleShortcuts'
import { useTheme } from '../../composables/useTheme'

useModuleShortcuts()
useTheme().initTheme()
</script>

<template>
  <div class="LeafAppShell h-screen flex flex-col bg-surface-0">
    <!-- app-scroll：router scrollBehavior 统一复位/恢复滚动的标记类（BUGS.md B3） -->
    <main class="app-scroll min-h-0 flex-1 overflow-auto">
      <slot />
    </main>
    <!-- 命令面板（⌘K，全局唯一，含库内命令）-->
    <LibraryCommandPalette />
    <!-- 全局 Toast 容器 -->
    <UToastProvider />
  </div>
</template>
