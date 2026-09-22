// 空模块，用于浏览器环境中的 Node.js path 模块占位符
export const isAbsolute = (path: string): boolean => {
  return path.startsWith('/') || /^[A-Za-z]:/.test(path)
}

export const resolve = (...args: string[]): string => {
  return args.filter(Boolean).join('/').replace(/\/+/g, '/')
}

export const dirname = (path: string): string => {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 1) return '.'
  return parts.slice(0, -1).join('/') || '/'
}

export const join = (...args: string[]): string => {
  return args.filter(Boolean).join('/').replace(/\/+/g, '/')
}

export const basename = (path: string, ext?: string): string => {
  const parts = path.split('/').filter(Boolean)
  const name = parts[parts.length - 1] || path
  if (ext && name.endsWith(ext)) {
    return name.slice(0, -ext.length)
  }
  return name
}

export default {
  isAbsolute,
  resolve,
  dirname,
  join,
  basename
}
