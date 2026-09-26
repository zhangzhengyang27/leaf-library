<template>
  <UModal :model-value="true" size="md" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <AppIcon icon="context-menu/ic-rename" />
        批量重命名（{{ photos.length }} 项）
      </span>
    </template>

    <div class="space-y-3">
      <div>
        <label class="mb-1 block text-xs text-fg-muted">
          命名模式（任意组合字面文本与变量，扩展名自动保留）
        </label>
        <input
          ref="patternInput"
          v-model="pattern"
          type="text"
          placeholder="例如：旅行-{date}-{n}"
          class="w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
        />
        <!-- F2（Eagle 一键带入命名规则）：token 面板，点击插入光标处 -->
        <div class="mt-1.5 flex flex-wrap items-center gap-1">
          <button
            v-for="t in TOKENS"
            :key="t.token"
            type="button"
            class="rounded border border-line-subtle bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-fg-secondary transition-colors hover:border-brand-400 hover:text-brand-600"
            :title="t.hint"
            @click="insertToken(t.token)"
          >
            {{ t.token }}
          </button>
        </div>
      </div>

      <!-- P1：正则替换与大小写四态（Eagle 的「替换」+ 大小写档）。
           顺序固定为 token → 替换 → 大小写，界面上也按这个顺序排 -->
      <div class="mt-2">
        <label class="mb-1 block text-xs text-fg-muted"
          >正则替换（作用于展开后的名字，支持 $1 捕获组）</label
        >
        <div class="flex items-center gap-2">
          <input
            v-model="findPattern"
            type="text"
            placeholder="查找，如 ^IMG_"
            class="h-8 min-w-0 flex-1 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
            :class="findError ? 'border-danger' : ''"
          />
          <span class="text-[11px] text-fg-tertiary">→</span>
          <input
            v-model="findReplacement"
            type="text"
            placeholder="替换为，留空即删除"
            class="h-8 min-w-0 flex-1 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
          />
        </div>
        <p v-if="findError" class="mt-1 text-[11px] text-danger">正则不合法：{{ findError }}</p>
      </div>

      <div class="mt-2">
        <label class="mb-1 block text-xs text-fg-muted">大小写</label>
        <div class="flex items-center gap-1">
          <button
            v-for="m in CASE_MODES"
            :key="m.id"
            type="button"
            class="rounded border px-2 py-0.5 text-[11px] transition-colors"
            :class="
              caseMode === m.id
                ? 'border-brand-400 bg-brand-50 text-brand-700 dark:text-brand-300'
                : 'border-line-subtle bg-surface-1 text-fg-secondary hover:border-brand-400'
            "
            :title="m.hint"
            @click="caseMode = m.id"
          >
            {{ m.label }}
          </button>
        </div>
      </div>

      <!-- AI 规则助手：一句话换成本地模板引擎认得的 pattern。
           只填进上面的输入框，落盘仍由用户点「重命名」，且预览照旧先行 -->
      <div class="mt-2 flex items-center gap-2">
        <input
          v-model="aiAsk"
          type="text"
          placeholder="用一句话说规则，例如「前面加文件夹名，按导入日期编号 3 位」"
          class="h-8 min-w-0 flex-1 rounded-md border border-line-default bg-surface-1 px-3 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
          @keyup.enter="handleAiPattern"
        />
        <UButton
          size="sm"
          variant="secondary"
          :loading="aiBusy"
          :disabled="!aiAsk.trim()"
          @click="handleAiPattern"
          >✨ 生成</UButton
        >
      </div>
      <p v-if="aiError" class="mt-1 text-xs text-danger">{{ aiError }}</p>

      <div class="mt-3 flex items-center gap-4">
        <div class="flex items-center gap-2">
          <label class="text-xs text-fg-muted">起始编号</label>
          <input
            v-model.number="start"
            type="number"
            min="0"
            class="w-20 px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs text-fg-muted" title="{n} 补零位数">编号位数</label>
          <input
            v-model.number="pad"
            type="number"
            min="1"
            max="8"
            class="w-16 px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
      </div>

      <!-- 预览 -->
      <div class="rounded-md border border-line-subtle bg-surface-0 px-3 py-2 text-xs">
        <p class="mb-1 text-fg-muted">预览（前 3 项）：</p>
        <p v-for="(p, i) in previewList" :key="p.id" class="truncate text-fg-secondary">
          {{ p.fileName }} → <span class="text-fg-brand">{{ previewNames[i] }}</span>
        </p>
      </div>

      <p class="text-xs text-fg-muted">
        ⚠️ 会直接重命名磁盘上的原文件；目标位置已有同名文件时该项自动跳过。
      </p>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">取消</UButton>
      <UButton
        variant="primary"
        :disabled="!pattern.trim()"
        :loading="renaming"
        @click="handleRename"
      >
        重命名 {{ photos.length }} 项
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import type { Photo } from '../../../types/photo'
import { useToast } from '@composables/useToast'
import { usePhotoData } from '../composables/usePhotoData'
import { renderRenameBase, validateFindPattern, type CaseMode } from '../utils/renamePattern'

const props = defineProps<{
  photos: Photo[]
}>()

const emit = defineEmits<{
  close: []
  renamed: []
}>()

const toast = useToast()
const data = usePhotoData()
const pattern = ref('')
const start = ref(1)
// P1：正则替换与大小写四态
const findPattern = ref('')
const findReplacement = ref('')
const caseMode = ref<CaseMode>('none')
const CASE_MODES: Array<{ id: CaseMode; label: string; hint: string }> = [
  { id: 'none', label: '不变', hint: '保持展开后的原样' },
  { id: 'upper', label: '全大写', hint: 'ABC' },
  { id: 'lower', label: '全小写', hint: 'abc' },
  { id: 'title', label: '首字母大写', hint: '每个词首字母大写，其余不动' }
]
/** 非法正则不抛（引擎按不替换处理），但界面上必须标红说明 */
const findError = computed(() => validateFindPattern(findPattern.value))
const pad = ref(3)
const renaming = ref(false)
const patternInput = ref<HTMLInputElement | null>(null)

/**
 * F2 token 清单（P2 扩容：全集见 @shared/filename 的 RENAME_TOKENS，共 19 种）。
 * 对齐 Eagle 4.0.0 批量重命名的可行子集 + Leaf 侧属性增强；
 * 日期格式跟 Eagle：%D 家族连字符、%B/%M 家族下划线。
 */
const TOKENS: Array<{ token: string; hint: string }> = [
  { token: '{name}', hint: '原文件名（不含扩展名）' },
  { token: '{n}', hint: '序号（配合起始编号/位数）' },
  { token: '{date}', hint: '导入日期 YYYYMMDD' },
  { token: '{time}', hint: '导入时间 HHmmss' },
  { token: '{parent}', hint: '所在文件夹名' },
  { token: '{rand}', hint: '6 位随机串（预览与实际值会不同）' },
  { token: '{add date}', hint: '添加日期 YYYY-MM-DD（导入时间）' },
  { token: '{today}', hint: '今天 YYYY-MM-DD（重命名当天）' },
  { token: '{create date}', hint: '创建日期 YYYY_MM_DD（文件创建时间）' },
  { token: '{modified date}', hint: '修改日期 YYYY_MM_DD（文件修改时间）' },
  { token: '{taken date}', hint: '拍摄日期 YYYY_MM_DD（EXIF，缺失留空）' },
  { token: '{size}', hint: '文件大小（如 1.5KB）' },
  { token: '{rating}', hint: '评分（0-5）' },
  { token: '{duration}', hint: '时长（如 3m05s，缺失留空）' },
  { token: '{width}', hint: '像素宽（缺失留空）' },
  { token: '{height}', hint: '像素高（缺失留空）' },
  { token: '{id}', hint: '素材 id' },
  { token: '{tags}', hint: '标签（排序后 - 连接，无标签留空）' },
  { token: '{library}', hint: '库名' }
]

/** 在光标处插入 token */
function insertToken(token: string): void {
  const el = patternInput.value
  const value = pattern.value
  if (!el) {
    pattern.value = value + token
    return
  }
  const s = el.selectionStart ?? value.length
  const e = el.selectionEnd ?? s
  pattern.value = value.slice(0, s) + token + value.slice(e)
  void nextTick(() => {
    el.focus()
    el.setSelectionRange(s + token.length, s + token.length)
  })
}

const aiAsk = ref('')
const aiBusy = ref(false)
const aiError = ref('')

async function handleAiPattern(): Promise<void> {
  if (aiBusy.value || !aiAsk.value.trim()) return
  aiBusy.value = true
  aiError.value = ''
  try {
    const r = await window.api.ai.renamePattern(
      aiAsk.value,
      props.photos.map((p) => p.fileName)
    )
    if (!r.ok) {
      aiError.value = r.error
      return
    }
    pattern.value = r.pattern
  } catch (error) {
    aiError.value = (error as Error).message
  } finally {
    aiBusy.value = false
  }
}

const previewList = computed(() => props.photos.slice(0, 3))

/**
 * {library} token 的库名：photo 列表里没有，从注册表 IPC 取一次。
 * 取不到（测试代理/异常）按空串兜底——预览里 {library} 展开为空，不挡改名。
 */
const libraryName = ref('')
onMounted(async () => {
  try {
    const r = await window.api.libraries.list()
    libraryName.value = r?.libraries?.find((l) => l.id === r.activeId)?.name ?? ''
  } catch {
    /* 兜底空串 */
  }
})

function renderBase(p: Photo, i: number): string {
  return renderRenameBase(
    pattern.value,
    {
      fileName: p.fileName,
      folderName: data.folders.value.find((f) => f.id === p.folderId)?.name,
      importedAt: p.importedAt,
      index: start.value + i,
      pad: pad.value,
      // P2 扩容字段：与 shared RenameContext 一一对齐；缺失即展开空串
      fsCreatedAt: p.fsCreatedAt,
      fsModifiedAt: p.fsModifiedAt,
      takenAt: p.takenAt,
      fileSize: p.fileSize,
      rating: p.rating,
      durationMs: p.durationMs,
      width: p.width,
      height: p.height,
      id: p.id,
      tags: p.tags,
      libraryName: libraryName.value
    },
    { find: findPattern.value, replacement: findReplacement.value, caseMode: caseMode.value }
  )
}

function extOf(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(idx) : ''
}

const previewNames = computed(() =>
  previewList.value.map((p, i) => renderBase(p, i) + extOf(p.fileName))
)

async function handleRename(): Promise<void> {
  if (findError.value) {
    toast.error('正则不合法，先修正再重命名', { description: findError.value })
    return
  }
  renaming.value = true
  try {
    // F2：渲染端展开 token，主进程仅做合法化兜底与冲突跳过
    const result = await window.api.photos.renamePhotos(
      props.photos.map((p, i) => ({ id: p.id, name: renderBase(p, i) }))
    )
    if (result.conflicts.length > 0) {
      toast.warning(`已重命名 ${result.renamed.length} 项，${result.conflicts.length} 项因重名跳过`)
    } else {
      toast.success(`已重命名 ${result.renamed.length} 项`)
    }
    emit('renamed')
    emit('close')
  } catch (error) {
    toast.error('批量重命名失败', { description: (error as Error).message })
  } finally {
    renaming.value = false
  }
}
</script>
