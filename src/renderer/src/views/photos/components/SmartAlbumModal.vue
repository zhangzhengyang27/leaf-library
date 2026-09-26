<template>
  <UModal :model-value="true" size="md" @update:model-value="$emit('close')">
    <template #title>
      <span class="flex items-center gap-2">
        <AppIcon icon="context-menu/ic-smart-folder-rule" />
        {{ album ? '编辑智能文件夹' : '新增智能文件夹' }}
      </span>
    </template>

    <div class="space-y-4">
      <div>
        <label class="mb-1 block text-xs text-fg-muted">名称</label>
        <input
          v-model="name"
          type="text"
          placeholder="例如：大尺寸截图、五星级照片..."
          class="w-full h-8 px-3 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary focus:outline-none focus:border-brand-500"
        />
      </div>

      <!-- 标签（全部包含） -->
      <div v-if="availableTags.length > 0">
        <label class="mb-1 block text-xs text-fg-muted">匹配模式</label>
        <select
          v-model="matchMode"
          class="mb-3 h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
        >
          <option value="all">所有条件满足</option>
          <option value="any">任一条件满足</option>
        </select>

        <label class="mb-1 block text-xs text-fg-muted">包含标签（全部满足）</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="t in availableTags"
            :key="t.id"
            :class="[
              'px-2.5 py-1 rounded-full text-xs border transition-colors',
              selectedTagIds.includes(t.id)
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-line-default text-fg-secondary hover:border-brand-400'
            ]"
            @click="toggleTag(t.id)"
          >
            {{ t.name }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <!-- 收藏 + 评分 -->
        <label class="flex items-center gap-2 text-sm text-fg-primary">
          <input v-model="favorite" type="checkbox" class="accent-brand-500" />
          仅收藏
        </label>
        <div class="flex items-center gap-2 text-sm text-fg-primary">
          <span class="text-xs text-fg-muted">最低评分</span>
          <select
            v-model.number="minRating"
            class="flex-1 px-2 py-1.5 rounded-md border border-line-default bg-surface-1 text-sm text-fg-primary"
          >
            <option :value="0">不限</option>
            <option v-for="n in 5" :key="n" :value="n">{{ n }} 星</option>
          </select>
        </div>
      </div>

      <!-- 六期：素材类型 -->
      <div>
        <label class="mb-1 block text-xs text-fg-muted">类型</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="k in ALL_KINDS"
            :key="k"
            :class="[
              'px-2.5 py-1 rounded-full text-xs border transition-colors',
              selectedKinds.includes(k)
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-line-default text-fg-secondary hover:border-brand-400'
            ]"
            @click="toggleKind(k)"
          >
            {{ KIND_LABELS[k] }}
          </button>
        </div>
      </div>

      <!-- 格式 -->
      <div>
        <label class="mb-1 block text-xs text-fg-muted">格式</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="f in ALL_FORMATS"
            :key="f"
            :class="[
              'px-2.5 py-1 rounded-full text-xs border transition-colors uppercase',
              formats.includes(f)
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-line-default text-fg-secondary hover:border-brand-400'
            ]"
            @click="toggleFormat(f)"
          >
            {{ f }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="mb-1 block text-xs text-fg-muted">最小宽度 px</label>
          <input
            v-model.number="minWidth"
            type="number"
            min="0"
            class="w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-muted">最小高度 px</label>
          <input
            v-model.number="minHeight"
            type="number"
            min="0"
            class="w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-muted">关键词</label>
          <input
            v-model="keyword"
            type="text"
            placeholder="文件名/描述"
            class="w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
      </div>

      <!-- §2.B 智能夹规则补齐：主色 + 大小 + 时长 + URL + 描述 -->
      <div>
        <label class="mb-1 block text-xs text-fg-muted">主色（色相桶）</label>
        <ColorPalette v-model="colorHue" show-clear />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-xs text-fg-muted">最小文件大小 (KB)</label>
          <input
            v-model.number="minFileSizeKb"
            type="number"
            min="0"
            placeholder="不限"
            class="w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-muted">最大文件大小 (KB)</label>
          <input
            v-model.number="maxFileSizeKb"
            type="number"
            min="0"
            placeholder="不限"
            class="w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-muted">最短时长 (秒，视频/音频)</label>
          <input
            v-model.number="minDurationSec"
            type="number"
            min="0"
            placeholder="不限"
            class="w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-muted">最长时长 (秒，视频/音频)</label>
          <input
            v-model.number="maxDurationSec"
            type="number"
            min="0"
            placeholder="不限"
            class="w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-xs text-fg-muted">书签来源 URL 包含</label>
          <input
            v-model="sourceUrl"
            type="text"
            placeholder="如 github.com"
            class="w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-fg-muted"
            >所属文件夹（⌘/Ctrl 多选，不选=不限）</label
          >
          <select
            v-model="folderIds"
            multiple
            size="4"
            class="h-[74px] w-full rounded-md border border-line-default bg-surface-1 px-2 py-1 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
          >
            <option value="none">未分类到文件夹</option>
            <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>
        <div>
          <!-- 排除文件夹：结构与所属文件夹同款（'none' = 未分类），引擎按
               matchFolderFilter exclude 语义编译（smartAlbumRules.buildSmartAlbumWhere） -->
          <label class="mb-1 block text-xs text-fg-muted"
            >排除文件夹（⌘/Ctrl 多选，不选=不限）</label
          >
          <select
            v-model="folderExcludeIds"
            multiple
            size="4"
            class="h-[74px] w-full rounded-md border border-line-default bg-surface-1 px-2 py-1 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
          >
            <option value="none">未分类到文件夹</option>
            <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="mb-1 block text-xs text-fg-muted">修改日期（文件系统）</label>
          <div class="flex items-center gap-1">
            <input
              v-model="modFrom"
              type="date"
              class="h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
            />
            <span class="text-fg-muted">~</span>
            <input
              v-model="modTo"
              type="date"
              class="h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>
        <div class="mb-3">
          <label class="mb-1 block text-xs text-fg-muted">描述关键词</label>
          <input
            v-model="descriptionKeyword"
            type="text"
            placeholder="仅匹配描述字段"
            class="w-full px-2 py-1.5 text-sm rounded-md border border-line-default bg-surface-1 text-fg-primary"
          />
        </div>
      </div>

      <!-- ── G2：引擎早就支持、此前没有入口的条件 ── -->
      <fieldset class="mb-2 rounded-md border border-line-default p-2">
        <legend class="px-1 text-xs text-fg-muted">更多条件（保存筛选下发过但此前没入口）</legend>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs text-fg-muted">标签匹配逻辑（按名字那组）</label>
            <div class="flex gap-1">
              <button
                v-for="l in TAG_LOGICS"
                :key="l.key"
                type="button"
                class="rounded border px-2 py-1 text-xs"
                :class="
                  tagLogic === l.key
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : 'border-line-default bg-surface-1 text-fg-muted'
                "
                @click="tagLogic = l.key"
              >
                {{ l.label }}
              </button>
            </div>
            <input
              v-model="tagNamesText"
              type="text"
              placeholder="标签名，逗号分隔"
              class="mt-1 w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-muted">形状（左键包含 / 右键排除）</label>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="s in SHAPE_OPTIONS"
                :key="s.key"
                type="button"
                class="rounded border px-2 py-1 text-xs"
                :class="
                  shapesInclude.includes(s.key)
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : shapesExclude.includes(s.key)
                      ? 'border-danger text-danger-500 line-through'
                      : 'border-line-default bg-surface-1 text-fg-muted'
                "
                :title="`左键包含，右键排除：${s.label}`"
                @click="toggleShape(s.key, true)"
                @contextmenu.prevent="toggleShape(s.key, false)"
              >
                {{ s.label }}
              </button>
            </div>
          </div>

          <div>
            <!-- 精确评分多选（0 = 尚未评分）：交互同形状那组；引擎侧包含集优先于排除集
                 （buildSmartAlbumWhere / matchRating 同语义），同一项不会同时出现在两侧 -->
            <label class="mb-1 block text-xs text-fg-muted">评分（左键包含 / 右键排除）</label>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="r in RATING_OPTIONS"
                :key="r"
                type="button"
                class="rounded border px-2 py-1 text-xs"
                :class="
                  ratingsInclude.includes(r)
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : ratingsExclude.includes(r)
                      ? 'border-danger text-danger-500 line-through'
                      : 'border-line-default bg-surface-1 text-fg-muted'
                "
                :title="`左键包含，右键排除：${ratingOptionLabel(r)}`"
                @click="toggleRating(r, true)"
                @contextmenu.prevent="toggleRating(r, false)"
              >
                {{ ratingOptionLabel(r) }}
              </button>
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs text-fg-muted">比例 W : H（2% 容差）</label>
            <div class="flex items-center gap-1">
              <input
                v-model.number="ratioW"
                type="number"
                min="0"
                class="w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                placeholder="16"
              />
              <span class="text-fg-muted">:</span>
              <input
                v-model.number="ratioH"
                type="number"
                min="0"
                class="w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                placeholder="9"
              />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-muted">分辨率下限（短边）</label>
            <select
              v-model.number="resolutionMinSel"
              class="h-7 w-full rounded border border-line-default bg-surface-1 px-2 text-xs text-fg-primary"
            >
              <option :value="0">不限</option>
              <option :value="1280">≥ 1280（1K）</option>
              <option :value="1920">≥ 1920（2K）</option>
              <option :value="3840">≥ 3840（4K）</option>
            </select>
          </div>

          <div>
            <label class="mb-1 block text-xs text-fg-muted">最大宽 / 高（超尺寸排除用）</label>
            <div class="flex items-center gap-1">
              <input
                v-model.number="maxWidth"
                type="number"
                min="0"
                placeholder="宽"
                class="w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
              />
              <input
                v-model.number="maxHeight"
                type="number"
                min="0"
                placeholder="高"
                class="w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
              />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-muted">排除关键词（命中即排除）</label>
            <input
              v-model="excludeKeyword"
              type="text"
              placeholder="如 临时"
              class="w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
            />
          </div>

          <!-- G1 语义条件：存的是描述文本，每次求值现算向量（存 id 等于把一次结果钉死） -->
          <div>
            <label class="mb-1 block text-xs text-fg-muted">AI 语义（按画面内容匹配）</label>
            <input
              v-model="semanticQuery"
              type="text"
              placeholder="如 红色日落的海边"
              class="w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
            />
            <p v-if="semanticQuery.trim() && !semanticReady" class="mt-1 text-[11px] text-warning-600">
              向量模型未下载：这条条件现在会判定为「无匹配」（相册显示空），
              到 设置 › 内容识别 下载后自动生效。
            </p>
          </div>

          <div>
            <label class="mb-1 block text-xs text-fg-muted">添加日期</label>
            <div class="flex items-center gap-1">
              <input
                v-model="impFrom"
                type="date"
                class="w-1/2 px-1 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
              />
              <span class="text-fg-muted">~</span>
              <input
                v-model="impTo"
                type="date"
                class="w-1/2 px-1 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
              />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-muted">拍摄日期（EXIF）</label>
            <div class="flex items-center gap-1">
              <input
                v-model="takenFrom"
                type="date"
                class="w-1/2 px-1 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
              />
              <span class="text-fg-muted">~</span>
              <input
                v-model="takenTo"
                type="date"
                class="w-1/2 px-1 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
              />
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs text-fg-muted"
              >近似色（HEX + 准确度，留空=不用）</label
            >
            <div class="flex items-center gap-1">
              <input
                v-model="closeHex"
                type="text"
                placeholder="#FF0000"
                class="w-1/2 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary uppercase"
              />
              <input
                v-model.number="closeAccuracy"
                type="number"
                min="5"
                max="40"
                class="w-1/4 px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
                title="准确度（5–40，越大越严）"
              />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-muted">排除扩展名（逗号分隔）</label>
            <input
              v-model="extExcludeText"
              type="text"
              placeholder="如 gif, tmp"
              class="w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
            />
          </div>

          <label class="flex items-center gap-1.5 text-xs text-fg-secondary">
            <input v-model="untaggedOnly" type="checkbox" class="accent-brand-500" />
            仅看未标签
          </label>

          <!-- M4 标注维（023 photo_annotations）：有/无标注两档，'不限' = 不下发 -->
          <div>
            <label class="mb-1 block text-xs text-fg-muted">标注</label>
            <select
              v-model="annotationFilterSel"
              class="h-7 w-full rounded border border-line-default bg-surface-1 px-2 text-xs text-fg-primary"
            >
              <option value="">不限</option>
              <option value="any">有标注</option>
              <option value="none">无标注</option>
            </select>
          </div>
        </div>
      </fieldset>

      <p v-if="unownedLabels.length > 0" class="mb-2 text-[11px] text-warning-500">
        这条还带着编辑器暂不支持编辑的条件，将原样保留：{{ unownedLabels.join('、') }}
      </p>

      <p class="text-xs text-fg-muted">
        {{ matchCount === null ? '正在计算匹配数量...' : `当前条件匹配 ${matchCount} 张图片` }}
      </p>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">取消</UButton>
      <UButton variant="primary" :disabled="!name.trim()" @click="handleSave">
        {{ album ? '保存' : '创建' }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import AppIcon from '@components/AppIcon.vue'
import { useSemanticSearch } from '../constants/semanticSearch'
import UButton from '@components/ui/UButton.vue'
import UModal from '@components/ui/UModal.vue'
import {
  ALL_KINDS,
  FORMAT_FILTER_EXTENSIONS,
  KIND_LABELS,
  type AssetKind
} from '@shared/assetTypes'
import type { HueBucket } from '@utils/photoColor'
import type { SmartAlbum, SmartAlbumRules, TagSummary } from '../../../types/photo'
import ColorPalette from './ColorPalette.vue'
import { useToast } from '@composables/useToast'

const props = defineProps<{
  /** 传入则为编辑模式 */
  album?: SmartAlbum | null
  /** 二十六轮：新建时预置规则（Eagle「保存筛选」→ 智能文件夹） */
  presetRules?: SmartAlbumRules | null
  availableTags: TagSummary[]
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const toast = useToast()

// 「格式」候选值来自单一真源（此前是写死的 7 项图片表，视频/音频/字体/归档一律筛不到）
const ALL_FORMATS = FORMAT_FILTER_EXTENSIONS

const name = ref('')
const selectedTagIds = ref<string[]>([])
const selectedKinds = ref<string[]>([])
const favorite = ref(false)
const minRating = ref(0)
const formats = ref<string[]>([])
const minWidth = ref<number | null>(null)
const minHeight = ref<number | null>(null)
const keyword = ref('')
// —— §2.B 智能夹规则补齐 ——
const colorHue = ref<HueBucket | null>(null)
const minFileSizeKb = ref<number | null>(null)
const maxFileSizeKb = ref<number | null>(null)
const minDurationSec = ref<number | null>(null)
const maxDurationSec = ref<number | null>(null)
const sourceUrl = ref('')
const descriptionKeyword = ref('')
const matchCount = ref<number | null>(null)
// —— D-012 对齐 Eagle：匹配模式 / 文件夹 / 修改日期 ——
const matchMode = ref<'all' | 'any'>('all')
const folderIds = ref<string[]>([])
const modFrom = ref('')
const modTo = ref('')
// 「完全相等」语义（审查 P2-13）：FilterBar 保存的规则可能带 exact 字段（值为精确串），
// 编辑回填 + 保存透传，否则一旦编辑保存该条件被静默丢弃
const sourceUrlExact = ref('')
const descriptionExact = ref('')
const folders = ref<Array<{ id: string; name: string }>>([])

// ── 二十九轮 G2：补齐「引擎早就支持、编辑器没入口」的条件 ──
// 这些 key 正向映射 buildFiltersSpec() 都会产出（保存筛选下发过来时），
// 之前编辑器打开再保存就静默丢掉——缺陷4 是同一族，只是当时只撞上 folderIds 一个。
const tagLogic = ref<'any' | 'all' | 'exact'>('all')
const tagNames = ref<string[]>([])
const tagExcludeNames = ref<string[]>([])
const untaggedOnly = ref(false)
/** M4 标注维：''=不限（select 需要标量值，spec 的缺省不下发单独一层） */
const annotationFilterSel = ref<'' | 'any' | 'none'>('')
const shapesInclude = ref<string[]>([])
const shapesExclude = ref<string[]>([])
const ratingsInclude = ref<number[]>([])
const ratingsExclude = ref<number[]>([])
const folderExcludeIds = ref<string[]>([])
const ratioW = ref<number | null>(null)
const ratioH = ref<number | null>(null)
const resolutionMin = ref<number | null>(null)
const maxWidth = ref<number | null>(null)
const maxHeight = ref<number | null>(null)
const impFrom = ref('')
const impTo = ref('')
const takenFrom = ref('')
const takenTo = ref('')
const excludeKeyword = ref('')
const semanticQuery = ref('')
const semantic = useSemanticSearch()
/** 模型在不在位决定这条条件是「生效」还是「判定无匹配」，界面要说清 */
const semanticReady = computed(() => semantic.state.value.ready)
const closeHex = ref('')
const closeAccuracy = ref(20)
const extExclude = ref<string[]>([])
/** 来源 URL / 注释的「完全相等」是独立字段，回填自 exact 而包含档为空时也要保住 */

/**
 * 表单没有对应控件的规则键原样带走。
 * 这是"编辑不丢条件"的兜底：以后主进程加谓词而编辑器还没跟上时，
 * 用户编辑保存也不会把那条抹掉；带走的键会在界面上列出来（unownedLabels）。
 */
const passthrough = ref<SmartAlbumRules>({})

/** 表单有控件、由表单负责写回的规则键；不在其中的原样带走（passthrough） */
const OWNED_RULE_KEYS: Array<keyof SmartAlbumRules> = [
  'match',
  'tags',
  'kinds',
  'favorite',
  'minRating',
  'formats',
  'fileExtsInclude',
  'fileExtsExclude',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'keyword',
  'colorHue',
  'colorClose',
  'minFileSize',
  'maxFileSize',
  'minDurationMs',
  'maxDurationMs',
  'sourceUrl',
  'sourceUrlExact',
  'descriptionKeyword',
  'descriptionExact',
  'folderIds',
  'folderExcludeIds',
  'ratingsInclude',
  'ratingsExclude',
  'modifiedFrom',
  'modifiedTo',
  'importedFrom',
  'importedTo',
  'takenFrom',
  'takenTo',
  'tagNamesAny',
  'tagNamesAll',
  'tagNamesExact',
  'tagNamesExclude',
  'untaggedOnly',
  'annotationFilter',
  'shapesInclude',
  'shapesExclude',
  'ratioWidth',
  'ratioHeight',
  'resolutionMin',
  'excludeKeyword',
  'semanticQuery',
  // 快照字段：编辑器不呈现它，但 passthrough 不能把它丢掉（下次保存要带走的是 semanticQuery）
  'semanticIds'
]

/** 未接管键的中文标签（界面要念得出，别让用户以为条件凭空消失）。
 * 只收没有编辑器控件的键：folderExcludeIds / ratingsInclude / ratingsExclude
 * 已有控件接管，进这张表反而是死条目 */
const RULE_LABEL: Record<string, string> = {
  searchKeyword: '搜索关键词',
  searchScopes: '搜索范围',
  advancedAst: '高级搜索语法',
  fileExtsExclude: '排除扩展名',
  tags: '标签（按 id）',
  notesKeyword: '注释关键词',
  urlKeyword: '链接关键词'
}

const unownedLabels = computed<string[]>(() =>
  Object.keys(passthrough.value).map((k) => RULE_LABEL[k] ?? k)
)

const TAG_LOGICS = [
  { key: 'all', label: '全部包含' },
  { key: 'any', label: '任一' },
  { key: 'exact', label: '完全相同' }
] as const

const SHAPE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'landscape', label: '横图' },
  { key: 'portrait', label: '竖图' },
  { key: 'square', label: '方形' },
  { key: 'panoramic', label: '细长横' },
  { key: 'panoramicPortrait', label: '细长竖' }
]

/** 左键=包含，右键=排除（Eagle 形状弹层语义）；同一项不会同时出现在两侧 */
function toggleShape(key: string, include: boolean): void {
  const list = include ? shapesInclude.value : shapesExclude.value
  const other = include ? shapesExclude.value : shapesInclude.value
  const i = list.indexOf(key)
  if (i >= 0) {
    list.splice(i, 1)
    return
  }
  list.push(key)
  const j = other.indexOf(key)
  if (j >= 0) other.splice(j, 1)
}

// ── 精确评分多选（引擎 ratingsInclude/ratingsExclude；0 = 尚未评分） ──
// 顺序对齐 FilterBar 评分弹层：星级行在前、「尚未评分」最后
const RATING_OPTIONS = [1, 2, 3, 4, 5, 0]
function ratingOptionLabel(r: number): string {
  if (r === 0) return '尚未评分'
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}
/** 交互同形状那组：同一项不会同时出现在两侧 */
function toggleRating(r: number, include: boolean): void {
  const list = include ? ratingsInclude.value : ratingsExclude.value
  const other = include ? ratingsExclude.value : ratingsInclude.value
  const i = list.indexOf(r)
  if (i >= 0) {
    list.splice(i, 1)
    return
  }
  list.push(r)
  const j = other.indexOf(r)
  if (j >= 0) other.splice(j, 1)
}

const splitList = (s: string): string[] =>
  s
    .split(/[,，、]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)

const tagNamesText = computed({
  get: () => tagNames.value.join(', '),
  set: (v: string) => {
    tagNames.value = v
      .split(/[,，、]/)
      .map((x) => x.trim())
      .filter(Boolean)
  }
})
const extExcludeText = computed({
  get: () => extExclude.value.join(', '),
  set: (v: string) => {
    extExclude.value = splitList(v)
  }
})
// 0 = 不限；resolutionMin 用 null 表达，select 需要标量值所以单独一层
const resolutionMinSel = computed({
  get: () => resolutionMin.value ?? 0,
  set: (v: number) => {
    resolutionMin.value = v > 0 ? v : null
  }
})

/**
 * 'yyyy-mm-dd' → 本地日界的 ms。
 * 不能用 new Date('2026-09-01')：ISO 短日期串按 **UTC** 解析，在 UTC+8 上等于当天 08:00，
 * 用户选「9 月 1 日起」会把当天 0 点到 8 点之间导入的素材静默排除掉
 * （endOfDay 时补到当天最后一毫秒，保持"含所选这天"的语义）。
 */
function localDayMs(str: string, endOfDay = false): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (!m) return null
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return endOfDay ? base + 86_399_000 : base
}

onMounted(async () => {
  // 就绪态要现问一次：不刷的话，用户刚在设置页下完模型、开这个弹窗还看到「未下载」
  void semantic.refreshReady()
  const a = props.album
  const src: SmartAlbumRules | null = a ? a.rules : (props.presetRules ?? null)
  if (src) {
    name.value = a?.name ?? ''
    selectedTagIds.value = src.tags ?? []
    selectedKinds.value = src.kinds ?? []
    favorite.value = src.favorite ?? false
    minRating.value = src.minRating ?? 0
    // 扩展名条件有两种来源：手工建的智能夹存 formats（带点），
    // 「保存筛选」下发的是 fileExtsInclude（不带点）——两边都要吃得下
    formats.value = [...(src.formats ?? []), ...(src.fileExtsInclude ?? [])]
      .map((f) => f.replace(/^\./, '').toLowerCase())
      .filter((f, i, arr) => f && arr.indexOf(f) === i)
    minWidth.value = src.minWidth ?? null
    minHeight.value = src.minHeight ?? null
    keyword.value = src.keyword ?? ''
    colorHue.value = (src.colorHue as HueBucket) ?? null
    minFileSizeKb.value = src.minFileSize ? Math.round(src.minFileSize / 1024) : null
    maxFileSizeKb.value = src.maxFileSize ? Math.round(src.maxFileSize / 1024) : null
    minDurationSec.value = src.minDurationMs ? Math.round(src.minDurationMs / 1000) : null
    maxDurationSec.value = src.maxDurationMs ? Math.round(src.maxDurationMs / 1000) : null
    sourceUrl.value = src.sourceUrl ?? ''
    sourceUrlExact.value = src.sourceUrlExact ?? ''
    descriptionKeyword.value = src.descriptionKeyword ?? ''
    descriptionExact.value = src.descriptionExact ?? ''
    matchMode.value = src.match ?? 'all'
    folderIds.value = [...(src.folderIds ?? [])]
    modFrom.value = toDateInputValue(src.modifiedFrom)
    modTo.value = toDateInputValue(src.modifiedTo)
    // —— G2 补齐项回填 ——
    tagNames.value = [
      ...(src.tagNamesAny ?? []),
      ...(src.tagNamesAll ?? []),
      ...(src.tagNamesExact ?? [])
    ]
    tagLogic.value = src.tagNamesExact?.length ? 'exact' : src.tagNamesAny?.length ? 'any' : 'all'
    tagExcludeNames.value = [...(src.tagNamesExclude ?? [])]
    untaggedOnly.value = !!src.untaggedOnly
    annotationFilterSel.value = src.annotationFilter ?? ''
    shapesInclude.value = [...(src.shapesInclude ?? [])]
    shapesExclude.value = [...(src.shapesExclude ?? [])]
    ratingsInclude.value = [...(src.ratingsInclude ?? [])]
    ratingsExclude.value = [...(src.ratingsExclude ?? [])]
    folderExcludeIds.value = [...(src.folderExcludeIds ?? [])]
    ratioW.value = src.ratioWidth ?? null
    ratioH.value = src.ratioHeight ?? null
    resolutionMin.value = src.resolutionMin ?? null
    maxWidth.value = src.maxWidth ?? null
    maxHeight.value = src.maxHeight ?? null
    impFrom.value = toDateInputValue(src.importedFrom)
    impTo.value = toDateInputValue(src.importedTo)
    takenFrom.value = toDateInputValue(src.takenFrom)
    takenTo.value = toDateInputValue(src.takenTo)
    excludeKeyword.value = src.excludeKeyword ?? ''
    semanticQuery.value = src.semanticQuery ?? ''
    closeHex.value = src.colorClose?.hex ?? ''
    closeAccuracy.value = src.colorClose?.accuracy ?? 20
    extExclude.value = [...(src.fileExtsExclude ?? [])]
    // 表单没有控件的键原样带走，并在界面上列出来——编辑保存不得把它们抹掉
    passthrough.value = Object.fromEntries(
      Object.entries(src).filter(([k]) => !OWNED_RULE_KEYS.includes(k as never))
    ) as SmartAlbumRules
  }
  // D-012 文件夹条件选项
  try {
    const all = await window.api.photos.listPhotoFolders()
    folders.value = all.map((f) => ({ id: f.id, name: f.name }))
  } catch {
    /* ignore */
  }
})

function toDateInputValue(ms?: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const currentRules = computed<SmartAlbumRules>(() => {
  const rules: SmartAlbumRules = {}
  if (selectedTagIds.value.length > 0) rules.tags = [...selectedTagIds.value]
  if (selectedKinds.value.length > 0) rules.kinds = [...selectedKinds.value]
  if (favorite.value) rules.favorite = true
  if (minRating.value > 0) rules.minRating = minRating.value
  if (typeof minWidth.value === 'number' && minWidth.value > 0) rules.minWidth = minWidth.value
  if (typeof minHeight.value === 'number' && minHeight.value > 0) rules.minHeight = minHeight.value
  if (keyword.value.trim()) rules.keyword = keyword.value.trim()
  if (colorHue.value) rules.colorHue = colorHue.value
  if (typeof minFileSizeKb.value === 'number' && minFileSizeKb.value > 0)
    rules.minFileSize = minFileSizeKb.value * 1024
  if (typeof maxFileSizeKb.value === 'number' && maxFileSizeKb.value > 0)
    rules.maxFileSize = maxFileSizeKb.value * 1024
  if (typeof minDurationSec.value === 'number' && minDurationSec.value > 0)
    rules.minDurationMs = minDurationSec.value * 1000
  if (typeof maxDurationSec.value === 'number' && maxDurationSec.value > 0)
    rules.maxDurationMs = maxDurationSec.value * 1000
  if (sourceUrl.value.trim()) {
    rules.sourceUrl = sourceUrl.value.trim()
    if (sourceUrlExact.value.trim()) rules.sourceUrlExact = sourceUrlExact.value.trim()
  }
  if (descriptionKeyword.value.trim()) {
    rules.descriptionKeyword = descriptionKeyword.value.trim()
    if (descriptionExact.value.trim()) rules.descriptionExact = descriptionExact.value.trim()
  }
  if (matchMode.value === 'any') rules.match = 'any'
  if (folderIds.value.length > 0) rules.folderIds = [...folderIds.value]
  const modFromMs = localDayMs(modFrom.value)
  if (modFromMs !== null) rules.modifiedFrom = modFromMs
  const modToMs = localDayMs(modTo.value, true)
  if (modToMs !== null) rules.modifiedTo = modToMs
  // —— G2 补齐项写回 ——
  const names = tagNames.value.map((n) => n.trim()).filter(Boolean)
  if (names.length > 0) {
    if (tagLogic.value === 'any') rules.tagNamesAny = names
    else if (tagLogic.value === 'exact') rules.tagNamesExact = names
    else rules.tagNamesAll = names
  }
  if (tagExcludeNames.value.length > 0) rules.tagNamesExclude = [...tagExcludeNames.value]
  if (untaggedOnly.value) rules.untaggedOnly = true
  if (annotationFilterSel.value) rules.annotationFilter = annotationFilterSel.value
  if (shapesInclude.value.length > 0) rules.shapesInclude = [...shapesInclude.value]
  if (shapesExclude.value.length > 0) rules.shapesExclude = [...shapesExclude.value]
  // 两键原样并存写回：引擎（buildSmartAlbumWhere / matchRating）语义是包含集优先，
  // 旧规则若两键都有，编辑保存不得把排除集抹掉——只写其一才是丢条件
  if (ratingsInclude.value.length > 0) rules.ratingsInclude = [...ratingsInclude.value]
  if (ratingsExclude.value.length > 0) rules.ratingsExclude = [...ratingsExclude.value]
  if (folderExcludeIds.value.length > 0) rules.folderExcludeIds = [...folderExcludeIds.value]
  if (ratioW.value && ratioH.value) {
    rules.ratioWidth = ratioW.value
    rules.ratioHeight = ratioH.value
  }
  if (resolutionMin.value) rules.resolutionMin = resolutionMin.value
  if (maxWidth.value) rules.maxWidth = maxWidth.value
  if (maxHeight.value) rules.maxHeight = maxHeight.value
  const impFromMs = localDayMs(impFrom.value)
  if (impFromMs !== null) rules.importedFrom = impFromMs
  const impToMs = localDayMs(impTo.value, true)
  if (impToMs !== null) rules.importedTo = impToMs
  const takenFromMs = localDayMs(takenFrom.value)
  if (takenFromMs !== null) rules.takenFrom = takenFromMs
  const takenToMs = localDayMs(takenTo.value, true)
  if (takenToMs !== null) rules.takenTo = takenToMs
  if (excludeKeyword.value.trim()) rules.excludeKeyword = excludeKeyword.value.trim()
  if (semanticQuery.value.trim()) rules.semanticQuery = semanticQuery.value.trim()
  if (/^#?[0-9a-fA-F]{6}$/.test(closeHex.value.trim())) {
    const hex = closeHex.value.trim()
    rules.colorClose = { hex: hex.startsWith('#') ? hex : `#${hex}`, accuracy: closeAccuracy.value }
  }
  if (extExclude.value.length > 0) rules.fileExtsExclude = [...extExclude.value]
  // 正向映射统一用 fileExtsInclude；formats 只作为旧数据的读入形态，不再写回，
  // 否则同一条扩展名条件会以两种形状各存一份、被 AND 成两个谓词
  if (formats.value.length > 0) {
    rules.fileExtsInclude = formats.value.map((f) => f.replace(/^\./, '').toLowerCase())
  }
  return { ...passthrough.value, ...rules }
})

// 条件变化时实时试跑匹配数量（防抖 300ms + 序号守卫：
// 慢的旧请求回来时不得覆盖新一轮计数；卸载后定时器不再触发全库查询）
let debounceTimer: number | undefined
let rulesQuerySeq = 0
watch(
  currentRules,
  () => {
    window.clearTimeout(debounceTimer)
    const seq = ++rulesQuerySeq
    debounceTimer = window.setTimeout(async () => {
      if (seq !== rulesQuerySeq) return
      try {
        const result = await window.api.photos.queryPhotosByRules(currentRules.value)
        if (seq !== rulesQuerySeq) return
        matchCount.value = result.length
      } catch {
        if (seq === rulesQuerySeq) matchCount.value = null
      }
    }, 300)
  },
  { immediate: true }
)
onUnmounted(() => window.clearTimeout(debounceTimer))

function toggleTag(id: string): void {
  const i = selectedTagIds.value.indexOf(id)
  if (i >= 0) selectedTagIds.value.splice(i, 1)
  else selectedTagIds.value.push(id)
}

function toggleKind(k: AssetKind): void {
  const i = selectedKinds.value.indexOf(k)
  if (i >= 0) selectedKinds.value.splice(i, 1)
  else selectedKinds.value.push(k)
}

function toggleFormat(f: string): void {
  const i = formats.value.indexOf(f)
  if (i >= 0) formats.value.splice(i, 1)
  else formats.value.push(f)
}

async function handleSave(): Promise<void> {
  const trimmed = name.value.trim()
  if (!trimmed) return
  try {
    if (props.album) {
      await window.api.photos.updateSmartAlbum(props.album.id, {
        name: trimmed,
        rules: currentRules.value
      })
      toast.success('智能文件夹已更新')
    } else {
      await window.api.photos.createSmartAlbum(trimmed, currentRules.value)
      toast.success('智能文件夹已创建')
    }
    emit('saved')
    emit('close')
  } catch (error) {
    toast.error('保存失败', { description: (error as Error).message })
  }
}
</script>
