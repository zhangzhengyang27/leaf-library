/**
 * 图搜/文本档这条状态机的单测。
 *
 * 为什么单独测：TitleBar 选完图会把文件名回显进搜索框再触发一次搜索，
 * 这条链路只有走 UI 才暴露，而 UI 要弹原生文件选择器、e2e 打不到——
 * 上一轮就是直接打 IPC 写 e2e，全绿却把功能做成了"按文件名搜"。
 * 所以这里把判定抽出来逐格钉住。
 */
import { describe, it, expect } from 'vitest'
import { imageSearchFlow } from '../../constants/semanticSearch'

const idle = { mode: null, ranQuery: '' } as const
const img = { mode: 'image', ranQuery: 'IMG_2031.jpg' } as const
const txt = { mode: 'text', ranQuery: '红色海报' } as const

describe('imageSearchFlow', () => {
  it('图搜结果回显进搜索框时，命中集要留着、也不能再跑文本档覆盖它', () => {
    // 语义档关着（默认）：旧实现这里 reset() 把命中集清光，退化成按文件名搜
    expect(imageSearchFlow(img, false, 'IMG_2031.jpg')).toEqual({ keepHits: true, runText: false })
    // 语义档开着：旧实现会再跑一次文本档，mode 被改写成 'text'，图搜结果照样丢
    expect(imageSearchFlow(img, true, 'IMG_2031.jpg')).toEqual({ keepHits: true, runText: false })
  })

  it('用户改词时丢掉图搜命中（否则旧 id 一直收窄，像"改关键词没反应"）', () => {
    expect(imageSearchFlow(img, false, '别的词')).toEqual({ keepHits: false, runText: false })
  })

  it('文本档开着且是新词 → 正常跑文本档', () => {
    expect(imageSearchFlow(txt, true, '雪山日落')).toEqual({ keepHits: true, runText: true })
    expect(imageSearchFlow(idle, true, '雪山日落')).toEqual({ keepHits: true, runText: true })
  })

  it('文本档关着 → 不跑语义，走关键词', () => {
    expect(imageSearchFlow(txt, false, '雪山日落')).toEqual({ keepHits: true, runText: false })
  })

  it('空查询不触发任何一档', () => {
    expect(imageSearchFlow(img, true, '   ')).toEqual({ keepHits: true, runText: false })
  })
})
