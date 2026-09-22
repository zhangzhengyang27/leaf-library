<script setup lang="ts">
/**
 * CardMeta · 卡片常驻元信息（文件名 + 单行简介 + 就地重命名输入框）
 * 从 PhotoGrid 拆出：三种布局分支共用，避免模板三份拷贝。
 */
defineProps<{
  selected: boolean
  showName: boolean
  showSummary: boolean
  renaming: boolean
  renameValue: string
  name: string
  summary: string
}>()

defineEmits<{
  'update:renameValue': [v: string]
  'rename-commit': []
  'rename-cancel': []
}>()
</script>

<template>
  <div v-if="showName || showSummary" class="mt-[7px] px-0.5 text-center">
    <div
      v-if="showName"
      class="line-clamp-2 break-words text-[13px] font-normal leading-[16px]"
      :class="selected ? '' : 'text-fg-primary'"
    >
      <input
        v-if="renaming"
        :value="renameValue"
        data-rename-input
        type="text"
        class="w-full rounded-sm border border-brand-400 bg-surface-1 px-1 text-center text-[12px] leading-[14px] text-fg-primary focus:outline-none focus:border-brand-500"
        aria-label="重命名"
        @click.stop
        @input="$emit('update:renameValue', ($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="$emit('rename-commit')"
        @keydown.esc.prevent="$emit('rename-cancel')"
        @blur="$emit('rename-commit')"
      />
      <template v-else>
        <!-- 二十一轮对齐 Eagle：整名（含扩展名）单色；选中=蓝底白字条 -->
        <span
          class="rounded-[4px]"
          :class="selected ? 'bg-brand-500 px-1 py-px text-white' : 'text-fg-primary'"
          >{{ name }}</span
        >
      </template>
    </div>
    <div
      v-if="showSummary"
      class="h-5 truncate pt-[5px] pb-0.5 text-[11px] leading-[13px] text-fg-muted"
    >
      {{ summary }}
    </div>
  </div>
</template>
