/**
 * 页面取数的**决策核心**。
 *
 * 界面里每个页面都有一份取数逻辑，但真正属于"决策"的只有四件事：
 * 这次要不要发、同一个 key 要不要去重、什么时候作废重来、复核回来要不要写出去。
 * 这四条过去散在各个页面里各写一遍（顺带各写一遍 loading / notify_error 样板）。
 * 这里把它们收成一个纯状态机，于是单测就能真跑。
 *
 * 本模块**不知道** key 长什么样（只要求能比较相等）、不知道结果类型、不知道失败怎么提示；
 * 界面侧只负责 adapter。这里只有 "喂事件、收下一步" 这一条 seam：
 *
 * * {@link QueryCore.mount} —— 视图（重新）挂载：确保当前 key 有一份数据（在飞则去重）；
 * * {@link QueryCore.observe} —— 之后的每次观察（key 信号变化 / Effect 重跑）；
 * * {@link QueryCore.reload} —— 变更成功后强制重拉（key 没变也发）；
 * * {@link QueryCore.settle} —— 请求结束（成功或失败都算）；
 * * {@link QueryCore.failed} —— 请求失败：把这一条从"已发给过"里撤掉，下一次观察允许重试。
 *
 * 产出只有三种：什么都不做、清空对外状态、发一次请求。
 *
 * Rust 的 `PartialEq` 在 TS 里没有对应物，所以 key 的比较与 {@link unchanged} 都退到
 * 结构比较（原始值 / 数组 / 普通对象）；筛选条件快照这类对象 key 也能正确去重。
 */

/**
 * 核心给出的下一步。
 *
 * `type` 是 TS 侧的判别标签（对应 Rust 的三个变体 `Idle` / `Clear` / `Fetch`）。
 */
export type Step<K> =
  /** 什么都不用做：同一份 key 已经取过、或已经在飞。 */
  | { type: 'idle' }
  /** key 变成"无"（例如还没选账本）：清空对外状态，不发请求。 */
  | { type: 'clear' }
  /** 发一次请求。 */
  | { type: 'fetch'; key: K; generation: number }

/** 一份"发过 / 正在飞"的 `(key, generation)`，对应 Rust 的元组。 */
interface Mark<K> {
  readonly key: K
  readonly generation: number
}

/** 普通对象：原型是 `Object.prototype` 或 `null`（DTO 都是这种形状）。 */
function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * 结构相等：Rust `PartialEq` 的替身。
 *
 * 只覆盖领域结果会出现的形状：原始值、数组、普通对象。别的对象（例如 `Date`）只有
 * 同一引用才算相等 —— 宁可多写一次信号，也不把两个不同的对象误判成"没变"。
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray || bIsArray) {
    if (!aIsArray || !bIsArray || a.length !== b.length) return false
    for (let index = 0; index < a.length; index += 1) {
      if (!sameValue(a[index], b[index])) return false
    }
    return true
  }

  if (!isPlainObject(a) || !isPlainObject(b)) return false
  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const aKeys = Object.keys(aRecord)
  const bKeys = Object.keys(bRecord)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key)) return false
    if (!sameValue(aRecord[key], bRecord[key])) return false
  }
  return true
}

/** 这一份 `(key, generation)` 是否就是手上的那一份。 */
function sameMark<K>(mark: Mark<K>, key: K, generation: number): boolean {
  return sameValue(mark.key, key) && mark.generation === generation
}

/**
 * 一条查询的决策状态。
 *
 * `K` 是去重的依据（账本 id / 年份 / 筛选条件的快照…），只要求能比较相等。
 * `generation` 是 {@link QueryCore.reload} 的自增计数：变了就表示"这一份 key 要重算"，
 * 用它去比对 {@link QueryCore.settle} 回来的那一份，过期结果自然落空。
 */
export class QueryCore<K> {
  /** 当前观察到的 key（`null` = 现在不拉） */
  private key: K | null = null
  /** 是否已经清空过一次对外状态（避免每次重渲染都重复写同一份空值） */
  private cleared = false
  /** 强制重拉的自增计数 */
  private generationCount = 0
  /** 已经"发过"的 `(key, generation)`（含正在飞的） */
  private served: Mark<K> | null = null
  /** 正在飞的 `(key, generation)` */
  private inFlight: Mark<K> | null = null

  /**
   * 当前观察到的 key（`null` = 现在不拉）。
   *
   * Rust 侧这个字段是私有的，决策本身也不读它；这里留一个只读窗口，排障时能看见
   * 状态机到底认的是哪一份 key。
   */
  get currentKey(): K | null {
    return this.key
  }

  /**
   * 视图（重新）挂载：即使这一份 key 已经取过，也**复核一次**（跨视图缓存的语义：
   * 先显示手上的缓存、再静默复核）。仍然不给正在飞的同一份 key 再发一份。
   */
  mount(key: K | null): Step<K> {
    return this.plan(key, true)
  }

  /**
   * 之后的每次观察（key 信号变化 / Effect 重跑）：
   * 同一份 key 取过就不再发 —— 视图重建不该变成请求风暴。
   */
  observe(key: K | null): Step<K> {
    return this.plan(key, false)
  }

  /** 强制重拉：变更成功后调用（key 没变也会再发一次）。 */
  reload(key: K | null): Step<K> {
    this.generationCount += 1
    return this.plan(key, false)
  }

  /**
   * 请求结束（成功或失败都算）：清掉"正在飞"。
   *
   * 返回这一份是不是**当前**那一份 —— 不是（请求期间 key 换了 / 又重拉了）
   * 就说明结果已经过期，调用方应当丢弃它。
   */
  settle(key: K, generation: number): boolean {
    const current = this.inFlight !== null && sameMark(this.inFlight, key, generation)
    if (current) {
      this.inFlight = null
    }
    return current
  }

  /**
   * 请求失败：把这一条从"发过"里撤掉，让下一次观察能重试
   * （没有"刷新"按钮的页面靠这一条，否则一次失败会永久卡住）。
   */
  failed(key: K, generation: number): void {
    if (this.served !== null && sameMark(this.served, key, generation)) {
      this.served = null
    }
  }

  /** 当前的重复计数（仅用于断言 / 排障）。 */
  generation(): number {
    return this.generationCount
  }

  private plan(key: K | null, force: boolean): Step<K> {
    if (key === null) {
      // key 变成"无"：清空对外状态。已经清干净了就什么都不做 ——
      // 每次重渲染都返回 Clear 会让界面反复写同一份空值。
      const alreadyCleared = this.cleared
      this.key = null
      this.cleared = true
      this.served = null
      this.inFlight = null
      return alreadyCleared ? { type: 'idle' } : { type: 'clear' }
    }
    this.cleared = false

    // 同一份 key 正在飞 → 去重（来回切子功能时最常见：上一次还没回来就又挂载了）。
    if (this.inFlight !== null && sameValue(this.inFlight.key, key)) {
      this.key = key
      return { type: 'idle' }
    }

    // 同一份 `(key, generation)` 已经发过 → 除非是挂载复核，否则不必再发。
    const servedSame = this.served !== null && sameMark(this.served, key, this.generationCount)
    if (!force && servedSame) {
      this.key = key
      return { type: 'idle' }
    }

    this.key = key
    this.served = { key, generation: this.generationCount }
    this.inFlight = { key, generation: this.generationCount }
    return { type: 'fetch', key, generation: this.generationCount }
  }
}

/**
 * 复核回来的结果与手上缓存是否**一致**。
 *
 * 一致就不该写信号：统计视图的图表是"读信号即重建"的，同值通知会让入场动画重播
 * （真实缺陷：曲线一直在闪）。这条判据过去写在股票页的注释里，现在是一条能断言的决定。
 *
 * `current` 是 Rust 的 `Option<&T>`：`null`（没缓存）永远算不一致。
 */
export function unchanged<T>(current: T | null, fresh: T): boolean {
  return current !== null && sameValue(current, fresh)
}
