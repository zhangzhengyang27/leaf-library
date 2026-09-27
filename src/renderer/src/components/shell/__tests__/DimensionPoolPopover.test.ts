// @vitest-environment happy-dom
/**
 * DimensionPoolPopover · Eagle 语义 emit 契约（D-012 修复轮）：
 * - 点维度行 = 「用这个筛选」：emit open(id)（固定如未固定 + 打开取值面板），不 emit toggle
 * - 点行尾图钉 = 「固定/取消固定」：仅 emit toggle(id)，不触发 open
 * - 拖拽排序 reorder 不变（非本回合）
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DimensionPoolPopover from '../DimensionPoolPopover.vue'

const mountPop = (pinned: string[]) =>
  mount(DimensionPoolPopover, {
    props: { pinned: pinned as never },
    slots: {
      default: `<template #default="{ toggle }"><button class="trigger" @click="toggle()">开</button></template>`
    },
    global: {
      stubs: { AppIcon: { template: '<i />' } }
    }
  })

const openAndFindRow = async (wrapper: ReturnType<typeof mount>, label: string) => {
  await wrapper.find('.trigger').trigger('click')
  const row = wrapper.findAll('.cursor-pointer').find((r) => r.text() === label)
  expect(row, `池弹层里应存在维度「${label}」`).toBeTruthy()
  return row!
}

describe('DimensionPoolPopover · Eagle 语义', () => {
  it('点维度行 → emit open(id)，不 emit toggle', async () => {
    const w = mountPop(['color'])
    const row = await openAndFindRow(w, '尺寸')
    await row.trigger('click')
    expect(w.emitted('open')).toEqual([['resolution']])
    expect(w.emitted('toggle')).toBeUndefined()
  })

  it('点行尾图钉 → 仅 emit toggle(id)（.stop 不冒泡成 open）', async () => {
    const w = mountPop(['color'])
    const row = await openAndFindRow(w, '尺寸')
    const pin = row.find('button.pin-btn')
    expect(pin.exists(), '图钉应是独立 button.pin-btn').toBe(true)
    await pin.trigger('click')
    expect(w.emitted('toggle')).toEqual([['resolution']])
    expect(w.emitted('open')).toBeUndefined()
  })

  it('已固定维度的行点击 → 仍 emit open（打开面板语义）', async () => {
    const w = mountPop(['color'])
    const row = await openAndFindRow(w, '颜色')
    await row.trigger('click')
    expect(w.emitted('open')).toEqual([['color']])
  })
})
