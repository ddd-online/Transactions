import { afterEach, describe, expect, it, vi } from 'vitest'

import { centsToYuan } from '../../shared/domain/money'
import { todayYmd } from '../../shared/domain/time'
import type { TransactionRecordDto } from '../../shared/types/transaction'
import {
  type RecordDraft,
  type RecordSavePorts,
  categoryOptions,
  filterTagOptions,
  composerDefaultDate,
  draftAfterTemplate,
  draftOfRecord,
  draftWithCategoryOrType,
  initialDraft,
  requestOfDraft,
  saveDraft,
  tagOptionsForCategory,
  templateRequestOf,
} from '../../src/pages/record-draft'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import type { TransactionTemplateDto } from '../../shared/types/template'

/** 一条记录（wire 形状，金额分、时间戳秒）。 */
function record(overrides: Partial<TransactionRecordDto> = {}): TransactionRecordDto {
  return {
    ledgerId: 'ledger',
    transactionId: 'record-1',
    price: 1250,
    transactionType: 'expense',
    category: '餐饮',
    description: '午饭',
    tags: ['工作日'],
    transactionAt: new Date(2026, 2, 3, 20, 15, 0).getTime() / 1000,
    outlier: false,
    keyEventDate: '',
    ...overrides,
  }
}

function draft(overrides: Partial<RecordDraft> = {}): RecordDraft {
  return { ...initialDraft('2026-03-03'), category: '餐饮', amount: '12.50', ...overrides }
}

function tag(name: string, category: string, type: string): TagDto {
  return {
    name,
    ledgerId: 'ledger',
    categoryTransactionType: `${category}:${type}`,
    sortOrder: 0,
    recordCount: 0,
  }
}

function category(name: string, type: string): CategoryDto {
  return { name, ledgerId: 'ledger', transactionType: type, sortOrder: 0, recordCount: 0 }
}

function template(overrides: Partial<TransactionTemplateDto> = {}): TransactionTemplateDto {
  return {
    templateId: 'tpl-1',
    ledgerId: 'ledger',
    templateName: '支出 · 餐饮',
    transactionType: 'expense',
    category: '餐饮',
    tags: ['工作日'],
    flags: '',
    description: '午饭',
    sortOrder: 1,
    ...overrides,
  }
}

/** 记录的端口调用序列 + 可编排的失败点。 */
interface FakePorts {
  ports: RecordSavePorts
  calls: Array<{ name: string; arg: unknown }>
}

function fakePorts(
  handlers: Partial<Record<'create' | 'linkEvent' | 'deleteRecord', (arg: never) => unknown>> = {},
): FakePorts {
  const calls: FakePorts['calls'] = []
  const ports: RecordSavePorts = {
    create: async (request) => {
      calls.push({ name: 'create', arg: request })
      return (handlers.create?.(request as never) as string) ?? 'new-id'
    },
    linkEvent: async (transactionId, date) => {
      calls.push({ name: 'linkEvent', arg: { transactionId, date } })
      await handlers.linkEvent?.({ transactionId, date } as never)
    },
    deleteRecord: async (id) => {
      calls.push({ name: 'deleteRecord', arg: { id } })
      await handlers.deleteRecord?.({ id } as never)
    },
  }
  return { ports, calls }
}

const names = (fake: FakePorts): string[] => fake.calls.map((call) => call.name)

describe('composerDefaultDate', () => {
  it('列表停在某一天就用那天，否则用今天', () => {
    expect(composerDefaultDate('2026-03-03', '2026-03-03')).toBe('2026-03-03')
    expect(composerDefaultDate('2026-03-01', '2026-03-31')).toBe(todayYmd())
    expect(composerDefaultDate('', '')).toBe(todayYmd())
  })
})

describe('initialDraft / draftOfRecord', () => {
  it('新增：空草稿 + 默认日期', () => {
    expect(initialDraft('2026-03-03')).toEqual({
      date: '2026-03-03',
      amount: '',
      type: 'expense',
      category: '',
      description: '',
      tags: [],
      outlier: false,
      eventDate: '',
    })
  })

  it('编辑：记录的值逐项搬进草稿', () => {
    const original = record({ outlier: true, keyEventDate: '2026-03-02' })
    expect(draftOfRecord(original)).toEqual({
      date: '2026-03-03',
      amount: centsToYuan(1250),
      type: 'expense',
      category: '餐饮',
      description: '午饭',
      tags: ['工作日'],
      outlier: true,
      eventDate: '2026-03-02',
    })
  })

  it('标签是副本（改草稿不会改到记录上）', () => {
    const original = record()
    const next = draftOfRecord(original)
    next.tags.push('新标签')
    expect(original.tags).toEqual(['工作日'])
  })
})

describe('draftAfterTemplate', () => {
  it('类型 / 分类 / 描述 / 标签一起换，其它字段不动', () => {
    const before = draft({ amount: '9.90', outlier: true, eventDate: '2026-03-01' })
    const after = draftAfterTemplate(
      before,
      template({ transactionType: 'income', category: '工资', description: '月薪', tags: ['固定'] }),
    )
    expect(after).toEqual({
      ...before,
      type: 'income',
      category: '工资',
      description: '月薪',
      tags: ['固定'],
    })
  })

  it('模板的标签也是副本', () => {
    const source = template()
    const next = draftAfterTemplate(draft(), source)
    next.tags.push('新标签')
    expect(source.tags).toEqual(['工作日'])
  })
})

describe('draftWithCategoryOrType', () => {
  const tagRows = [
    tag('工作日', '餐饮', 'expense'),
    tag('聚餐', '餐饮', 'expense'),
    tag('通勤', '交通', 'expense'),
  ]

  it('换分类时摘掉不属于新组合的标签', () => {
    const before = draft({ tags: ['工作日', '聚餐'] })
    expect(draftWithCategoryOrType(before, { category: '交通' }, tagRows).tags).toEqual([])
  })

  it('换类型时同样摘标签', () => {
    const before = draft({ tags: ['工作日'] })
    expect(draftWithCategoryOrType(before, { type: 'income' }, tagRows).tags).toEqual([])
  })

  it('属于新组合的标签保留', () => {
    const before = draft({ tags: ['工作日', '聚餐'] })
    const next = draftWithCategoryOrType(before, { category: '餐饮', type: 'expense' }, tagRows)
    expect(next.tags).toEqual(['工作日', '聚餐'])
    expect(next.category).toBe('餐饮')
  })
})

describe('requestOfDraft', () => {
  it('没有账本 → 请先选择账本（动作级，没有字段）', () => {
    expect(requestOfDraft(draft(), '')).toEqual({
      ok: false,
      error: '请先选择账本',
      field: 'ledger',
    })
  })

  it('分类为空（含只有空格）→ 请填写分类，挂在分类上', () => {
    expect(requestOfDraft(draft({ category: '' }), 'ledger')).toEqual({
      ok: false,
      error: '请填写分类',
      field: 'category',
    })
    expect(requestOfDraft(draft({ category: '   ' }), 'ledger')).toEqual({
      ok: false,
      error: '请填写分类',
      field: 'category',
    })
  })

  it('金额非法 → 原样翻出金额的报错，挂在金额上', () => {
    expect(requestOfDraft(draft({ amount: '12.3.4' }), 'ledger')).toEqual({
      ok: false,
      error: '无效的金额格式',
      field: 'amount',
    })
  })

  it('金额为空 → 折算成 0，按「金额不能为 0」挡（既有行为）', () => {
    expect(requestOfDraft(draft({ amount: '' }), 'ledger')).toEqual({
      ok: false,
      error: '金额不能为 0',
      field: 'amount',
    })
  })

  it('金额为 0（含 0.00 / 0.004）→ 金额不能为 0', () => {
    for (const amount of ['0', '0.00', '0.004']) {
      expect(requestOfDraft(draft({ amount }), 'ledger')).toEqual({
        ok: false,
        error: '金额不能为 0',
        field: 'amount',
      })
    }
  })

  it('合法草稿给出建记录请求：金额分、当天正午、keyEventDate 恒空、分类与描述 trim', () => {
    const check = requestOfDraft(
      draft({ category: '  餐饮 ', description: ' 午饭 ', tags: ['工作日'], eventDate: '2026-03-02' }),
      'ledger',
    )
    expect(check).toEqual({
      ok: true,
      request: {
        ledgerId: 'ledger',
        transactionId: '',
        price: 1250,
        transactionType: 'expense',
        category: '餐饮',
        description: '午饭',
        tags: ['工作日'],
        transactionAt: Math.trunc(new Date(2026, 2, 3, 12, 0, 0).getTime() / 1000),
        outlier: false,
        keyEventDate: '',
      },
    })
  })

  it('金额文本按元折算（12.5 → 1250 分，前后空格容忍）', () => {
    const check = requestOfDraft(draft({ amount: ' 12.5 ' }), 'ledger')
    expect(check.ok && check.request.price).toBe(1250)
  })
})

describe('timestamp fallback', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('日期解析失败时退回「现在」', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 3, 9, 30, 0))
    const check = requestOfDraft(draft({ date: '2026-13-40' }), 'ledger')
    expect(check.ok && check.request.transactionAt).toBe(Math.floor(Date.now() / 1000))
  })
})

describe('options', () => {
  const categories = [
    category('餐饮', 'expense'),
    category('工资', 'income'),
    category('餐饮', 'expense'),
  ]

  it('分类候选按类型过滤并去重，空类型不限', () => {
    expect(categoryOptions(categories, 'expense')).toEqual([{ value: '餐饮', label: '餐饮' }])
    expect(categoryOptions(categories, 'income')).toEqual([{ value: '工资', label: '工资' }])
    expect(categoryOptions(categories, '').map((option) => option.value)).toEqual(['餐饮', '工资'])
  })

  it('标签候选只给当前分类 + 类型下的标签（表单）', () => {
    const tagRows = [tag('工作日', '餐饮', 'expense'), tag('通勤', '交通', 'expense')]
    expect(tagOptionsForCategory(tagRows, '餐饮', 'expense')).toEqual([
      { value: '工作日', label: '工作日' },
    ])
    expect(tagOptionsForCategory(tagRows, '', '')).toEqual([])
  })

  it('筛选的标签候选跟着已选的分类 / 类型收窄，两端都不限时列全部', () => {
    const tagRows = [
      tag('工作日', '餐饮', 'expense'),
      tag('通勤', '交通', 'expense'),
      tag('工资', '工资', 'income'),
    ]
    expect(filterTagOptions(tagRows, '', '').map((option) => option.value)).toEqual([
      '工作日',
      '通勤',
      '工资',
    ])
    expect(filterTagOptions(tagRows, '餐饮', 'expense')).toEqual([
      { value: '工作日', label: '工作日' },
    ])
    expect(filterTagOptions(tagRows, '', 'income').map((option) => option.value)).toEqual(['工资'])
    expect(filterTagOptions(tagRows, '餐饮', 'income')).toEqual([])
  })
})

describe('templateRequestOf', () => {
  it('名字是「类型 · 分类」，空分类回落到「模板」', () => {
    expect(
      templateRequestOf(
        draft({ category: ' 餐饮 ', description: ' 午饭 ', tags: ['工作日'] }),
        'ledger',
        2,
      ),
    ).toEqual({
      template_id: '',
      ledger_id: 'ledger',
      template_name: '支出 · 餐饮',
      transaction_type: 'expense',
      category: '餐饮',
      tags: ['工作日'],
      flags: '',
      description: '午饭',
      sort_order: 3,
    })
    expect(templateRequestOf(draft({ category: '  ' }), 'ledger', 0).template_name).toBe(
      '支出 · 模板',
    )
  })
})

describe('saveDraft', () => {
  it('校验失败时不发任何命令，并带回出错字段', async () => {
    const fake = fakePorts()
    const outcome = await saveDraft(fake.ports, draft({ category: '' }), 'ledger', null)
    expect(outcome).toEqual({ status: 'failed', message: '请填写分类', field: 'category' })
    expect(fake.calls).toHaveLength(0)
  })

  it('新建：只建一条，不关联、不删', async () => {
    const fake = fakePorts()
    const outcome = await saveDraft(fake.ports, draft(), 'ledger', null)
    expect(outcome).toEqual({ status: 'saved' })
    expect(names(fake)).toEqual(['create'])
    expect(fake.calls[0].arg).toMatchObject({
      ledgerId: 'ledger',
      price: 1250,
      category: '餐饮',
      keyEventDate: '',
    })
  })

  it('带事件日期：先建、再关联', async () => {
    const fake = fakePorts()
    const outcome = await saveDraft(fake.ports, draft({ eventDate: '2026-03-02' }), 'ledger', null)
    expect(outcome).toEqual({ status: 'saved' })
    expect(names(fake)).toEqual(['create', 'linkEvent'])
    expect(fake.calls[1].arg).toEqual({ transactionId: 'new-id', date: '2026-03-02' })
  })

  it('编辑：建一条新的，再删掉旧的那条', async () => {
    const fake = fakePorts()
    const outcome = await saveDraft(fake.ports, draft(), 'ledger', 'record-1')
    expect(outcome).toEqual({ status: 'saved' })
    expect(names(fake)).toEqual(['create', 'deleteRecord'])
    expect(fake.calls[1].arg).toEqual({ id: 'record-1' })
  })

  it('关联事件失败：回滚刚建的那条，并把关联的错误原文返回', async () => {
    const fake = fakePorts({
      linkEvent: () => {
        throw new Error('事件不存在')
      },
    })
    const outcome = await saveDraft(fake.ports, draft({ eventDate: '2026-03-02' }), 'ledger', null)
    expect(outcome).toEqual({ status: 'failed', message: '事件不存在' })
    expect(names(fake)).toEqual(['create', 'linkEvent', 'deleteRecord'])
    expect(fake.calls[2].arg).toEqual({ id: 'new-id' })
  })

  it('关联失败且回滚也失败：仍然返回关联的错误（不覆盖原始原因）', async () => {
    const fake = fakePorts({
      linkEvent: () => {
        throw new Error('事件不存在')
      },
      deleteRecord: () => {
        throw new Error('删不掉')
      },
    })
    const outcome = await saveDraft(fake.ports, draft({ eventDate: '2026-03-02' }), 'ledger', null)
    expect(outcome).toEqual({ status: 'failed', message: '事件不存在' })
  })

  it('建记录失败：直接返回那条错误，不再往下走', async () => {
    const fake = fakePorts({
      create: () => {
        throw new Error('数据库忙')
      },
    })
    const outcome = await saveDraft(fake.ports, draft({ eventDate: '2026-03-02' }), 'ledger', 'record-1')
    expect(outcome).toEqual({ status: 'failed', message: '数据库忙' })
    expect(names(fake)).toEqual(['create'])
  })

  it('删旧失败、回滚成功：提示「删除旧记录失败：…」', async () => {
    const fake = fakePorts({
      deleteRecord: (arg: { id: string }) => {
        if (arg.id === 'record-1') throw new Error('旧记录被占用')
      },
    })
    const outcome = await saveDraft(fake.ports, draft(), 'ledger', 'record-1')
    expect(outcome).toEqual({ status: 'failed', message: '删除旧记录失败：旧记录被占用' })
    expect(names(fake)).toEqual(['create', 'deleteRecord', 'deleteRecord'])
    expect(fake.calls[2].arg).toEqual({ id: 'new-id' })
  })

  it('删旧失败、回滚也失败：提示手动清理重复记录', async () => {
    const fake = fakePorts({
      deleteRecord: () => {
        throw new Error('都删不掉')
      },
    })
    const outcome = await saveDraft(fake.ports, draft(), 'ledger', 'record-1')
    expect(outcome).toEqual({
      status: 'failed',
      message: '新记录已保存，但旧记录清理失败，请手动删除重复记录',
    })
  })

  it('非 Error 的失败（IPC 信封）也能翻成提示', async () => {
    const fake = fakePorts({
      create: () => {
        throw { code: -1, msg: '未打开工作空间', status: 500 }
      },
    })
    const outcome = await saveDraft(fake.ports, draft(), 'ledger', null)
    expect(outcome).toEqual({ status: 'failed', message: '未打开工作空间' })
  })
})
