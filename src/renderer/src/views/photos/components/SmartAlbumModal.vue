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

      <!-- M4 嵌套智能夹：父级选择（根级或任意非自身后代的智能夹）。
           求值语义：子级命中 = 子级规则 AND 全部祖先规则（Eagle 口径）；
           环在这里由候选集排除，主进程 repo 再兜一道 -->
      <div>
        <label class="mb-1 block text-xs text-fg-muted">父级智能夹</label>
        <select
          v-model="parentAlbumId"
          class="h-8 w-full rounded-md border border-line-default bg-surface-1 px-2 text-sm text-fg-primary focus:outline-none focus:border-brand-500"
        >
          <option :value="null">（根级 · 不嵌套）</option>
          <option v-for="c in parentCandidates" :key="c.id" :value="c.id">
            {{ '\u3000'.repeat(c.depth) }}{{ c.name }}
          </option>
        </select>
        <p v-if="parentAlbumId" class="mt-1 text-[11px] text-fg-muted">
          该夹将嵌套在父级之下：需要同时满足父级（及其全部上级）的规则才会命中。
        </p>
      </div>

      <!-- 标签（全部包含） -->
      <div v-if="availableTags.length > 0">
        <label class="mb-1 block text-xs text-fg-muted">
          匹配模式<span v-if="groups.length > 0">（基础条件与各条件组之间）</span>
        </label>
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
            <p
              v-if="semanticQuery.trim() && !semanticReady"
              class="mt-1 text-[11px] text-warning-600"
            >
              向量模型未下载：这条条件现在会判定为「无匹配」（相册显示空）， 到 设置 › 内容识别
              下载后自动生效。
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

          <!-- ── D-023 算子补齐：开头/结尾/正则/注释有无内容/添加日期相对窗 ──
               between 四键与拍摄/修改 within 只进组编辑器（顶层沿用 min/max 对与日期区间） -->
          <div>
            <label class="mb-1 block text-xs text-fg-muted">文件名开头为</label>
            <input
              v-model="nameBeginsWith"
              type="text"
              placeholder="如 IMG_"
              class="w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-muted">文件名结尾为</label>
            <input
              v-model="nameEndsWith"
              type="text"
              placeholder="如 .png"
              class="w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-muted"
              >文件名正则（JS 语法，大小写敏感）</label
            >
            <input
              v-model="nameRegex"
              type="text"
              placeholder="如 ^IMG_\d+\.png$"
              :class="[
                'w-full px-2 py-1 text-xs rounded border bg-surface-1 text-fg-primary',
                topLevelRegexError ? 'border-danger' : 'border-line-default'
              ]"
            />
            <p v-if="topLevelRegexError" class="mt-1 text-[11px] text-danger-500">
              {{ topLevelRegexError }}
            </p>
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-muted">注释内容</label>
            <select
              v-model="descriptionContentSel"
              class="h-7 w-full rounded border border-line-default bg-surface-1 px-2 text-xs text-fg-primary"
            >
              <option value="">不限</option>
              <option value="empty">没有内容</option>
              <option value="has">有内容</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-muted">添加于过去 N 天（滚动窗口）</label>
            <input
              v-model.number="importedWithinDays"
              type="number"
              min="0"
              placeholder="天数，如 7"
              class="w-full px-2 py-1 text-xs rounded border border-line-default bg-surface-1 text-fg-primary"
            />
          </div>
        </div>
      </fieldset>

      <!-- ── D-022 条件组（形状 v2）：与上方基础条件并存；组间连接词 = 顶部「匹配模式」，
           组内连接词/组级取反在各组的头部行。旧规则没有 groups 时这里为空，形状不变 ── -->
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="block text-xs text-fg-muted">条件组</label>
          <button
            type="button"
            class="rounded border border-line-default px-2 py-0.5 text-xs text-fg-secondary hover:border-brand-400 disabled:opacity-50"
            :disabled="groups.length >= MAX_GROUPS"
            :title="groups.length >= MAX_GROUPS ? `最多 ${MAX_GROUPS} 个条件组` : ''"
            @click="addGroup"
          >
            + 添加条件组
          </button>
        </div>

        <fieldset
          v-for="(g, gi) in groups"
          :key="gi"
          class="mb-2 rounded-md border border-line-default p-2"
        >
          <div class="mb-2 flex items-center gap-2">
            <span class="shrink-0 text-xs text-fg-muted">组 {{ gi + 1 }}</span>
            <select
              v-model="g.match"
              title="组内连接词"
              class="h-7 rounded border border-line-default bg-surface-1 px-1 text-xs text-fg-primary"
            >
              <option value="all">组内全部满足</option>
              <option value="any">组内任一满足</option>
            </select>
            <label
              class="flex items-center gap-1 text-xs text-fg-secondary"
              title="整组取反：这组条件都不满足才算命中"
            >
              <input v-model="g.not" type="checkbox" class="accent-brand-500" />
              不满足此组
            </label>
            <button
              type="button"
              class="ml-auto rounded border border-line-default px-2 py-0.5 text-xs text-fg-muted hover:border-danger hover:text-danger-500"
              @click="removeGroup(gi)"
            >
              删除组
            </button>
          </div>

          <div class="space-y-1.5">
            <div v-for="(row, ri) in g.rows" :key="ri" class="flex flex-wrap items-center gap-1.5">
              <select
                v-model="row.key"
                class="h-7 w-36 shrink-0 rounded border border-line-default bg-surface-1 px-1 text-xs text-fg-primary"
                @change="onRowKeyChange(row)"
              >
                <option v-for="d in GROUP_RULE_DEFS" :key="d.key" :value="d.key">
                  {{ d.label }}
                </option>
              </select>
              <!-- 值控件按键型分发：bool 勾选 / num 数字 / enum 下拉 / between 双输入 / text、list 文本（逗号分隔） -->
              <input
                v-if="rowDef(row.key)?.kind === 'bool'"
                v-model="row.value"
                type="checkbox"
                class="accent-brand-500"
              />
              <input
                v-else-if="rowDef(row.key)?.kind === 'num'"
                v-model.number="row.value"
                type="number"
                min="0"
                :placeholder="rowDef(row.key)?.placeholder ?? ''"
                class="h-7 w-28 rounded border border-line-default bg-surface-1 px-2 text-xs text-fg-primary"
              />
              <select
                v-else-if="rowDef(row.key)?.kind === 'enum'"
                v-model="row.value"
                class="h-7 w-36 rounded border border-line-default bg-surface-1 px-1 text-xs text-fg-primary"
              >
                <option
                  v-for="o in rowDef(row.key)?.options ?? []"
                  :key="String(o.value)"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
              <template v-else-if="rowDef(row.key)?.kind === 'between'">
                <input
                  type="number"
                  min="0"
                  :value="betweenParts(row)[0]"
                  class="h-7 w-20 rounded border border-line-default bg-surface-1 px-2 text-xs text-fg-primary"
                  placeholder="最小"
                  @input="setBetweenPart(row, 0, ($event.target as HTMLInputElement).value)"
                />
                <span class="text-xs text-fg-muted">~</span>
                <input
                  type="number"
                  min="0"
                  :value="betweenParts(row)[1]"
                  class="h-7 w-20 rounded border border-line-default bg-surface-1 px-2 text-xs text-fg-primary"
                  placeholder="最大"
                  @input="setBetweenPart(row, 1, ($event.target as HTMLInputElement).value)"
                />
              </template>
              <input
                v-else
                v-model="row.value"
                type="text"
                :placeholder="rowDef(row.key)?.placeholder ?? ''"
                class="h-7 min-w-0 flex-1 rounded border border-line-default bg-surface-1 px-2 text-xs text-fg-primary"
              />
              <button
                type="button"
                class="shrink-0 rounded px-1 text-xs text-fg-muted hover:text-danger-500"
                title="删除这条条件"
                @click="g.rows.splice(ri, 1)"
              >
                删除
              </button>
              <!-- D-023：正则行即时校验，行内报错（禁保存在 handleSave / 保存按钮双兜底） -->
              <p v-if="rowRegexError(row)" class="w-full text-[11px] text-danger-500">
                {{ rowRegexError(row) }}
              </p>
            </div>
          </div>

          <button
            type="button"
            class="mt-1.5 text-xs text-fg-muted hover:text-brand-500 disabled:opacity-50"
            :disabled="g.rows.length >= MAX_GROUP_ROWS"
            @click="addRow(g)"
          >
            + 添加条件
          </button>
          <p v-if="groupExtraKeys(g).length > 0" class="mt-1 text-[11px] text-warning-500">
            组内还有暂不支持编辑的条件，将原样保留：{{ groupExtraKeys(g).join('、') }}
          </p>
        </fieldset>
      </div>

      <p v-if="unownedLabels.length > 0" class="mb-2 text-[11px] text-warning-500">
        这条还带着编辑器暂不支持编辑的条件，将原样保留：{{ unownedLabels.join('、') }}
      </p>

      <p class="text-xs" :class="countError ? 'text-warning-500' : 'text-fg-muted'">
        {{
          countError
            ? `实时计数失败：${countError}`
            : matchCount === null
              ? '正在计算匹配数量...'
              : `当前条件匹配 ${matchCount} 张图片`
        }}
      </p>
    </div>

    <template #footer>
      <UButton variant="ghost" @click="$emit('close')">取消</UButton>
      <UButton
        variant="primary"
        :disabled="!name.trim() || hasRegexError"
        :title="hasRegexError ? '存在非法正则表达式' : ''"
        @click="handleSave"
      >
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
import {
  validateSmartAlbumRules,
  checkRegexPattern,
  type SmartAlbumRuleGroup
} from '@shared/smartAlbumRules'
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
// ── M4 嵌套智能夹：父级选择（null = 根级）。候选集排除自身与自身后代（防环，
//    与主进程 assertValidParent 同口径双保险）；实时计数按「子级 AND 待定父级祖先链」
const parentAlbumId = ref<string | null>(null)
const allSmartAlbums = ref<SmartAlbum[]>([])
const parentCandidates = computed<Array<{ id: string; name: string; depth: number }>>(() => {
  const byId = new Map(allSmartAlbums.value.map((a) => [a.id, a]))
  const selfId = props.album?.id ?? null
  const depthOf = (start: string | null): number => {
    let d = 0
    let pid: string | null | undefined = start
    const seen = new Set<string>()
    while (pid && !seen.has(pid)) {
      seen.add(pid)
      d += 1
      pid = byId.get(pid)?.parentId ?? null
    }
    return d
  }
  const isSelfDescendant = (candidateId: string): boolean => {
    if (!selfId) return false
    let pid: string | null | undefined = candidateId
    const seen = new Set<string>()
    while (pid && !seen.has(pid)) {
      if (pid === selfId) return true // 候选是自己的后代（或自己）→ 不能当父级
      seen.add(pid)
      pid = byId.get(pid)?.parentId ?? null
    }
    return false
  }
  return allSmartAlbums.value
    .filter((a) => a.id !== selfId && !isSelfDescendant(a.id))
    .map((a) => ({ id: a.id, name: a.name, depth: depthOf(a.parentId) }))
})
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
// —— D-023 算子补齐：文件名开头/结尾/正则、注释有无内容、添加日期相对窗 ——
const nameBeginsWith = ref('')
const nameEndsWith = ref('')
const nameRegex = ref('')
/** 注释内容三态：''=不限 / 'empty'=没有内容 / 'has'=有内容（映射 descriptionEmpty / descriptionHasContent） */
const descriptionContentSel = ref<'' | 'empty' | 'has'>('')
const importedWithinDays = ref<number | null>(null)
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
  // D-023 算子补齐：顶层有控件的键（between 四键与拍摄/修改 within 无顶层控件——
  // 顶层沿用 min/max 对与日期区间，故不入此表，脏规则经 passthrough 原样保留）
  'nameBeginsWith',
  'nameEndsWith',
  'nameRegex',
  'descriptionEmpty',
  'descriptionHasContent',
  'importedWithinDays',
  // D-022 条件组：由下方组容器接管（无组时不出该键，旧规则保存后形状不变）
  'groups',
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
  urlKeyword: '链接关键词',
  // D-023：between 四键与拍摄/修改 within 只有组内控件，顶层出现时念出来（原样保留）
  widthBetween: '宽度介于',
  heightBetween: '高度介于',
  fileSizeBetween: '大小介于',
  durationMsBetween: '时长介于',
  takenWithinDays: '拍摄于过去 N 天',
  modifiedWithinDays: '修改于过去 N 天'
}

const unownedLabels = computed<string[]>(() =>
  Object.keys(passthrough.value).map((k) => RULE_LABEL[k] ?? k)
)

// ── D-022 条件组（形状 v2）：组容器 + 组内规则行 ──
// 顶层表单继续编辑「基础条件」（顶层 rules）；条件组是与之并存的显式 groups。
// 组内规则行走「键 select + 值控件」的通用行（值型按 GROUP_RULE_DEFS 分发），
// 覆盖不到的键进 group.extra 原样保留（顶层 passthrough 的组级同款兜底）。

interface GroupRowDraft {
  key: string
  value: string | number | boolean | null
}
interface GroupDraft {
  match: 'any' | 'all'
  not: boolean
  rows: GroupRowDraft[]
  /** 组内暂不支持编辑的键，保存时原样带回 */
  extra: Record<string, unknown>
}

/** Eagle 的「30 组 × 30 条件」口径；距引擎组节点闸（SMART_ALBUM_MAX_NODES = 300）余量充足 */
const MAX_GROUPS = 30
const MAX_GROUP_ROWS = 30
const DEFAULT_ROW_KEY = 'keyword'

type GroupValueKind = 'bool' | 'num' | 'text' | 'list' | 'enum' | 'between'
interface GroupRuleDef {
  key: keyof SmartAlbumRules
  label: string
  kind: GroupValueKind
  /** enum 行的下拉选项 */
  options?: Array<{ value: number | string; label: string }>
  /** num 行的单位换算：界面 KB/秒 → 引擎 字节/毫秒（between 行同用） */
  scale?: number
  placeholder?: string
}

const GROUP_RULE_DEFS: GroupRuleDef[] = [
  { key: 'keyword', label: '文件名/描述含', kind: 'text', placeholder: '如 海报' },
  { key: 'excludeKeyword', label: '排除关键词', kind: 'text', placeholder: '如 临时' },
  // ── D-023 算子补齐（组内单行表达；正则行即时校验，非法禁保存） ──
  { key: 'nameBeginsWith', label: '文件名开头为', kind: 'text', placeholder: '如 IMG_' },
  { key: 'nameEndsWith', label: '文件名结尾为', kind: 'text', placeholder: '如 .png' },
  {
    key: 'nameRegex',
    label: '文件名正则',
    kind: 'text',
    placeholder: '如 ^IMG_\\d+\\.png$'
  },
  { key: 'descriptionEmpty', label: '注释没有内容', kind: 'bool' },
  { key: 'descriptionHasContent', label: '注释有内容', kind: 'bool' },
  { key: 'widthBetween', label: '宽度介于 (px)', kind: 'between' },
  { key: 'heightBetween', label: '高度介于 (px)', kind: 'between' },
  { key: 'fileSizeBetween', label: '大小介于 (KB)', kind: 'between', scale: 1024 },
  { key: 'durationMsBetween', label: '时长介于 (秒)', kind: 'between', scale: 1000 },
  { key: 'importedWithinDays', label: '添加于过去 N 天', kind: 'num', placeholder: '天数' },
  { key: 'takenWithinDays', label: '拍摄于过去 N 天', kind: 'num', placeholder: '天数' },
  { key: 'modifiedWithinDays', label: '修改于过去 N 天', kind: 'num', placeholder: '天数' },
  { key: 'favorite', label: '仅收藏', kind: 'bool' },
  {
    key: 'minRating',
    label: '最低评分',
    kind: 'enum',
    options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${'★'.repeat(n)} 起` }))
  },
  {
    key: 'annotationFilter',
    label: '标注',
    kind: 'enum',
    options: [
      { value: 'any', label: '有标注' },
      { value: 'none', label: '无标注' }
    ]
  },
  { key: 'minWidth', label: '最小宽度 px', kind: 'num' },
  { key: 'minHeight', label: '最小高度 px', kind: 'num' },
  { key: 'maxWidth', label: '最大宽度 px', kind: 'num' },
  { key: 'maxHeight', label: '最大高度 px', kind: 'num' },
  { key: 'minFileSize', label: '最小大小 (KB)', kind: 'num', scale: 1024 },
  { key: 'maxFileSize', label: '最大大小 (KB)', kind: 'num', scale: 1024 },
  { key: 'minDurationMs', label: '最短时长 (秒)', kind: 'num', scale: 1000 },
  { key: 'maxDurationMs', label: '最长时长 (秒)', kind: 'num', scale: 1000 },
  {
    key: 'resolutionMin',
    label: '分辨率下限（短边）',
    kind: 'enum',
    options: [
      { value: 1280, label: '≥1280（1K）' },
      { value: 1920, label: '≥1920（2K）' },
      { value: 3840, label: '≥3840（4K）' }
    ]
  },
  { key: 'fileExtsInclude', label: '扩展名包含', kind: 'list', placeholder: 'png, jpg' },
  { key: 'fileExtsExclude', label: '扩展名排除', kind: 'list', placeholder: 'gif, tmp' },
  { key: 'tagNamesAny', label: '标签名（任一）', kind: 'list', placeholder: '逗号分隔' },
  { key: 'tagNamesAll', label: '标签名（全部）', kind: 'list', placeholder: '逗号分隔' },
  { key: 'tagNamesExact', label: '标签名（完全一致）', kind: 'list', placeholder: '逗号分隔' },
  { key: 'tagNamesExclude', label: '标签名（排除）', kind: 'list', placeholder: '逗号分隔' },
  { key: 'untaggedOnly', label: '仅看未标签', kind: 'bool' }
]

const groups = ref<GroupDraft[]>([])

const rowDef = (key: string): GroupRuleDef | undefined => GROUP_RULE_DEFS.find((d) => d.key === key)
const groupExtraKeys = (g: GroupDraft): string[] => Object.keys(g.extra)

function defaultValueFor(def: GroupRuleDef): string | number | boolean | null {
  if (def.kind === 'bool') return true
  if (def.kind === 'num') return null
  if (def.kind === 'enum') return def.options?.[0]?.value ?? ''
  return ''
}

function addGroup(): void {
  if (groups.value.length < MAX_GROUPS)
    groups.value.push({ match: 'all', not: false, rows: [], extra: {} })
}
function removeGroup(index: number): void {
  groups.value.splice(index, 1)
}
function addRow(g: GroupDraft): void {
  if (g.rows.length < MAX_GROUP_ROWS) g.rows.push({ key: DEFAULT_ROW_KEY, value: '' })
}
/** 换键时值必须跟着键型重置，否则数字会串进文本框 */
function onRowKeyChange(row: GroupRowDraft): void {
  const def = rowDef(row.key)
  row.value = def ? defaultValueFor(def) : ''
}

// ── D-023 between 行：值以 'min~max' 文本承载，两个数字输入各持一半 ──
function betweenParts(row: GroupRowDraft): [string, string] {
  const parts = typeof row.value === 'string' ? row.value.split('~') : []
  return [parts[0] ?? '', parts[1] ?? '']
}
function setBetweenPart(row: GroupRowDraft, idx: 0 | 1, raw: string): void {
  const parts = betweenParts(row)
  parts[idx] = raw
  row.value = `${parts[0]}~${parts[1]}`
}

// ── D-023 正则即时校验：顶层输入与组内正则行共用 checkRegexPattern 单源。
//    非法正则行内报错并禁保存——不让一条查询期必炸的规则走进库 ──
const topLevelRegexError = computed(() => {
  const p = nameRegex.value.trim()
  return p === '' ? null : checkRegexPattern(p)
})
function rowRegexError(row: GroupRowDraft): string | null {
  return row.key === 'nameRegex' && typeof row.value === 'string' && row.value.trim() !== ''
    ? checkRegexPattern(row.value.trim())
    : null
}
const hasRegexError = computed(() => {
  if (topLevelRegexError.value) return true
  return groups.value.some((g) => g.rows.some((row) => rowRegexError(row) !== null))
})

/** 组内 list 行的拆分：trim 逗号分段；扩展名键再归一成无点小写（与顶层 fileExtsInclude 同口径） */
function splitListValue(def: GroupRuleDef, raw: string): string[] {
  const arr = raw
    .split(/[,，、]/)
    .map((x) => x.trim())
    .filter(Boolean)
  const isExt = def.key === 'fileExtsInclude' || def.key === 'fileExtsExclude'
  return isExt ? arr.map((x) => x.replace(/^\./, '').toLowerCase()) : arr
}

/** 一行草稿 → 规则键值；空值（未填/未勾）返回 undefined = 该行不下发 */
function rowToRuleValue(def: GroupRuleDef, row: GroupRowDraft): unknown {
  const v = row.value
  switch (def.kind) {
    case 'bool':
      return v === true ? true : undefined
    case 'num': {
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0
      if (n <= 0) return undefined
      return def.scale ? n * def.scale : n
    }
    case 'enum':
      return v === '' || v === null || v === undefined ? undefined : v
    case 'text': {
      const s = typeof v === 'string' ? v.trim() : ''
      return s === '' ? undefined : s
    }
    case 'list': {
      if (typeof v !== 'string') return undefined
      const arr = splitListValue(def, v)
      return arr.length > 0 ? arr : undefined
    }
    case 'between': {
      // 值形态 'min~max'（两个数字输入拼接的中间态允许留空）；两端齐且 hi≥lo 才下发
      if (typeof v !== 'string') return undefined
      const [loRaw, hiRaw] = v.split('~')
      if (loRaw === '' || hiRaw === '') return undefined
      const lo = Number(loRaw)
      const hi = Number(hiRaw)
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || hi <= 0) return undefined
      return def.scale ? [Math.round(lo * def.scale), Math.round(hi * def.scale)] : [lo, hi]
    }
  }
}

/** 已存组规则 → 行草稿 + 兜底集：描述表管得了的键进行，其余原样留在 extra */
function rowsFromGroupRules(rules: Record<string, unknown>): {
  rows: GroupRowDraft[]
  extra: Record<string, unknown>
} {
  const rest: Record<string, unknown> = { ...rules }
  const rows: GroupRowDraft[] = []
  for (const def of GROUP_RULE_DEFS) {
    const v = rest[def.key]
    if (v === undefined || v === null) continue
    let consumed: string | number | boolean | null | undefined
    if (def.kind === 'bool' && typeof v === 'boolean') consumed = v
    else if (def.kind === 'num' && typeof v === 'number' && Number.isFinite(v))
      consumed = def.scale ? Math.round((v / def.scale) * 100) / 100 : v
    else if (def.kind === 'enum' && def.options?.some((o) => o.value === v))
      consumed = v as string | number
    else if (def.kind === 'text' && typeof v === 'string') consumed = v
    else if (def.kind === 'list' && Array.isArray(v) && v.every((x) => typeof x === 'string'))
      consumed = (v as string[]).join(', ')
    else if (
      def.kind === 'between' &&
      Array.isArray(v) &&
      v.length === 2 &&
      v.every((x) => typeof x === 'number' && Number.isFinite(x))
    )
      consumed = (v as number[])
        .map((x) => (def.scale ? Math.round((x / def.scale) * 100) / 100 : x))
        .join('~')
    if (consumed === undefined) continue // 键认识、值型不认识 → 留在 extra 不动
    rows.push({ key: def.key, value: consumed })
    delete rest[def.key]
  }
  return { rows, extra: rest }
}

/** 组草稿 → v2 组形状（match 显式写出；not 仅在取反时出现） */
function serializeGroup(g: GroupDraft): SmartAlbumRuleGroup {
  const rules: Record<string, unknown> = { ...g.extra }
  for (const row of g.rows) {
    const def = rowDef(row.key)
    const v = def ? rowToRuleValue(def, row) : row.value
    if (v !== undefined) rules[row.key] = v
  }
  const out: SmartAlbumRuleGroup = { match: g.match, rules: rules as SmartAlbumRules }
  if (g.not) out.not = true
  return out
}

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
    // M4：编辑既有夹时回填其父级（null = 根级）
    parentAlbumId.value = a?.parentId ?? null
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
    // D-023 算子补齐回填
    nameBeginsWith.value = src.nameBeginsWith ?? ''
    nameEndsWith.value = src.nameEndsWith ?? ''
    nameRegex.value = src.nameRegex ?? ''
    descriptionContentSel.value =
      src.descriptionEmpty === true ? 'empty' : src.descriptionHasContent === true ? 'has' : ''
    importedWithinDays.value = src.importedWithinDays ?? null
    closeHex.value = src.colorClose?.hex ?? ''
    closeAccuracy.value = src.colorClose?.accuracy ?? 20
    extExclude.value = [...(src.fileExtsExclude ?? [])]
    // D-022 条件组回填：描述表管得了的键进行，其余原样进组内 extra 兜底
    groups.value = (src.groups ?? []).map((g) => {
      const { rows, extra } = rowsFromGroupRules((g.rules ?? {}) as Record<string, unknown>)
      return { match: g.match === 'any' ? 'any' : 'all', not: g.not === true, rows, extra }
    })
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
  // M4 父级候选（排除自身/自身后代见 parentCandidates）
  try {
    allSmartAlbums.value = await window.api.photos.listSmartAlbums()
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
  // D-023 算子补齐写回（正则只在通过校验时下发——非法时禁保存兜底，这里不放行脏值）
  if (nameBeginsWith.value.trim()) rules.nameBeginsWith = nameBeginsWith.value.trim()
  if (nameEndsWith.value.trim()) rules.nameEndsWith = nameEndsWith.value.trim()
  if (nameRegex.value.trim() && !topLevelRegexError.value) rules.nameRegex = nameRegex.value.trim()
  if (descriptionContentSel.value === 'empty') rules.descriptionEmpty = true
  else if (descriptionContentSel.value === 'has') rules.descriptionHasContent = true
  if (typeof importedWithinDays.value === 'number' && importedWithinDays.value > 0)
    rules.importedWithinDays = Math.round(importedWithinDays.value)
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
  // D-022 条件组写回：只产出「真实存在且组内有条件」的 groups——
  // 旧规则（无组）保存后形状不变（读侧/命中集都不动），空组不留死键
  const serializedGroups = groups.value
    .map(serializeGroup)
    .filter((g) => Object.keys((g.rules ?? {}) as object).length > 0)
  if (serializedGroups.length > 0) rules.groups = serializedGroups
  return { ...passthrough.value, ...rules }
})

// 条件变化时实时试跑匹配数量（防抖 300ms + 序号守卫：
// 慢的旧请求回来时不得覆盖新一轮计数；卸载后定时器不再触发全库查询；
// 引擎拒编译（超限/结构损坏）时把错误念在计数行上，而不是永远「正在计算」）
// M4：父级选择也进依赖——计数按「当前规则 AND 待定父级的祖先链」口径，
// 与保存后打开该夹看到的一致（编辑既有夹时 excludeId 把自己摘出链条）
const countError = ref('')
let debounceTimer: number | undefined
let rulesQuerySeq = 0
watch(
  [currentRules, parentAlbumId],
  () => {
    window.clearTimeout(debounceTimer)
    const seq = ++rulesQuerySeq
    debounceTimer = window.setTimeout(async () => {
      if (seq !== rulesQuerySeq) return
      try {
        const result = await window.api.photos.queryPhotosByRules(currentRules.value, {
          parentId: parentAlbumId.value,
          excludeId: props.album?.id
        })
        if (seq !== rulesQuerySeq) return
        matchCount.value = result.length
        countError.value = ''
      } catch (error) {
        if (seq === rulesQuerySeq) {
          matchCount.value = null
          countError.value = (error as Error)?.message ?? '未知错误'
        }
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
  // D-023：非法正则禁保存（行内已报错，这里再挡一道防回车直提）
  if (hasRegexError.value) {
    toast.error('无法保存', { description: '存在非法正则表达式，请先修正标红的条件' })
    return
  }
  // D-022：保存前按 v2 结构校验（口径与主进程引擎一致：深度/组节点上限、组形状）。
  // 不能把一条查询期必炸的规则存进库——编辑器是嵌套规则的唯一合法写入方，
  // 这里挡住之后主进程保存链无需加第二道校验
  const check = validateSmartAlbumRules(currentRules.value)
  if (!check.ok) {
    toast.error('无法保存', { description: check.error })
    return
  }
  try {
    if (props.album) {
      await window.api.photos.updateSmartAlbum(props.album.id, {
        name: trimmed,
        rules: currentRules.value,
        // M4：父级随保存下发（null = 移回根级；环由主进程 assertValidParent 拒绝）
        parentId: parentAlbumId.value
      })
      toast.success('智能文件夹已更新')
    } else {
      await window.api.photos.createSmartAlbum(trimmed, currentRules.value, parentAlbumId.value)
      toast.success('智能文件夹已创建')
    }
    emit('saved')
    emit('close')
  } catch (error) {
    toast.error('保存失败', { description: (error as Error).message })
  }
}
</script>
