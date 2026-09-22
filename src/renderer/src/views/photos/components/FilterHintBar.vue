<script setup lang="ts">
/**
 * FilterHintBar · 筛选弹层底栏提示（二十六轮对齐 Eagle 实测）
 * Eagle 标签/文件夹/格式弹层底部：「选择 左键 ｜ 排除 右键 ｜ 关闭 ESC」。
 */
withDefaults(defineProps<{ esc?: boolean }>(), { esc: true })
</script>

<template>
  <div
    class="flex items-center gap-3 border-t border-line-subtle px-3 py-1.5 text-[10px] text-fg-muted"
  >
    <span>选择 <b class="font-medium text-fg-secondary">左键</b></span>
    <span>排除 <b class="font-medium text-fg-secondary">右键</b></span>
    <span v-if="esc" class="ml-auto">关闭 <b class="font-medium text-fg-secondary">ESC</b></span>
  </div>
</template>
