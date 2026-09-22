        error?: string
        mime?: string
        dataUrl?: string
      }>,
    readTextFile: (filePath: string, maxBytes?: number) =>
      ipcRenderer.invoke('photos:readTextFile', filePath, maxBytes),
    onEmbedding: (callback: (progress: { done: number; total: number; phase: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown): void =>
        callback(progress as Parameters<typeof callback>[0])
      ipcRenderer.on('photos:embedding', listener)
      return () => ipcRenderer.removeListener('photos:embedding', listener)
    },
    clipServer: {
      getConfig: () =>
        ipcRenderer.invoke('clipServer:getConfig') as Promise<{
