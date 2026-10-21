/**
 * 写路径的**判据核心**：一次写意图出发时记下的东西，回来时用来判断"还该不该落地"。
 *
 * 读半边有 `query`（去重 / generation / 复核判定），写半边从前没有对应的东西 ——
 * "账本在写的过程中被切走了"这件事由**每个页面各写一遍**：全仓 9 处
 * `if stores.current_ledger_id.get_untracked() != ledger_id { return; }`。
 * 这些判断**比读半边那份更弱**：它们只比账本，而读的 `QueryCore::settle` 比的是整个
 * `(key, generation)` —— 翻页/改筛选之后第 3 页的应答会在第 1 页落地。
 *
 * 这里先把**写意图的目标**收成一个可断言的值：出发时记下是谁的活，回来时问一句还该不该落地。
 * 规则只有一条但值得钉住 —— **空目标（还没选账本）永远算过期**：那种写迟早会被后端拒绝，
 * 落在界面上只会让空态闪出数据。
 *
 * 这只是"写路径 module"的第一片：把"谁过期"这条判据从 9 个调用点的手写比较里搬出来。
 */

/**
 * 判据本体（自由函数版）：`recorded` 是出发时记下的账本，`current` 是现在的。
 *
 * 两种用法各取所需：需要**跨 `await` 持有**快照时用 {@link WriteTarget}（名字说明这个字符串是
 * "出发时"的）；只是当场比一下就用这个自由函数，不必为了比较造一个值。
 */
export function isStale(recorded: string, current: string): boolean {
  return recorded === '' || recorded !== current
}

/**
 * 一次写意图的目标账本。
 *
 * 出发时 `writeTarget(当时的账本 id)`，异步回来后 `isStale(现在的账本 id)`：
 * `true` 表示这次写属于**旧**账本 —— 本地不落地、也不提示（用户已经在看别的账本了）。
 */
export interface WriteTarget {
  /** 出发时记下的账本 id（空串表示"还没选账本"）。 */
  readonly ledgerId: string

  /** 账本已经切走（或压根没选）→ 这次写的结果**不该落地**。 */
  isStale(currentLedgerId: string): boolean
}

/** 记下这次写是替哪个账本做的。 */
export function writeTarget(ledgerId: string): WriteTarget {
  return {
    ledgerId,
    isStale: (currentLedgerId) => isStale(ledgerId, currentLedgerId),
  }
}
