// @vitest-environment happy-dom
/**
 * UContextMenu 子菜单父项的鼠标点击语义（028 修复）。
 *
 * 旧行为：点击「移动到群组 ▸」走 pick() = 关菜单 + onPick(父项 key)——
 * 调用方没有该 key 的分支，表现为「点了没反应」；键盘 Enter 早经 P3-69
 * 排除，鼠标点击却一直漏着。现行为：点击父项 = 展开飞出（与 hover 同语义），
 * 不触发 onPick；子项点击照常回传 `sub:<父项>:<子项>`。
 */
import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, DOMWrapper } from '@vue/test-utils'
import UContextMenu from '../UContextMenu.vue'
import { useContextMenu, type MenuItem } from '../../../composables/useContextMenu'

/** Teleport 渲染到 body（happy-dom 下不进 wrapper），统一从 body 查 */
function body() {
  return new DOMWrapper(document.body)
}
function menuItems() {
  return body().findAll('div[role="menu"] button[role="menuitem"]')
}

async function mountMenu(items: MenuItem[], onPick: (key: string) => void) {
  const menu = useContextMenu()
  mount(UContextMenu)
  menu.open(10, 20, items, onPick)
  await nextTick()
}

describe('UContextMenu · 子菜单父项点击', () => {
  it('点击带 children 的父项：不触发 onPick，飞出面板展开', async () => {
    const onPick = vi.fn()
    await mountMenu(
      [
        {
          key: 'move-group',
          label: '移动到群组',
          children: [
            { key: 'group:a', label: 'A 组' },
            { key: 'group:b', label: 'B 组' }
          ]
        },
        { key: 'plain', label: '普通项' }
      ],
      onPick
    )
    const parent = menuItems().find((b) => b.text() === '移动到群组')!
    expect(parent).toBeTruthy()
    await parent.trigger('click')
    expect(onPick).not.toHaveBeenCalled() // 旧行为会 pick+close
    // 飞出面板（第二个 role=menu）出现且含子项
    const flyout = body().findAll('div[role="menu"]')[1]!
    expect(flyout.text()).toContain('A 组')
  })

  it('点击飞出子项：以 sub:<父项>:<子项> 回传', async () => {
    const onPick = vi.fn()
    await mountMenu(
      [
        {
          key: 'move-group',
          label: '移动到群组',
          children: [{ key: 'group:a', label: 'A 组' }]
        }
      ],
      onPick
    )
    const parent = menuItems().find((b) => b.text() === '移动到群组')!
    await parent.trigger('mouseenter')
    const flyout = body().findAll('div[role="menu"]')[1]!
    await flyout.findAll('button[role="menuitem"]')[0]!.trigger('click')
    expect(onPick).toHaveBeenCalledWith('sub:move-group:group:a')
  })

  it('普通项点击照常回传自身 key', async () => {
    const onPick = vi.fn()
    await mountMenu([{ key: 'plain', label: '普通项' }], onPick)
    await menuItems()[0]!.trigger('click')
    expect(onPick).toHaveBeenCalledWith('plain')
  })
})
