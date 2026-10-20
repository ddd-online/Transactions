/**
 * 列表区的**四态判定**：这一段该显示"加载中 / 失败 / 空 / 就绪"里的哪一个。
 *
 * 从前这条优先级在每个页面各判一遍（界面里 11 处 `if loading { "正在加载…" } else { "暂无××" }`），
 * 于是有两个真实后果：
 *
 * * **失败被渲染成业务空态** —— 用户被告知「暂无已清仓股票」，而其实是查询失败了；
 * * **首帧闪一下空态** —— `loading` 是在取数 module 的 effect 里才置位的，第一次渲染时它是
 *   `false`、结果还是默认值，于是"还没回来"被判成了"确实是空"。
 *
 * 这里把优先级钉成一条规则（见 {@link sectionState}），页面只负责把文案填进对应的槽位。
 */

/** 列表区的四种状态。 */
export const SectionState = {
  /** 还没跑完一次（含正在重拉）：显示加载态。 */
  Loading: 'loading',
  /** 上一次取数失败了（失败文案在调用方手上）：显示失败态，**不要**显示成空。 */
  Failed: 'failed',
  /** 跑完了、成功了，但确实没有数据。 */
  Empty: 'empty',
  /** 有数据，正常渲染。 */
  Ready: 'ready',
} as const

export type SectionState = (typeof SectionState)[keyof typeof SectionState]

/**
 * 四态的判据。
 *
 * 优先级：
 *
 * 1. **没跑完过（或正在跑）一律 `Loading`** —— 包括"失败了正在重试"这一段：手上那份错已经过期，
 *    显示加载比显示旧错误更贴近事实；
 * 2. 跑完了且有失败文案 → `Failed`（**失败不是空**）；
 * 3. 跑完了、没失败、但没有数据 → `Empty`；
 * 4. 其余 → `Ready`。
 *
 * `itemsEmpty` 只看"手上这份结果是不是空的"，不区分它是默认值还是真结果 —— 那件事靠 `loaded`
 * 表达。
 */
export function sectionState(
  itemsEmpty: boolean,
  loading: boolean,
  loaded: boolean,
  failed: string | null,
): SectionState {
  if (loading || !loaded) {
    return SectionState.Loading
  }
  if (failed !== null) {
    return SectionState.Failed
  }
  if (itemsEmpty) {
    return SectionState.Empty
  }
  return SectionState.Ready
}

/**
 * 同 {@link sectionState}，但**重拉时不把手上已有的内容换成加载态**。
 *
 * 差别只有一条：**手上有内容且没有失败文案 ⇒ `Ready`**（哪怕 `loading` 是 true）。
 *
 * 为什么需要它（真实缺陷）：页面在写入成功后习惯"整表重拉"，而重拉会让 `loading` 置位 ——
 * 若按 {@link sectionState} 判成 `Loading`，整块列表会被换成"正在加载…"，列表所在的那一屏
 * **高度瞬间塌成一行**；浏览器此时会把滚动位置夹回顶部（而且不会自动恢复），展开着的
 * 面板/浮层也一起消失，用户看到的就是"页面像是刷新了"（待办页写进度即复现）。
 * 首帧（`!loaded`）与"手上没有内容"仍按原规则显示加载态；失败仍显示失败态 ——
 * **失败既不当成空，也不拿旧内容掩盖**。
 */
export function sectionStateKeepingContent(
  itemsEmpty: boolean,
  loading: boolean,
  loaded: boolean,
  failed: string | null,
): SectionState {
  if (!itemsEmpty && failed === null) {
    return SectionState.Ready
  }
  return sectionState(itemsEmpty, loading, loaded, failed)
}
