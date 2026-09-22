// —— D-012 就地重命名 ——

const renameValue = ref('')
const renamingPhotoId = ref<string | null>(null)

function startRename(p: Photo): void {
  renamingPhotoId.value = p.id
  // 预选主文件名（不含扩展名），与 Finder 习惯一致
  renameValue.value = p.fileName
  renameSettled = false
  void nextTick(() => {
    const input = gridEl.value?.querySelector<HTMLInputElement>('input[data-rename-input]')
    if (input) {
      input.focus()
      const dot = p.fileName.lastIndexOf('.')
      input.setSelectionRange(0, dot > 0 ? dot : p.fileName.length)
    }
  })
}
let renameSettled = false

function flatPhotos(): Photo[] {
  return props.sections.flatMap((s) => s.photos)
}
function commitRename(p: Photo): void {
  if (renameSettled) return
  renameSettled = true
  if (renameValue.value.trim() && renameValue.value !== p.fileName) {
    emit('rename-commit', p, renameValue.value)
  } else {
    emit('rename-cancel')
  }
}

// —— ③ 窗口化渲染：大库下只挂载前 N 张，触底经 IntersectionObserver 增量加载，避免万级 DOM 常驻 ——
const RENDER_STEP = 300
const visibleCount = ref(RENDER_STEP)
const sentinel = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null

const totalCount = computed(() => props.sections.reduce((n, s) => n + s.photos.length, 0))
const cappedSections = computed<PhotoSection[]>(() => {
  let budget = visibleCount.value
  const out: PhotoSection[] = []
  for (const s of props.sections) {
    if (budget <= 0) break
    const take = Math.min(s.photos.length, budget)
    out.push({ dateSection: s.dateSection, photos: s.photos.slice(0, take) })
    budget -= take
  }
  return out
})

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

watch(totalCount, (n, o) => {
  // 仅收缩时重置渲染窗口：分页追加（阶段 2）会让 count 增长，
  // 若无脑重置会把用户已滚到的位置弹回顶部
  if (n < o) visibleCount.value = RENDER_STEP
})

// D-012：父层（右键「重命名」/ F2 / ⌘R）通过 renamingId prop 驱动就地重命名；
// 旧实现从未读取该 prop，入口全部静默失效（审查 P1-11）
watch(
  () => props.renamingId,
  (id) => {
    if (!id) {
      if (renamingPhotoId.value) renamingPhotoId.value = null
      return
    }
    if (renamingPhotoId.value === id) return
    const target = flatPhotos().find((p) => p.id === id)
    if (target) startRename(target)
  }
)

watch(
  () => sentinel.value,
  (el) => {
    io?.disconnect()
    io = null
    if (!el) return
    const scroller = scrollParentOf(el)
    io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        if (visibleCount.value < totalCount.value) {
          visibleCount.value += RENDER_STEP
        } else if (props.hasMore) {
          // 已渲染完已加载项但数据源还有下一页：请求父级追加
          emit('load-more')
        }
      },
      { root: scroller, rootMargin: '800px' }
    )
    io.observe(el)
    // 代码审查 S7：双向窗口——滚到底再回顶时收缩窗口，
    // 避免「只增不减」导致 5 万 DOM 常驻内存
    if (scroller && scroller !== scrollEl) {
      scrollEl = scroller
      const onScroll = (): void => {
        if (visibleCount.value <= RENDER_STEP) return
        if (scroller.scrollTop < scroller.clientHeight * 2) {
          visibleCount.value = RENDER_STEP
        }
      }
      scroller.addEventListener('scroll', onScroll, { passive: true })
      scrollCleanup = () => {
        scroller.removeEventListener('scroll', onScroll)
        scrollCleanup = null
      }
    }
  },
  { immediate: true }
)

let scrollEl: HTMLElement | null = null
let scrollCleanup: (() => void) | null = null
onUnmounted(() => {
  io?.disconnect()
  scrollCleanup?.()
})
