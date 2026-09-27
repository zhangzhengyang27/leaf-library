/**
 * 插件中心共享类型（D-025）：主进程 PluginService 与渲染层注册表/面板共用一份。
 * 布局字段向 Eagle 生态命名对齐；运行 API 是 Leaf 沙箱桥（不兼容 Eagle 插件本体）。
 */
export type PluginCategory = 'inspector' | 'format' | 'window' | 'development'

export interface PluginManifest {
  id: string
  name: string
  version: string
  category: PluginCategory
  /** 相对插件目录的入口 HTML（如 index.html） */
  entry: string
  /** 声明的能力（P1 静态展示；P2 在线安装走强制审批） */
  permissions?: string[]
  /** 描述（中心详情页展示） */
  description?: string
  /** format 类插件声明的扩展名（不含点，小写），如 ['txt','md'] */
  formats?: string[]
}

export interface InstalledPlugin extends PluginManifest {
  dir: string
  /** 安装件已归一化为数组（parseManifest 落盘语义），类型上必填 */
  formats: string[]
}

/** 中心面板视图：安装件 + 启停状态 + 来源 */
export interface ManagedPlugin extends InstalledPlugin {
  enabled: boolean
  /** builtin = 内置插件的 userData 复制件；imported = .leafplugin 导入件；dev = 开发者目录 */
  source: 'builtin' | 'imported' | 'dev'
}
