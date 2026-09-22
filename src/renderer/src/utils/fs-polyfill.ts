// 空模块，用于浏览器环境中的 Node.js fs 模块占位符
export const existsSync = (): boolean => false
export const readFileSync = (): string => ''
export const writeFileSync = (): void => {}
export const mkdirSync = (): void => {}
export const statSync = (): any => ({ isFile: () => false, isDirectory: () => false })

export default {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync
}
