// 临时探针：清掉本轮格式测试导入的素材（跑完删除）
import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages().find((p) => /localhost:51\d\d/.test(p.url()))
const api = (fn, ...args) =>
  page.evaluate(async ([f, a]) => await new Function('return window.api.' + f)()(...a), [fn, args])

const PAT = /^(clip\.(mp4|avi)|ding2?\.mp3|ding\.wav|var\d\.mp3|echo\d+\.mp3|echow\d\.wav|v3echo\d+\.mp3|v3echow\d\.wav|ding4\.mp3|x2echo.*|three-page\.pdf|paper\.pdf|bundle\.zip|Arial\.ttf|.*格式测试书签\.png)$/
const all = await api('photos.getAll')
const mine = all.filter((p) => PAT.test(p.fileName))
console.log('命中', mine.length, '项：', mine.map((p) => p.fileName).join(', '))
const survivorNames = all.filter((p) => !PAT.test(p.fileName)).map((p) => p.fileName)
console.log('保留', survivorNames.length, '项')
if (mine.length === 0) process.exit(0)
await api('photos.deleteMultiple', mine.map((p) => p.id))
const trash = await api('photos.getRecycleBin')
const foreign = trash.filter((p) => !PAT.test(p.fileName))
console.log(`回收站 ${trash.length} 项，其中非本轮测试的 ${foreign.length} 项`)
if (foreign.length === 0) {
  await api('photos.clearRecycleBin')
  const after = await api('photos.getAll')
  console.log(`已彻底清理，库内 ${after.length} 项`)
  const same = after.length === survivorNames.length && after.every((p, i) => p.fileName === survivorNames[i])
  console.log('与清理前保留集一致:', same)
} else {
  console.log('⚠ 回收站混有他人条目，未清空；测试项仍软删在回收站：', trash.filter((p) => PAT.test(p.fileName)).map((p) => p.fileName).join(', '))
}
process.exit(0)
