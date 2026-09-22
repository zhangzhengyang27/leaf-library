/**
 * leaf:// 深链的解析与构造
 *
 * 这条输入是**外部可控**的：浏览器、终端、笔记软件都能把任意字符串塞进
 * `open-url` 或 argv。所以这里的判据不是"能不能解析得通"，而是"能不能只当成一个 id"——
 * 路径穿越、多段路径、查询串、非 UUID 一律拒，绝不让它带着斜杠或点走出去。
 */
import { describe, it, expect } from 'vitest'
import { buildDeepLink, buildItemLink, parseDeepLink } from '../deepLink'

const ID = '3f2b1c4a-5d6e-4f70-8a9b-0c1d2e3f4a5b'

describe('parseDeepLink', () => {
  it('认得两种合法形状，大小写不敏感', () => {
    expect(parseDeepLink(`leaf://item/${ID}`)).toEqual({ kind: 'item', id: ID })
    expect(parseDeepLink(`leaf://folder/${ID}`)).toEqual({ kind: 'folder', id: ID })
    expect(parseDeepLink(`LEAF://ITEM/${ID.toUpperCase()}`)).toEqual({
      kind: 'item',
      id: ID.toUpperCase()
    })
  })

  it('容忍尾部斜杠、查询串与多余段（浏览器常自己补）', () => {
    expect(parseDeepLink(`leaf://item/${ID}/`)).toEqual({ kind: 'item', id: ID })
    expect(parseDeepLink(`leaf://item/${ID}?x=1`)).toEqual({ kind: 'item', id: ID })
    // 多一段就拒：不再"取第一段算了"，免得有人以后整段用 pathname
    expect(parseDeepLink(`leaf://item/${ID}/extra`)).toBeNull()
  })

  it('形状不对一律 null，不做任何"猜"', () => {
    for (const bad of [
      '',
      '   ',
      'eagle://item/' + ID,
      'http://item/' + ID,
      'leaf://',
      'leaf://item',
      'leaf:///item/' + ID,
      'leaf://other/' + ID,
      'leaf://item/',
      'file:///etc/passwd',
      'leaf://item/%2e%2e/%2e%2e/etc/passwd',
      'leaf://item/' + ID.replace(/-/g, ''),
      'leaf://item/not-a-uuid',
      'leaf://item/' + ID + ';rm -rf',
      'leaf://item/' + ID + '/../../env'
    ])
      expect(parseDeepLink(bad), bad).toBeNull()
  })

  it('非字符串输入不抛（argv 里可能是 undefined / 数组项被别的东西污染）', () => {
    for (const v of [null, undefined, 42, {}, [], true, Symbol('x')])
      expect(parseDeepLink(v as unknown)).toBeNull()
  })

  it('非法百分号编码不抛，按原样判形状', () => {
    expect(parseDeepLink('leaf://item/%E0%A4%A')).toBeNull()
    expect(parseDeepLink(`leaf://item/%${ID}`)).toBeNull()
  })
})

describe('构造', () => {
  it('build 出去的东西 parse 回来等价（往返一致，两边不会各自漂移）', () => {
    for (const t of [
      { kind: 'item', id: ID } as const,
      { kind: 'folder', id: ID } as const
    ])
      expect(parseDeepLink(buildDeepLink(t))).toEqual(t)
  })

  it('buildItemLink 是 item 的便捷形态', () => {
    expect(buildItemLink(ID)).toBe(`leaf://item/${ID}`)
  })
})
