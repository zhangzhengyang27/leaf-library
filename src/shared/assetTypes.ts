/** 素材类型工具（主进程/渲染端共用，无 DOM/Node 依赖） */

export type AssetKind = 'image' | 'video' | 'audio' | 'font' | 'text' | 'file' | 'bookmark'

export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2', 'ttc']

/** F4：文本类（txt/md/html 等可预览内容） */
export const TEXT_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'log',
  'csv',
  'json',
  'yml',
  'yaml',
  'html',
  'htm'
]

/**
 * 代码/配置类源文件。刻意**不影响 kindOfExt**（仍判 'file'）：kind 是入库时算好的，
 * 把它改成 'text' 会让同一扩展名在新旧素材之间分叉（现有 4,200+ 条全是 'file'），
 * 类型筛选维度会跟着错。这条只表示「按文本预览」。
 *
 * 为什么值得单列一份：用户当前库 5,178 条素材里 3,547 条是这类文件
 * （js 1360 / d.ts 1193 / ts 249 / sh / py…，实测自 leaf.db），
 * 而它们原先在预览里连正文都不显示——TEXT_EXTENSIONS 里没有它，
 * isTextFile 为 false 就直接落到"兜底卡片 + 双击用系统程序打开"。
 *
 * 不含 svg：它在 IMAGE_EXTENSIONS 里，作为图片素材用；
 * 不含 map/lock：source map 与 lockfile 是机器产物，整片读进来没有意义（且极大）。
 */
export const CODE_EXTENSIONS = [
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'mts',
  'cts',
  'xml',
  'css',
  'scss',
  'sass',
  'less',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'swift',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'toml',
  'ini',
  'conf',
  'env',
  'sql',
  'php',
  'pl',
  'lua',
  'r',
  'dart',
  'vue',
  'svelte',
  'graphql',
  'proto'
]

/**
 * 可归类为视频、但 <video> 实测播不了的容器/裸流（Electron 38 = Chromium 140，
 * macOS arm64，逐容器实测见 docs/格式扩展调研-2026-09.md）。仍能抽帧出封面。
 * 注意：可播性取决于容器 + 编码，`mov` 里的 ProRes 同样播不了，故此处只列容器级结论。
 *
 * 刻意不含 ts / mts：Eagle 的格式表里有它俩（MPEG-TS），但在代码类素材语境下
 * `.ts`/`.mts` 是 TypeScript 源文件，列进来会让 kindOfExt 把源码判成视频、
 * 对每个 .ts 起两次 ffmpeg 抽帧后落成"处理失败"卡。m2ts 无此歧义故保留。
 */
export const TRANSCODE_ONLY_VIDEO_EXTENSIONS = [
  'avi',
  'wmv',
  'flv',
  'f4v',
  'mpeg',
  'mpg',
  'm2ts',
  'hevc',
  'h265'
]

/** Chromium 实测可直接播放的视频容器 */
export const PLAYABLE_VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'mkv', '3gp']

export const VIDEO_EXTENSIONS = [...PLAYABLE_VIDEO_EXTENSIONS, ...TRANSCODE_ONLY_VIDEO_EXTENSIONS]

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'opus', 'wma']

/**
 * 位图长尾：sharp（随包 libvips 无 MagickCore/OpenEXR/OpenJPEG）解不了，
 * 由自带 ffmpeg 兜底光栅化。归类仍是 'image'，可进 pHash/色板/语义索引链路。
 * bmp 也在这里——libvips 8.18.6 无 bmp 加载器，此前它躺在 IMAGE 组里，
 * 实际每张 bmp 都落 thumbStatus=2 变字母卡（守卫用例抓出来的现存 bug）。
 */
export const RASTER_EXTENSIONS = ['bmp', 'exr', 'tga', 'dpx', 'sgi', 'jp2']

/** 可按条目浏览内容的归档（kind 仍是 'file'，预览走 zipBrowse） */
export const ARCHIVE_EXTENSIONS = ['zip']

/**
 * 走 officeparser 抽正文的文档格式（D 轴「可检索」）。
 * 与 ARCHIVE/IMAGE 组一样不改 kind——正文落 photo_photos.doc_text，
 * 由 photo_fts 统一索引。legacy .doc/.xls/.ppt 不在内（officeparser 不支持）。
 */
export const OFFICE_DOC_EXTENSIONS = [
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'epub',
  'pdf'
]

/**
 * 相机 RAW（G4）。**注意语义**：这批扩展名进的是「借系统出代表图」那条路，
 * 不是「我们能解码」——Eagle 也不解 RAW，取的是内嵌预览 + dcraw identify 的机参数。
 * 本机没有 RAW 样本，所以这条只保证路由与失败兜底，不宣称缩略图必然出得来。
 */
/**
 * 可以"就地编辑"（旋转/翻转后原样写回）的格式。
 *
 * 单源放这里：主进程拿它挡写回，渲染层拿它决定按钮显不显示。
 * 各写一份的话，界面会显示一颗按下去必然失败的按钮。
 * HEIC/RAW/PSD 一律排除——把底片或分层稿重编码成 JPEG 是毁数据，
 * 宁可让用户先转格式。
 */
export const EDITABLE_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.tif',
  '.tiff',
  '.avif'
] as const

/** 文件名是否属于可就地编辑的格式（小写含点扩展名比对；无扩展名一律不算） */
export function isEditableImageFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return false
  return (EDITABLE_IMAGE_EXTENSIONS as readonly string[]).includes(
    fileName.slice(dot).toLowerCase()
  )
}

export const CAMERA_RAW_EXTENSIONS = [
  'arw',
  'cr2',
  'cr3',
  'crw',
  'dng',
  'nef',
  'nrw',
  'raf',
  'rw2',
  'orf',
  'pef',
  '3fr',
  'erf',
  'srw',
  'sr2',
  'x3f',
  'mrw',
  'raw'
]

/**
 * 我们自己没有解码器、但 macOS 系统（sips/ImageIO → QuickLook）大概率能出代表图的族：
 * 相机 RAW + iWork + Adobe/Affinity/矢量/CAD/mindmap。
 * 与 OFFICE_DOC_EXTENSIONS 有重叠（docx 等）是故意的：正文抽取走 officeparser，
 * 代表图走系统，两条轴各自独立。
 */
export const SYSTEM_PREVIEW_EXTENSIONS: string[] = [
  ...CAMERA_RAW_EXTENSIONS,
  // open-format Office 才是今天的主流；只登记 doc/xls/ppt 会让最常见的样本落回字母卡
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'epub',
  'doc',
  'xls',
  'ppt',
  'key',
  'pages',
  'numbers',
  'ai',
  'ait',
  'eps',
  'psb',
  'af',
  'afdesign',
  'afphoto',
  'afpub',
  'indd',
  'indt',
  'idml',
  'xd',
  'sketch',
  'fig',
  'cdr',
  'pxd',
  'clip',
  'c4d',
  'blend'
]

/** 该文件是否该试「借系统出代表图」（G4；仅在 kind 为 file 时才会被问到） */
export function isSystemPreviewFile(fileName: string): boolean {
  return SYSTEM_PREVIEW_EXTENSIONS.includes(extensionOf(fileName))
}

/**
 * 正文可入索引的全部格式：officeparser 组 + 本来就是纯文本的 TEXT 组。
 * 今天 txt/md/csv 的内容搜不到（只搜文件名），接上这条链路是净收益。
 */
export const SEARCHABLE_TEXT_EXTENSIONS: string[] = [...OFFICE_DOC_EXTENSIONS, ...TEXT_EXTENSIONS]

/**
 * 「人写的代码」判定：机器产物不进全文索引。
 *
 * 为什么不看大小而看名字：`lib.dom.d.ts` 只有 1.8MB 却全是重复签名，
 * `*.min.js` 更小但整片是噪声；反过来一份 20KB 的手写模块值得索引。
 * 大小这条腿由 DocTextService 在 stat 之后另外卡（那里才有真字节数）。
 */
const BULK_CODE_NAME = /(?:\.d\.m?ts|\.min\.(?:js|css)|\.bundle\.(?:js|css))$/i

/** 是否是"值得索引正文"的代码文件（扩展名是代码类，且不是声明/打包产物） */
export function isIndexableCodeFile(fileName: string): boolean {
  const ext = extensionOf(fileName)
  if (!CODE_EXTENSIONS.includes(ext)) return false
  return !BULK_CODE_NAME.test(fileName.toLowerCase())
}

/**
 * 「待抽取」SQL 用的扩展名集合。
 *
 * 比 isDocTextFile 宽：SQL 只能按扩展名筛，声明文件与 min 产物会先被捞进清单，
 * 再由 DocTextService 逐条判掉并落 `''`（认账）。两侧口径不一致是有意的，
 * 但必须是"宽的捞、窄的判"，反过来会让文件永远留在待抽取清单里空转。
 */
export const DOC_TEXT_QUERY_EXTENSIONS: string[] = [
  ...SEARCHABLE_TEXT_EXTENSIONS,
  ...CODE_EXTENSIONS
]

export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'jpe',
  'jfif',
  'png',
  'gif',
  'webp',
  'svg',
  'heic',
  'heif',
  'hif',
  'avif',
  'psd',
  'ai',
  'tif',
  'tiff',
  'pdf'
]

export const FIVE_KINDS: AssetKind[] = ['image', 'video', 'audio', 'font', 'file']

/** 六期：+书签（URL 收集）。书签不经 kindOfExt（无文件扩展名语义），仅由显式 API 创建 */
export const ALL_KINDS: AssetKind[] = [...FIVE_KINDS, 'bookmark']

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : ''
}

/** 按扩展名归类素材类型；未知扩展 → 'file'（兜底卡片） */
export function kindOfExt(fileNameOrExt: string): AssetKind {
  const ext = extensionOf(fileNameOrExt.includes('.') ? fileNameOrExt : `.${fileNameOrExt}`)
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio'
  if (FONT_EXTENSIONS.includes(ext)) return 'font'
  if (IMAGE_EXTENSIONS.includes(ext) || RASTER_EXTENSIONS.includes(ext)) return 'image'
  if (TEXT_EXTENSIONS.includes(ext)) return 'text'
  return 'file'
}

/**
 * 扩展名属于"能当文本打开的内容"。注意别用 kind 代替：从 Eagle 库导入的素材 kind
 * 沿用源记录（文本文件也标 'file'），只有扩展名是可信的。
 *
 * 代码类（CODE_EXTENSIONS）也在内，但 kind 仍是 'file'——这条只决定"能不能按文本预览"，
 * 不参与类型归类与筛选维度（那会把同一扩展名在新旧素材之间劈成两种 kind）。
 * 正文全文索引是另一条闸（isDocTextFile）：只收"人写的"代码，见 isIndexableCodeFile。
 */
export function isTextFile(fileName: string): boolean {
  const ext = extensionOf(fileName)
  return TEXT_EXTENSIONS.includes(ext) || CODE_EXTENSIONS.includes(ext)
}

/** 需要走 ffmpeg 兜底光栅化的位图（sharp 解不了） */
export function isRasterFile(fileName: string): boolean {
  return RASTER_EXTENSIONS.includes(extensionOf(fileName))
}

/** 归档类（kind 仍是 file，但预览器按条目展开） */
export function isArchiveFile(fileName: string): boolean {
  return ARCHIVE_EXTENSIONS.includes(extensionOf(fileName))
}

/** 正文可抽取并入全文索引的格式（doc_text 链路的入口判定） */
export function isDocTextFile(fileName: string): boolean {
  return SEARCHABLE_TEXT_EXTENSIONS.includes(extensionOf(fileName)) || isIndexableCodeFile(fileName)
}

/** <video> 能否直接播该容器；false = 只有封面，需系统播放器或转码代理 */
export function isPlayableVideoFile(fileName: string): boolean {
  return PLAYABLE_VIDEO_EXTENSIONS.includes(extensionOf(fileName))
}

/** 「格式」筛选维度的候选值：所有可归类扩展名的并集（按类型分组排序，去重） */
export const FORMAT_FILTER_EXTENSIONS: string[] = [
  ...new Set([
    ...IMAGE_EXTENSIONS,
    ...RASTER_EXTENSIONS,
    ...VIDEO_EXTENSIONS,
    ...AUDIO_EXTENSIONS,
    ...FONT_EXTENSIONS,
    ...TEXT_EXTENSIONS,
    ...OFFICE_DOC_EXTENSIONS,
    ...ARCHIVE_EXTENSIONS
  ])
]

export function isFontFile(fileName: string): boolean {
  return kindOfExt(fileName) === 'font'
}

export const KIND_LABELS: Record<AssetKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  font: '字体',
  text: '文本',
  file: '文件',
  bookmark: '书签'
}
