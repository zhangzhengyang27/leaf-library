// @vitest-environment happy-dom
/**
 * UButton 的 @click 必须真的执行。
 *
 * 组件把 click 声明进 defineEmits 后，Vue 就不再把它透传给根 <button>；
 * 只声明不 emit 的话，全仓 60+ 处 <UButton @click> 会静默失效——
 * 弹窗的「确定/取消」点了没反应，界面看着像整块坏了。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UButton from '../UButton.vue'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 测试辅助
const mountBtn = (props: Record<string, unknown> = {}) =>
  mount(UButton, { props, slots: { default: '确定' }, attrs: { onClick: () => {} } })

describe('UButton 点击派发', () => {
  it('普通态点击会派发 click 给父级', async () => {
    const w = mountBtn()
    await w.get('button').trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('父级拿到的是原生 MouseEvent', async () => {
    const w = mountBtn()
    await w.get('button').trigger('click')
    const [[event]] = w.emitted('click') as [MouseEvent][]
    expect(event.type).toBe('click')
  })

  it('loading 与 disabled 都不派发', async () => {
    const loading = mountBtn({ loading: true })
    await loading.get('button').trigger('click')
    expect(loading.emitted('click')).toBeUndefined()

    const disabled = mountBtn({ disabled: true })
    await disabled.get('button').trigger('click')
    expect(disabled.emitted('click')).toBeUndefined()
  })
})
