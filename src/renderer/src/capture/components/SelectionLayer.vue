    class="absolute inset-0 cursor-crosshair"
    @mousedown="onPointerDown"
    @mousemove="onPointerMove"
    @mouseup="onPointerUp"
    @dblclick="hasRegion && emit('confirm', { ...rect })"
    @contextmenu.prevent="emit('cancel', 'rightclick')"
  >
    <!-- 未拖出选区时整屏压暗 + 提示条（明确告知截图模式已开启） -->
    <div v-if="!hasRegion" class="pointer-events-none absolute inset-0 bg-black/45" />
    <div
      v-if="!hasRegion"
      class="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-4 py-2 text-xs text-white/90"
    >
      拖拽框选区域 · F 全屏 · D 上次区域 · 数字键锁比例 · Esc 取消
    </div>
    <div v-if="hasRegion" class="pointer-events-none absolute inset-0">
      <!-- 遮罩挖孔：四块暗幕 -->
      <div class="absolute left-0 top-0 w-full bg-black/45" :style="{ height: `${rect.y}px` }" />
      <div
        class="absolute left-0 bg-black/45"
