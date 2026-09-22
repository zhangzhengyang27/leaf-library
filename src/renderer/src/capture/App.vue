<script setup lang="ts">
import { computed } from 'vue'
import PinWindow from './components/PinWindow.vue'
import { parsePinHash } from './core/session'

// capture 入口现在只承载贴图小窗（截图交互由 electron-screenshots 编辑器提供）
const pinId = computed(() => parsePinHash(window.location.hash))
</script>

<template>
  <PinWindow v-if="pinId" :payload-id="pinId" />
</template>
