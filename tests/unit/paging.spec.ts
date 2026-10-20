import { describe, expect, it } from 'vitest'

import { pageSlots } from '../../shared/domain/paging'

/** 把槽位还原成"页号列表"，好读断言。 */
function shape(slots: readonly (number | null)[]): string {
  return slots.map((slot) => (slot === null ? '…' : String(slot))).join(' ')
}

describe('pageSlots', () => {
  it('the window moves with the current page', () => {
    expect(shape(pageSlots(1, 10))).toBe('1 2 3 4 5 … 10')
    expect(shape(pageSlots(5, 10))).toBe('1 … 4 5 6 … 10')
    expect(shape(pageSlots(10, 10))).toBe('1 … 6 7 8 9 10')
    expect(shape(pageSlots(3, 7))).toBe('1 2 3 4 5 … 7')
  })

  it('short lists show every page without ellipsis', () => {
    expect(shape(pageSlots(1, 1))).toBe('1')
    expect(shape(pageSlots(1, 3))).toBe('1 2 3')
    expect(shape(pageSlots(2, 5))).toBe('1 2 3 4 5')
    // 越界的入参按边界收敛，不抛错
    expect(shape(pageSlots(0, 4))).toBe('1 2 3 4')
    expect(shape(pageSlots(99, 4))).toBe('1 2 3 4')
    expect(shape(pageSlots(1, 0))).toBe('1')
    expect(shape(pageSlots(1, -5))).toBe('1')
  })

  // 不变量：首末页永远在、页号严格递增、省略号不连排、也不与首末页相邻成空洞。
  it('slots stay well formed for every page count', () => {
    for (let pages = 1; pages <= 40; pages += 1) {
      for (let current = 1; current <= pages; current += 1) {
        const slots = pageSlots(current, pages)
        const numbers = slots.filter((slot): slot is number => slot !== null)
        expect(numbers[0], `首页必显（current=${current}）`).toBe(1)
        expect(numbers[numbers.length - 1], `末页必显（current=${current}）`).toBe(pages)
        for (let index = 1; index < numbers.length; index += 1) {
          expect(numbers[index - 1], `页号必须严格递增：${shape(slots)}`).toBeLessThan(
            numbers[index],
          )
        }
        for (let index = 1; index < slots.length; index += 1) {
          expect(
            slots[index - 1] === null && slots[index] === null,
            `省略号不连排：${shape(slots)}`,
          ).toBe(false)
        }
        expect(numbers, `当前页必显：${shape(slots)}`).toContain(current)
        // "1 … 2" 这类空洞：省略号两侧的页号至少差 2
        for (let index = 1; index < slots.length - 1; index += 1) {
          if (slots[index] !== null) continue
          const left = slots[index - 1]
          const right = slots[index + 1]
          expect(left, `省略号两侧都该是页号：${shape(slots)}`).not.toBeNull()
          expect(right, `省略号两侧都该是页号：${shape(slots)}`).not.toBeNull()
          expect(
            (right as number) - (left as number),
            `空省略号（两侧页号相邻）：${shape(slots)}`,
          ).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })
})
