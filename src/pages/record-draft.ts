/**
 * 记录表单的草稿、校验、请求构造与**保存编排**（纯逻辑：不碰 React、不碰 `window.api`）。
 *
 * 记录页只递一个 request（新建，或编辑哪一条）与回执；表单自己持有一份草稿。这里的函数是
 * 表单的整个"口径"：记录 → 草稿、模板 → 草稿、草稿 → 建记录请求（含校验），以及那条最容易
 * 错的保存顺序：
 *
 * 1. **建一条新记录**；
 * 2. 有事件日期就**关联事件** —— 失败则把刚建的那条删掉（再失败也不覆盖原错误）；
 * 3. 编辑时再**删掉旧记录** —— 失败则删掉新的：删成功提示"删除旧记录失败"，删失败提示
 *    "新记录已保存，但旧记录清理失败，请手动删除重复记录"。
 *
 * 编辑不是一条 update 命令，而是"建一条 + 删旧一条"。这个顺序不是实现细节：换成 update 就是
 * IPC 契约与新行为。搬到这里是为了让它能在毫秒级的单测里被钉住，而不是只靠 E2E。
 *
 * 表单要用的三个命令以**端口**注入（与主进程里"注入依赖"同一种写法）：真实调用在
 * `record-composer` 里包成 `window.api.invoke`，测试里换成记录调用序列的替身。
 */

import { parseYmd } from '../../shared/domain/calendar'
import { transactionTypeText } from '../../shared/domain/format'
import { centsToYuan, yuanToCents } from '../../shared/domain/money'
import { tagNamesForCategory, tagNamesForFilter } from '../../shared/domain/tag-names'
import { formatTimestamp, todayYmd } from '../../shared/domain/time'
import { errorMessage } from '../../shared/errors'
import type { CommandReq } from '../../shared/commands'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import type { TransactionTemplateDto } from '../../shared/types/template'
import type { TransactionRecordDto } from '../../shared/types/transaction'

/** 表单里的一份未提交草稿。金额是**用户输入的元文本**，保存时才折算（这样非法输入能原样提示）。 */
export interface RecordDraft {
  /** `YYYY-MM-DD` */
  date: string
  /** 元文本，例如 `12.50` */
  amount: string
  /** expense / income / transfer */
  type: string
  category: string
  description: string
  tags: string[]
  outlier: boolean
  /** `YYYY-MM-DD`；空串 = 不关联事件 */
  eventDate: string
}

/** 页面递给表单的请求：`null` = 关着；换一份请求就打开一份对应的草稿。 */
export type ComposerRequest =
  | { mode: 'create'; defaultDate: string }
  | { mode: 'edit'; record: TransactionRecordDto }

/** 保存要用的三个命令（由页面 / 表单包成 `window.api.invoke`）。 */
export interface RecordSavePorts {
  /** 建一条记录，返回新记录的 id */
  create: (request: TransactionRecordDto) => Promise<string>
  /** 把记录关联到某个事件日期 */
  linkEvent: (transactionId: string, date: string) => Promise<void>
  /** 删除一条记录 */
  deleteRecord: (id: string) => Promise<void>
}

/** 保存结果：失败是返回值，不是异常 —— 表单只负责把 `message` 显示出来。 */
export type SaveOutcome =
  | { status: 'saved' }
  | { status: 'failed'; message: string; field?: DraftErrorField }

/** 校验失败落在哪个字段上（表单据此把错误挂回那个输入框）。 */
export type DraftErrorField = 'ledger' | 'category' | 'amount'

/** 草稿检查结果：通过时顺带给出**建记录请求**，省得调用方再拼一次。 */
export type DraftCheck =
  | { ok: true; request: TransactionRecordDto }
  | { ok: false; error: string; field: DraftErrorField }

/** 下拉选项（`value` 与 `label` 都是原始名）。 */
export interface DraftOption {
  value: string
  label: string
}

/** 新增记录的默认日期跟着列表区间走：列表停在某一天就记那天，否则今天。 */
export function composerDefaultDate(start: string, end: string): string {
  return start && start === end ? start : todayYmd()
}

/** 空白草稿（新增）。 */
export function initialDraft(defaultDate: string): RecordDraft {
  return {
    date: defaultDate,
    amount: '',
    type: 'expense',
    category: '',
    description: '',
    tags: [],
    outlier: false,
    eventDate: '',
  }
}

/** 一条已有记录 → 草稿（编辑）。 */
export function draftOfRecord(record: TransactionRecordDto): RecordDraft {
  return {
    date: formatTimestamp(record.transactionAt, 'YYYY-MM-DD'),
    amount: centsToYuan(record.price),
    type: record.transactionType,
    category: record.category,
    description: record.description,
    tags: [...record.tags],
    outlier: record.outlier,
    eventDate: record.keyEventDate,
  }
}

/** 套一个模板：类型 / 分类 / 描述 / 标签一起换，其它字段不动。 */
export function draftAfterTemplate(
  draft: RecordDraft,
  template: TransactionTemplateDto,
): RecordDraft {
  return {
    ...draft,
    type: template.transactionType,
    category: template.category,
    description: template.description,
    tags: [...template.tags],
  }
}

/**
 * 换分类或换类型：与它一起变的是**标签候选**，所以不属于新组合的已选标签要摘掉。
 *
 * 标签按 `分类:交易类型` 归档（{@link tagNamesForCategory}），不摘就会把别的分类的标签
 * 记到这条记录上。
 */
export function draftWithCategoryOrType(
  draft: RecordDraft,
  patch: Partial<Pick<RecordDraft, 'category' | 'type'>>,
  tagRows: readonly Pick<TagDto, 'name' | 'categoryTransactionType'>[],
): RecordDraft {
  const next: RecordDraft = { ...draft, ...patch }
  const valid = new Set(tagNamesForCategory(tagRows, next.category, next.type))
  return { ...next, tags: draft.tags.filter((name) => valid.has(name)) }
}

/**
 * 草稿 → 建记录请求，顺带校验（顺序与提示文案是既有行为）：账本 → 分类 → 金额格式 → 金额非零。
 *
 * `keyEventDate` 恒为空串：事件关联只走保存编排里的 `linkEvent`，建记录时不带。
 */
export function requestOfDraft(draft: RecordDraft, ledgerId: string): DraftCheck {
  if (!ledgerId) return { ok: false, error: '请先选择账本', field: 'ledger' }
  if (!draft.category.trim()) return { ok: false, error: '请填写分类', field: 'category' }

  let price: number
  try {
    price = yuanToCents(draft.amount)
  } catch (moneyError) {
    return { ok: false, error: errorMessage(moneyError), field: 'amount' }
  }
  if (price === 0) return { ok: false, error: '金额不能为 0', field: 'amount' }

  return {
    ok: true,
    request: {
      ledgerId,
      transactionId: '',
      price,
      transactionType: draft.type,
      category: draft.category.trim(),
      description: draft.description.trim(),
      tags: [...draft.tags],
      transactionAt: timestampOfYmd(draft.date),
      outlier: draft.outlier,
      keyEventDate: '',
    },
  }
}

/** 草稿 → 存为模板的请求（名字沿用「类型 · 分类」，空分类回落到「模板」）。 */
export function templateRequestOf(
  draft: RecordDraft,
  ledgerId: string,
  templateCount: number,
): CommandReq<'template_create'> {
  return {
    template_id: '',
    ledger_id: ledgerId,
    template_name: `${transactionTypeText(draft.type)} · ${draft.category.trim() || '模板'}`,
    transaction_type: draft.type,
    category: draft.category.trim(),
    tags: [...draft.tags],
    flags: '',
    description: draft.description.trim(),
    sort_order: templateCount + 1,
  }
}

/** 分类候选：`transactionType` 为空串时不限类型（筛选里那一档）。 */
export function categoryOptions(
  categories: readonly CategoryDto[],
  transactionType: string,
): DraftOption[] {
  const names = new Set<string>()
  for (const item of categories) {
    if (!transactionType || item.transactionType === transactionType) names.add(item.name)
  }
  return Array.from(names).map((name) => ({ value: name, label: name }))
}

/** 标签候选：只给当前分类 + 类型下的标签（表单用）。 */
export function tagOptionsForCategory(
  tagRows: readonly Pick<TagDto, 'name' | 'categoryTransactionType'>[],
  category: string,
  transactionType: string,
): DraftOption[] {
  return tagNamesForCategory(tagRows, category, transactionType).map((name) => ({
    value: name,
    label: name,
  }))
}

/** 全部标签名（去重；两端口径见 {@link filterTagOptions}）。 */
export function filterTagOptions(
  tagRows: readonly Pick<TagDto, 'name' | 'categoryTransactionType'>[],
  category: string,
  transactionType: string,
): DraftOption[] {
  return tagNamesForFilter(tagRows, category, transactionType).map((name) => ({
    value: name,
    label: name,
  }))
}

/**
 * 保存编排：校验 → 建 → 关联事件 → 删旧 → 回滚，规则见模块头注释。
 *
 * 不抛异常：每一步的失败都折成 {@link SaveOutcome}，表单只负责显示。
 * `editingRecordId` 为 `null` 表示这是新建（没有旧记录要删）。
 */
export async function saveDraft(
  ports: RecordSavePorts,
  draft: RecordDraft,
  ledgerId: string,
  editingRecordId: string | null,
): Promise<SaveOutcome> {
  const check = requestOfDraft(draft, ledgerId)
  if (!check.ok) return { status: 'failed', message: check.error, field: check.field }

  let createdId: string
  try {
    createdId = await ports.create(check.request)
  } catch (createError) {
    return { status: 'failed', message: errorMessage(createError) }
  }

  if (draft.eventDate) {
    try {
      await ports.linkEvent(createdId, draft.eventDate)
    } catch (linkError) {
      // 关联不上就不留半条记录：把刚建的那条删掉。回滚失败也不覆盖原始错误 ——
      // 用户要看到的是"为什么没保存成"，而不是"回滚也失败了"。
      await ports.deleteRecord(createdId).catch(() => undefined)
      return { status: 'failed', message: errorMessage(linkError) }
    }
  }

  if (editingRecordId !== null) {
    try {
      await ports.deleteRecord(editingRecordId)
    } catch (deleteError) {
      try {
        await ports.deleteRecord(createdId)
        return {
          status: 'failed',
          message: `删除旧记录失败：${errorMessage(deleteError)}`,
        }
      } catch {
        return {
          status: 'failed',
          message: '新记录已保存，但旧记录清理失败，请手动删除重复记录',
        }
      }
    }
  }

  return { status: 'saved' }
}

/**
 * 选中的日期 → 当天本地的 Unix 秒（记账只关心哪一天，取正午避开时区边界）。
 *
 * 解析失败时退回"现在"：草稿里的日期来自界面控件，正常情况下一定是合法的。
 */
function timestampOfYmd(ymd: string): number {
  const parsed = parseYmd(ymd)
  if (!parsed) return Math.floor(Date.now() / 1000)
  return Math.trunc(new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0).getTime() / 1000)
}
