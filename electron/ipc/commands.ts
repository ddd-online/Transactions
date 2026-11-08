/**
 * 命令层的组合点：只做类型导出与 `createHandlers` 的拼装。
 *
 * 每个领域文件导出一个 `createXHandlers(ctx): Pick<HandlerMap, ...>`；这里把它们的
 * 返回值拼成完整的 `HandlerMap`。漏注册一条命令编译失败（返回类型是完整的
 * `HandlerMap`），重复注册也编译失败（`combineHandlers` 的 `CheckedParts` 约束）。
 *
 * 找一条命令：按前缀进对应的 handlers/*.ts，不用全文搜索。
 */
import type { CommandName } from '../../shared/commands'
import type { ConfigStore } from '../config'
import { createChartHandlers } from './handlers/charts'
import { createHandlerContext } from './handlers/context'
import { createDiaryHandlers } from './handlers/diary'
import { createEventHandlers } from './handlers/events'
import { createLabelHandlers } from './handlers/labels'
import { createRecordHandlers } from './handlers/records'
import { createSettingsHandlers } from './handlers/settings'
import { createShellHandlers } from './handlers/shell'
import { createStockAccountHandlers } from './handlers/stock-account'
import { createStockHistoryHandlers } from './handlers/stock-history'
import { createStockLadderHandlers } from './handlers/stock-ladder'
import { createStockPositionHandlers } from './handlers/stock-positions'
import { createStockReviewHandlers } from './handlers/stock-review'
import { createStockTradeHandlers } from './handlers/stock-trades'
import { createTodoHandlers } from './handlers/todo'
import { createUpdateHandlers } from './handlers/update'

export type Handler = (request: unknown) => unknown | Promise<unknown>
export type HandlerMap = Record<CommandName, Handler>

export interface HandlerOptions {
  config: ConfigStore
}

/** 每个领域 `Pick` 出来的命令名并集（只取元组元素，不含数组方法 / length）。 */
type KeysOfParts<Parts extends readonly object[]> = {
  [K in keyof Parts]: Parts[K] extends object ? keyof Parts[K] : never
}[number]

/** 逐个领域检查与之前领域是否重复；返回重复的命令名（没有就是 never）。 */
type DuplicateKeys<
  Parts extends readonly object[],
  Seen extends string = never,
> = Parts extends readonly [infer Head extends object, ...infer Tail extends readonly object[]]
  ? Extract<keyof Head, Seen> | DuplicateKeys<Tail, Seen | (keyof Head & string)>
  : never

type MissingCommands<Parts extends readonly object[]> = Exclude<CommandName, KeysOfParts<Parts>>

/**
 * 编译期闸门：`Parts` 必须恰好覆盖命令目录，且各领域之间不重复。
 * 校验失败时返回带 `missingCommands` / `duplicateCommands` 的对象，传参处直接报类型错误。
 */
type CheckedParts<Parts extends readonly object[]> = [MissingCommands<Parts>] extends [never]
  ? [DuplicateKeys<Parts>] extends [never]
    ? Parts
    : { duplicateCommands: DuplicateKeys<Parts> }
  : { missingCommands: MissingCommands<Parts> }

function combineHandlers<const Parts extends readonly object[]>(
  parts: Parts & CheckedParts<Parts>,
): HandlerMap {
  return Object.assign({}, ...parts) as HandlerMap
}

export function createHandlers(options: HandlerOptions): HandlerMap {
  const ctx = createHandlerContext(options.config)

  const parts = [
    createShellHandlers(ctx),
    createSettingsHandlers(ctx),
    createChartHandlers(ctx),
    createRecordHandlers(ctx),
    createLabelHandlers(ctx),
    createEventHandlers(ctx),
    createDiaryHandlers(ctx),
    createTodoHandlers(ctx),
    createUpdateHandlers(ctx),
    createStockAccountHandlers(ctx),
    createStockPositionHandlers(ctx),
    createStockHistoryHandlers(ctx),
    createStockLadderHandlers(ctx),
    createStockTradeHandlers(ctx),
    createStockReviewHandlers(ctx),
  ] as const

  return combineHandlers(parts)
}
