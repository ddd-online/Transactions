import { describe, expect, it } from 'vitest'

import { baseName, samePath } from '../../src/pages/settings-data-list'

describe('baseName', () => {
  it('取路径最后一段', () => {
    expect(baseName('D:\\备份\\Transactions-备份-20260101-120000')).toBe(
      'Transactions-备份-20260101-120000',
    )
    expect(baseName('/home/me/auto-20260101.db')).toBe('auto-20260101.db')
  })

  it('忽略尾分隔符', () => {
    expect(baseName('D:\\备份\\ws\\')).toBe('ws')
  })

  it('空串原样返回', () => {
    expect(baseName('')).toBe('')
  })
})

describe('samePath', () => {
  it('尾分隔符与大小写不影响判断', () => {
    expect(samePath('D:\\github\\ws\\', 'd:\\github\\ws')).toBe(true)
  })

  it('不同目录不相等', () => {
    expect(samePath('D:\\github\\ws', 'D:\\github\\ws2')).toBe(false)
  })
})
