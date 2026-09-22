}

onMounted(async () => {
  console.log('[capture-page] mounted, popSnapshot...')
  window.addEventListener('keydown', onGlobalKey, true)
  try {
    // startCapture 已在开窗前用主进程 desktopCapturer 预抓好整屏，这里只管取走
    const snap = await window.api.screenshot.popSnapshot()
    console.log('[capture-page] popSnapshot ok:', snap.ok)
    if (!snap.ok || !snap.dataUrl) throw new Error(snap.error ?? '快照不可用')
    snapshot.value = await loadImage(snap.dataUrl)
    console.log('[capture-page] snapshot loaded')
    settings.value = await window.api.screenshot.getSettings()
    // fullscreen / last 模式带初始区域直接进编辑
    if (props.session.mode === 'region') phase.value = 'select'
    else startEdit(props.session.initial)
    // 快照 img 渲染到 DOM 后再亮窗（主进程 blur/show 序列），杜绝空窗黑闪
    await nextTick()
    console.log('[capture-page] phase:', phase.value, '→ ready')
    await window.api.screenshot.ready()
  } catch (err) {
    console.log('[capture-page] error:', err)
    await window.api.screenshot.cancel('error', err instanceof Error ? err.message : String(err))
    window.close()
  }
})

onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey, true))

async function onCancel(source = 'unknown'): Promise<void> {
  console.log('[capture-page] cancel by', source)
  await window.api.screenshot.cancel('user')
  window.close()
}

async function onSave(payload: {
  dataUrl: string
  actions: ScreenshotSaveRequest['actions']
}): Promise<void> {
  const result: ScreenshotSaveResult = await window.api.screenshot.save({
    dataUrl: payload.dataUrl,
    displayId: props.session.displayId,
    region: region.value,
    actions: payload.actions
  })
  if (!result.ok) {
    showToast(result.error ?? '保存失败')
    return
  }
  window.close()
}

/** 顶层 Esc：loading 阶段也可取消 */
function onGlobalKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && phase.value === 'loading') void onCancel('loading-esc')
}
</script>
