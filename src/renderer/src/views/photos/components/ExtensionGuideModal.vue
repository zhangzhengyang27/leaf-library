
const emit = defineEmits<{ close: [] }>()
const toast = useToast()

const extDir = ref<string | null>(null)
const port = ref<number | null>(null)
const token = ref('')
const copyState = ref('')

onMounted(async () => {
  try {
    extDir.value = await window.api.system.getExtensionDir()
  } catch {
    extDir.value = null
  }
  try {
    const cfg = await window.api.photos.clipServer.getConfig()
    port.value = cfg.port
    token.value = cfg.token ?? ''
  } catch {
    /* 剪藏服务未就绪 */
  }
})

function reveal(): void {
  if (extDir.value) void window.api.photos.showInFolder(extDir.value)
}

async function copyToken(): Promise<void> {
  const ok = await window.api.photos.copyText(token.value)
  if (ok) {
    copyState.value = 'Token 已复制，粘贴到扩展设置即可'
    toast.success('Token 已复制')
  } else {
    toast.error('复制失败')
  }
}
</script>

<style scoped>
.step-no {
  display: flex;
  height: 20px;
  width: 20px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--color-brand-500, #3b82f6);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}
</style>
