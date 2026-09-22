// 直载 node-gyp 产物（不经 node-gyp-build，减少运行时依赖）
const path = require('node:path')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const native = require(path.join(__dirname, 'build/Release/leaf_share.node'))
module.exports = native
