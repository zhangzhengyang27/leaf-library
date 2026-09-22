
const data = usePhotoData()
const tabs = useLibraryTabs()
const selection = usePhotoSelection()
const search = usePhotoSearch()

type TabKey = 'folder' | 'tag' | 'smart' | 'doc'
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'folder', label: '文件夹' },
  { key: 'tag', label: '标签' },
  { key: 'smart', label: '智能文件夹' },
