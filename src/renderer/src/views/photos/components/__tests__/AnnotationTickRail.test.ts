// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AnnotationTickRail from '../AnnotationTickRail.vue'
import type { PhotoAnnotation } from '@shared/annotations'

/**
 * 刻度条共用组件的挂载断言：原生 title 必须消失（会被 stage 裁剪）、
 * aria-label / role=tooltip 到位、hover 显隐与 seek 事件口径正确。
 * 定位数值（收进 / 翻转）在 utils/__tests__/tickTooltip.test.ts 纯函数层直打，
 * happy-dom 测不出渲染尺寸（offsetWidth 恒 0），这里不硬断言像素。
 */

/** 组件入参要求 atMs 必有（PhotoPreview 里已用谓词收窄，这里同样收窄） */
type TickAnnotation = PhotoAnnotation & { atMs: number }

const ann = (id: string, body: string, atMs: number): TickAnnotation =>
  ({
    id,
    photoId: 'p1',
    body,
    atMs,
    createdAt: 0,
    updatedAt: 0
  }) as TickAnnotation

const annotations = [ann('a1', '开场白', 5_000), ann('a2', '高潮在第三分钟', 185_000)]

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 测试辅助，返回类型由 vue 推导（照本目录既有范式）
const mountRail = () =>
  mount(AnnotationTickRail, {
    props: { annotations, durationSec: 300 }
  })

describe('AnnotationTickRail', () => {
  it('按标注数量渲染刻度按钮，按 atMs 定位（不再用原生 title）', () => {
    const w = mountRail()
    const buttons = w.findAll('button')
    expect(buttons.length).toBe(2)
    // 5s / 300s = 1.6667%（模板里浮点全精度展开，这里只断前缀口径）
    expect(buttons[0].attributes('style')).toMatch(/left: 1\.6666\d*%;/)
    // 原生 title 会被 overflow-hidden 裁剪，必须已移除
    expect(buttons.some((b) => b.attributes('title') !== undefined)).toBe(false)
    w.unmount()
  })

  it('aria-label 含时间与 body 摘要（无障碍顺手项）', () => {
    const w = mountRail()
    const label = w.findAll('button')[0].attributes('aria-label') ?? ''
    expect(label).toContain('0:05')
    expect(label).toContain('开场白')
    w.unmount()
  })

  it('hover 刻度出现 role=tooltip 浮层，显示时间与 body；移开即消失', async () => {
    const w = mountRail()
    expect(w.find('[role="tooltip"]').exists()).toBe(false)

    await w.findAll('button')[1].trigger('mouseenter')
    await nextTick()
    const tip = w.find('[role="tooltip"]')
    expect(tip.exists()).toBe(true)
    expect(tip.text()).toContain('3:05')
    expect(tip.text()).toContain('高潮在第三分钟')

    await w.findAll('button')[1].trigger('mouseleave')
    await nextTick()
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
    w.unmount()
  })

  it('键盘聚焦同样唤出浮层（focus / blur 与 hover 同口径）', async () => {
    const w = mountRail()
    await w.findAll('button')[0].trigger('focus')
    await nextTick()
    expect(w.find('[role="tooltip"]').exists()).toBe(true)
    await w.findAll('button')[0].trigger('blur')
    await nextTick()
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
    w.unmount()
  })

  it('点击刻度 emit seek(atMs)，毫秒口径不变', async () => {
    const w = mountRail()
    await w.findAll('button')[0].trigger('click')
    expect(w.emitted('seek')).toEqual([[5_000]])
    w.unmount()
  })
})
