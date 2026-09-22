  } catch (error) {
    useToast().error('插件市场加载失败', { description: (error as Error).message })
  } finally {
    marketLoading.value = false
  }
}

const installingId = ref<string | null>(null)

async function installBuiltin(id: string): Promise<void> {
  // pending 防重（审查 P3-61）：await 期间 plugins 未刷新，isInstalled 仍为
  // false，双击会重复安装
  if (installingId.value) return
  installingId.value = id
  try {
    const res = await window.api.plugins.installBuiltin(id)
    if (res.ok) {
      useToast().success('插件已安装')
      await load()
    } else {
      useToast().error('安装失败', { description: res.error || '未知错误' })
    }
  } catch (error) {
    useToast().error('安装失败', { description: (error as Error).message })
  } finally {
    installingId.value = null
  }
}

function showMarket(): void {
  marketTab.value = true
  void loadMarket()
}

function isInstalled(id: string): boolean {
  return plugins.value.some((p) => p.id === id)
}

async function pickExtraDir(): Promise<void> {
  try {
    const list = await window.api.plugins.pickExtraDir()
    if (list) {
      plugins.value = list as InstalledPlugin[]
      extraDir.value = await window.api.plugins.getExtraDir()
      useToast().success('已加载自定义插件目录')
    }
  } catch (error) {
    useToast().error('选择插件目录失败', { description: (error as Error).message })
  }
}

async function clearExtraDir(): Promise<void> {
  try {
    await window.api.plugins.setExtraDir('')
    await load()
    useToast().success('已恢复默认插件目录')
  } catch (error) {
    useToast().error('恢复默认目录失败', { description: (error as Error).message })
  }
}

onMounted(load)
</script>

<template>
