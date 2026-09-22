}

/** 单张就地替换（缩略图/EXIF 回填、收藏/评分/标签等增量更新） */
function replacePhotoLocal(updated: Photo): void {
  photoIndex.set(updated.id, updated)
  const replaceIn = (list: Photo[]): void => {
    const i = list.findIndex((p) => p.id === updated.id)
    if (i >= 0) list.splice(i, 1, updated)
  }
  replaceIn(allPhotos.value)
  replaceIn(albumPhotos.value)
  replaceIn(folderPhotos.value)
  replaceIn(smartAlbumPhotos.value)
  replaceIn(recycleBinPhotos.value)
  // 分页窗口池同步替换，否则收藏/搜索/固定入口视图里卡片状态陈旧（审查 P2-19）
  replaceIn(favoritesPhotos.value)
  replaceIn(searchPoolPhotos.value)
  replaceIn(unsortedPhotos.value)
  replaceIn(recentPhotos.value)
  for (const section of sections.value) replaceIn(section.photos)
}

export function usePhotoData(): {
  loading: typeof loading
  sections: typeof sections
  allPhotos: typeof allPhotos
  smartAlbums: typeof smartAlbums
  albums: typeof albums
  folders: typeof folders
  dictionaryTags: typeof dictionaryTags
