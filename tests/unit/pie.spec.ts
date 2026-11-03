import { describe, expect, it } from 'vitest'

import { PIE_MAX_SLICES, PIE_OTHER_KEY, foldPieSlices, type PieSlice } from '../../shared/domain/pie'

function slice(key: string, amount: number): PieSlice {
  return { key, label: key, amount }
}

/** 12 组：金额从 120 依次递减，前 10 组留下、后 2 组折成「其他」。 */
function twelveSlices(): PieSlice[] {
  return Array.from({ length: 12 }, (_item, index) => slice(`s${index}`, 120 - index))
}

describe('pie folding', () => {
  it('keeps every slice when the count is within the cap', () => {
    const slices = [slice('餐饮', 300), slice('交通', 200), slice('住房', 100)]
    expect(foldPieSlices(slices)).toEqual({ slices, folded: 0 })
  })

  it('folds the tail into one other slice past the cap', () => {
    const slices = twelveSlices()
    const folded = foldPieSlices(slices, 10)
    expect(folded.folded).toBe(2)
    expect(folded.slices).toHaveLength(11)
    // 前 10 组原样保留（顺序就是服务层给的金额倒序）
    expect(folded.slices.slice(0, 10)).toEqual(slices.slice(0, 10))
    expect(folded.slices[10]).toEqual({
      key: PIE_OTHER_KEY,
      label: '其他',
      amount: slices[10].amount + slices[11].amount,
    })
  })

  it('treats exactly the cap as unfolded', () => {
    const slices = twelveSlices().slice(0, PIE_MAX_SLICES)
    expect(foldPieSlices(slices)).toEqual({ slices, folded: 0 })
  })

  it('does not mutate the input and returns a fresh array', () => {
    const slices = [slice('a', 10), slice('b', 5)]
    const folded = foldPieSlices(slices)
    expect(folded.slices).not.toBe(slices)
    folded.slices.push(slice('c', 1))
    expect(slices).toHaveLength(2)
  })

  it('keeps a single group as one full slice', () => {
    expect(foldPieSlices([slice('only', 100)])).toEqual({
      slices: [slice('only', 100)],
      folded: 0,
    })
  })
})
