// 空模块，用于浏览器环境中的 Node.js url 模块占位符
export const fileURLToPath = (url: string | URL): string => {
  const urlString = typeof url === 'string' ? url : url.href
  return urlString.replace(/^file:\/\//, '').replace(/^file:\/\/\//, '/')
}

export const pathToFileURL = (path: string): URL => {
  const urlString = path.startsWith('/') ? `file://${path}` : `file:///${path}`
  return new URL(urlString)
}

export default {
  fileURLToPath,
  pathToFileURL
}
