<script setup lang="ts">
/**
 * ActionsModal · 素材动作宏弹层（十五轮批5，Eagle ✦ 动作系统的 Leaf 自研 MVP）
 *
 * - 列表：动作名 + 步骤摘要；空态显示「建立动作」引导（对齐 Eagle 空态）
 * - 新建：名称 + 步骤编辑（添加步骤行：类型 + 参数）
 * - 运行：对当前选中素材按序执行
 */
import { computed, ref } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UModal from '@components/ui/UModal.vue'
import UButton from '@components/ui/UButton.vue'
import { useAssetMacros, type AssetMacro, type MacroStep } from '@composables/useAssetMacros'
import { usePhotoData } from '@views/photos/composables/usePhotoData'
import { usePhotoSelection } from '@views/photos/composables/usePhotoSelection'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const { macros, save, remove, runMacro } = useAssetMacros()
const data = usePhotoData()
const selection = usePhotoSelection()

const close = (): void => emit('update:modelValue', false)

// ── 新建/编辑表单 ──
const editing = ref<AssetMacro | null>(null)
const nameDraft = ref('')
const stepsDraft = ref<MacroStep[]>([])
const STEP_LABELS: Record<MacroStep['type'], string> = {
  rename: '重命名',
  addTags: '添加标签',
  rating: '评分',
  description: '备注',
  webp: '转换为 WebP',
  moveToFolder: '移入文件夹'
}

function startCreate(): void {
  editing.value = { id: `m-${Date.now()}`, name: '', steps: [] }
  nameDraft.value = ''
  stepsDraft.value = []
}
function startEdit(m: AssetMacro): void {
  editing.value = { id: m.id, name: m.name, steps: JSON.parse(JSON.stringify(m.steps)) }
  nameDraft.value = m.name
  stepsDraft.value = JSON.parse(JSON.stringify(m.steps))
}
function addStep(type: MacroStep['type']): void {
  const defaults: Record<MacroStep['type'], MacroStep> = {
    rename: { type: 'rename', pattern: '素材-{n}' },
    addTags: { type: 'addTags', tags: '' },
    rating: { type: 'rating', value: 5 },
    description: { type: 'description', text: '' },
    webp: { type: 'webp' },
    moveToFolder: { type: 'moveToFolder', folderId: data.folders.value[0]?.id ?? '' }
  }
  stepsDraft.value.push(defaults[type])
}
function stepSummary(s: MacroStep): string {
  switch (s.type) {
    case 'rename':
      return `重命名为「${s.pattern}」`
    case 'addTags':
      return `添加标签 ${s.tags || '（空）'}`
    case 'rating':
      return `评分 ${s.value} ★`
    case 'description':
      return `备注「${s.text || '（空）'}」`
    case 'webp':
      return '转换为 WebP'
    case 'moveToFolder': {
      const f = data.folders.value.find((x) => x.id === s.folderId)
      return `移入「${f?.name ?? '未知文件夹'}」`
    }
  }
}

function saveDraft(): void {
  if (!editing.value) return
  const name = nameDraft.value.trim()
  if (!name || stepsDraft.value.length === 0) return
  save({ id: editing.value.id, name, steps: stepsDraft.value })
  editing.value = null
}

const selectedIds = computed(() => selection.selectedIds.value)

async function run(m: AssetMacro): Promise<void> {
  const ok = await runMacro(m, [...selectedIds.value])
  if (ok) close()
}
</script>

<template>
  <UModal :model-value="modelValue" title="素材动作" size="md" @update:model-value="close">
    <!-- 编辑态 -->
    <template v-if="editing">
      <div class="space-y-3">
        <input
          v-model="nameDraft"
          type="text"
          placeholder="动作名称"
          class="h-8 w-full rounded-md border border-line-default bg-surface-0 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
        />
        <div class="space-y-1.5">
          <p class="text-[11px] font-medium text-fg-secondary">步骤（按序执行）</p>
          <div
            v-for="(s, i) in stepsDraft"
            :key="i"
            class="flex items-center gap-1.5 rounded-md border border-line-default bg-surface-0 p-1.5"
          >
            <span class="w-28 shrink-0 text-[11px] text-fg-secondary">{{
              STEP_LABELS[s.type]
            }}</span>
            <input
              v-if="s.type === 'rename'"
              v-model="s.pattern"
              type="text"
              placeholder="模式，{n} 为序号"
              class="h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1.5 text-[11px] text-fg-primary focus:outline-none"
            />
            <input
              v-else-if="s.type === 'addTags'"
              v-model="s.tags"
              type="text"
              placeholder="标签，逗号分隔"
              class="h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1.5 text-[11px] text-fg-primary focus:outline-none"
            />
            <input
              v-else-if="s.type === 'description'"
              v-model="s.text"
              type="text"
              placeholder="备注文本"
              class="h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1.5 text-[11px] text-fg-primary focus:outline-none"
            />
            <select
              v-else-if="s.type === 'rating'"
              v-model.number="s.value"
              class="h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1 text-[11px] text-fg-primary focus:outline-none"
            >
              <option v-for="r in 5" :key="r" :value="r">{{ r }} 星</option>
            </select>
            <select
              v-else-if="s.type === 'moveToFolder'"
              v-model="s.folderId"
              class="h-6 flex-1 rounded-sm border border-line-default bg-surface-1 px-1 text-[11px] text-fg-primary focus:outline-none"
            >
              <option v-for="f in data.folders.value" :key="f.id" :value="f.id">
                {{ f.name }}
              </option>
            </select>
            <span v-else class="flex-1 text-[11px] text-fg-muted">无需参数</span>
            <button
              type="button"
              class="shrink-0 text-fg-muted hover:text-danger"
              @click="stepsDraft.splice(i, 1)"
            >
              <AppIcon icon="ic-modal-close" :size="12" />
            </button>
          </div>
          <select
            class="h-7 w-full rounded-md border border-line-default bg-surface-0 px-1.5 text-[11px] text-fg-secondary focus:outline-none"
            value=""
            @change="
              addStep(($event.target as HTMLSelectElement).value as MacroStep['type'])
              ;($event.target as HTMLSelectElement).value = ''
            "
          >
            <option value="" disabled>+ 添加步骤…</option>
            <option v-for="(label, t) in STEP_LABELS" :key="t" :value="t">{{ label }}</option>
          </select>
        </div>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="editing = null">取消</UButton>
          <UButton :disabled="!nameDraft.trim() || stepsDraft.length === 0" @click="saveDraft">
            保存动作
          </UButton>
        </div>
      </div>
    </template>

    <!-- 列表态 -->
    <template v-else>
      <div v-if="macros.length === 0" class="flex flex-col items-center gap-2 py-6 text-center">
        <span class="text-3xl">✦</span>
        <p class="text-sm font-medium text-fg-primary">建立动作</p>
        <p class="max-w-[16rem] text-[11px] text-fg-tertiary">
          把常用的整理流程（重命名、打标签、评分、转格式、归组）串成动作，对选中素材一键执行。
        </p>
        <UButton class="mt-1" @click="startCreate">建立动作</UButton>
      </div>
      <div v-else class="space-y-1.5">
        <div
          v-for="m in macros"
          :key="m.id"
          class="group flex items-center gap-2 rounded-md border border-line-default bg-surface-0 p-2"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-fg-primary">{{ m.name }}</p>
            <p class="truncate text-[10px] text-fg-tertiary">
              {{ m.steps.map(stepSummary).join(' → ') }}
            </p>
          </div>
          <UButton size="sm" :disabled="selectedIds.length === 0" @click="run(m)">
            运行{{ selectedIds.length ? `(${selectedIds.length})` : '' }}
          </UButton>
          <button
            type="button"
            class="shrink-0 text-fg-muted opacity-0 transition-opacity hover:text-fg-primary group-hover:opacity-100"
            title="编辑"
            @click="startEdit(m)"
          >
            <AppIcon icon="context-menu/ic-rename" :size="13" />
          </button>
          <button
            type="button"
            class="shrink-0 text-fg-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
            title="删除"
            @click="remove(m.id)"
          >
            <AppIcon icon="context-menu/ic-file-delete-permanently" :size="13" />
          </button>
        </div>
        <UButton variant="ghost" class="w-full" @click="startCreate">+ 新建动作</UButton>
      </div>
      <p class="mt-2 text-[10px] text-fg-tertiary">
        运行对象 = 当前选中的 {{ selectedIds.length }} 项素材；步骤按序执行，失败即中断。
      </p>
    </template>
  </UModal>
</template>
