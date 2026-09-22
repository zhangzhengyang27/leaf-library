<script setup lang="ts">
/**
 * OptionRow · 弹层选项行（DimensionChip 面板内使用；二十六轮对齐 Eagle 实测）
 *
 * 三态（Eagle 弹层行内复选框语义）：
 * - off      空方框
 * - include  brand 勾选框（左键切换）
 * - exclude  红色减号框 + 名称划线（右键切换，Eagle「排除 右键」）
 * 单选面板（excludable=false）保留圆点形态；count 为右侧实时计数。
 */
import AppIcon from '@components/AppIcon.vue'

withDefaults(
  defineProps<{
    label: string
    /** 行状态：off=未选 / include=包含 / exclude=排除（单选面板传 selected 替代） */
    state?: 'off' | 'include' | 'exclude'
    /** 单选形态（圆点，选中高亮；兼容旧用法） */
    selected?: boolean
    /** 多选模式（勾选框，选中不收起） */
    multiselect?: boolean
    /** 支持右键排除（默认随 multiselect） */
    excludable?: boolean
    disabled?: boolean
    /** 右侧实时计数（Eagle 弹层形态） */
    count?: number
  }>(),
  {
    state: 'off',
    selected: false,
    multiselect: false,
    excludable: undefined,
    disabled: false,
    count: undefined
  }
)

const emit = defineEmits<{ pick: []; exclude: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[11px] transition-colors duration-fast"
    :class="disabled ? 'text-fg-muted' : 'text-fg-primary hover:bg-surface-hover'"
    :disabled="disabled"
    @click="emit('pick')"
    @contextmenu.prevent="multiselect && (excludable ?? true) && emit('exclude')"
  >
    <!-- 多选三态 -->
    <template v-if="multiselect">
      <AppIcon
        v-if="state === 'include'"
        icon="context-menu/ic-context-menu-checkbox"
        :size="13"
        class="text-brand-500"
      />
      <AppIcon
        v-else-if="state === 'exclude'"
        icon="ic-condition-remove"
        :size="13"
        class="text-danger"
      />
      <span v-else class="leaf-checkbox" />
    </template>
    <!-- 单选圆点 -->
    <template v-else>
      <span v-if="selected" class="leaf-radio-checked" />
      <span v-else class="leaf-radio" />
    </template>
    <span
      class="min-w-0 flex-1 truncate"
      :class="state === 'exclude' ? 'text-fg-muted line-through' : ''"
    >
      {{ label }}
    </span>
    <span v-if="count !== undefined" class="shrink-0 text-[11px] tabular-nums text-fg-muted">
      {{ count }}
    </span>
  </button>
</template>
