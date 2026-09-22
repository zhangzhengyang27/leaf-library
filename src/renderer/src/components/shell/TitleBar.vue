const tabs = useLibraryTabs()
const data = usePhotoData()
const filters = usePhotoFilters()
const actions = usePhotoActions()
const search = usePhotoSearch()
const runInLib = useRunInLibrary()
/** 二十七轮：搜索范围勾选集（Eagle ˅ 面板；与 usePhotoFilters 匹配共享单例） */
const searchScopes = useSearchScopes()
