// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * 侧栏文件夹行接外部拖入（Eagle uploadFolderToSidebar(path, parent)）：
 * 落点决定导入目标文件夹，而不是「当前打开的视图」。
 * 断言落在 dropFilesTo → window.api.photos.importPaths 的实参上。
 */

const importPaths = vi.hoisted(() =>
  vi.fn(async (..._args: [string[], string | null]) => [] as unknown[])
)
const getPathForFile = vi.hoisted(() => vi.fn((_f: { name: string }) => ''))
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}))

Object.defineProperty(window, 'api', {
  value: { photos: { importPaths }, getPathForFile },
  writable: true
})

vi.mock('@composables/useToast', () => ({ useToast: () => toast }))
vi.mock('../usePhotoData', () => ({
  usePhotoData: () => ({
    loading: { value: false },
    loadFolders: vi.fn(async () => {}),
    refreshAllPools: vi.fn(async () => {})
  })
}))
vi.mock('../usePhotoClipboard', () => ({
  usePhotoClipboard: () => ({ cutPhotoIds: { value: [] } })
}))

import { usePhotoImport } from '../usePhotoImport'
import { useLibraryTabs } from '@renderer/stores/libraryTabs'

setActivePinia(createPinia())

/** 造一个只带 dataTransfer 的假 DragEvent（happy-dom 没有 DataTransfer） */
function dropEvent(files: Array<Record<string, unknown>>): DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { files, types: ['Files'] }
  } as unknown as DragEvent
}

beforeEach(() => {
  importPaths.mockClear()
  getPathForFile.mockReset()
  getPathForFile.mockImplementation(() => '')
  toast.error.mockClear()
  toast.info.mockClear()
})

describe('dropFilesTo（落点 → 目标文件夹）', () => {
  it('拖到某个文件夹行上：importPaths 收到该文件夹 id，而不是当前视图', async () => {
    const tabs = useLibraryTabs()
    tabs.tab.view = 'all' // 当前视图不是文件夹
    getPathForFile.mockImplementation((f: { name: string }) => `/tmp/drop/${f.name}`)
    const e = dropEvent([{ name: 'a.png' }, { name: 'b.png' }])

    await usePhotoImport().dropFilesTo(e, 'folder-7')

    expect(importPaths).toHaveBeenCalledTimes(1)
    expect(importPaths.mock.calls[0][0]).toEqual(['/tmp/drop/a.png', '/tmp/drop/b.png'])
    expect(importPaths.mock.calls[0][1]).toBe('folder-7')
  })

  it('无目标（null）= 导入到侧栏根级', async () => {
    getPathForFile.mockImplementation((f: { name: string }) => `/tmp/drop/${f.name}`)
    await usePhotoImport().dropFilesTo(dropEvent([{ name: 'a.png' }]), null)
    expect(importPaths.mock.calls[0][1]).toBeNull()
  })

  it('webUtils 换不到路径时回退 File.path（Electron 32 之前的形态）', async () => {
    await usePhotoImport().dropFilesTo(
      dropEvent([{ name: 'legacy.png', path: '/old/legacy.png' }]),
      'f1'
    )
    expect(importPaths.mock.calls[0][0]).toEqual(['/old/legacy.png'])
  })

  it('路径全解析失败：不导入，给出可诊断的错误提示', async () => {
    const e = dropEvent([{ name: 'ghost.png', type: 'text/plain' }])
    await usePhotoImport().dropFilesTo(e, 'f1')
    expect(importPaths).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('1/1 项解析失败'),
      expect.anything()
    )
  })

  it('空的 Files 拖拽：提示没检测到文件而不是静默', async () => {
    await usePhotoImport().dropFilesTo(dropEvent([]), 'f1')
    expect(importPaths).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('没有检测到可导入的文件')
  })
})
