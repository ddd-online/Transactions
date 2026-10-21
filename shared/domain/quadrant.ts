/**
 * 四象限（紧急 × 重要）的纯算法：落在哪个象限、点在画布上的位置、弹窗里按什么顺序列、
 * 同坐标的点怎么错开。
 *
 * 界面上是待办页的一个子功能，但这里装的几件事都是**规则**：
 *
 * * {@link quadrantFromLevels}：两轴是六档（`-5 / -3 / -1 / 1 / 3 / 5`，**没有 0**），
 *   所以"正负"就是判据；
 * * {@link pointOf}：坐标就是这两个档位，但**绘图区四周留白**（{@link PLOT_INSET}）——
 *   六档线性铺满画布的话，最外那两档正好压在画布边线上，半径 9px 的点有一半在画布外，
 *   再叠上抖动就可能整颗都不见了（用户报的正是"紧急、重要都最高的事项在象限图上找不到"）；
 * * {@link rows}：该象限的进行中事项，先按紧急度降序、再按重要度降序；
 *   用**稳定**排序，同紧急同重要的两条保持卡片序 → 同一份数据每次打开弹窗都排成一个样；
 * * {@link jitterOf}：同一坐标上的两颗点按 id 各带一个固定偏移（标准库 `DefaultHasher`
 *   的 SipHash-1-3，固定种子，不是随机数）—— 重渲染不会让点自己抖。
 *
 * 象限的**名字与说明文案**留在界面侧（只有那一页用得到）。
 */

/** 落在哪个象限：纵轴 = 重要度、横轴 = 紧急度。 */
export const Quadrant = {
  /** 重要且紧急 */
  Now: 'now',
  /** 重要但不紧急 */
  Plan: 'plan',
  /** 不重要且不紧急 */
  Less: 'less',
  /** 紧急但不重要 */
  Delegate: 'delegate',
} as const

export type Quadrant = (typeof Quadrant)[keyof typeof Quadrant]

/** 四个象限（固定顺序：从"马上做"顺时针到"授权做"）。 */
export const QUADRANTS: readonly Quadrant[] = [
  Quadrant.Now,
  Quadrant.Plan,
  Quadrant.Less,
  Quadrant.Delegate,
]

/** 一个能落进象限的事项：只要这两个档位。 */
export interface QuadrantItem {
  readonly urgency: number
  readonly importance: number
}

/** 两轴六档、没有 0 ⇒ "正负"就是判据，不必处理"正好压在轴上"。 */
export function quadrantFromLevels(urgency: number, importance: number): Quadrant {
  if (importance > 0) {
    return urgency > 0 ? Quadrant.Now : Quadrant.Plan
  }
  return urgency > 0 ? Quadrant.Delegate : Quadrant.Less
}

/** 某个事项落在哪个象限。 */
export function quadrantOf(item: QuadrantItem): Quadrant {
  return quadrantFromLevels(item.urgency, item.importance)
}

/**
 * 弹窗里列哪些、按什么顺序：该象限的事项，先按紧急度降序、再按重要度降序。
 *
 * `Array.prototype.sort` 是稳定排序，所以同档位的两条保持传入顺序（卡片序 → 事项序）。
 */
export function rows<T extends QuadrantItem>(items: readonly T[], quad: Quadrant): T[] {
  const matched = items.filter((item) => quadrantOf(item) === quad)
  matched.sort(
    (left, right) => right.urgency - left.urgency || right.importance - left.importance,
  )
  return matched
}

const MASK_64 = (1n << 64n) - 1n

interface SipState {
  v0: bigint
  v1: bigint
  v2: bigint
  v3: bigint
}

function rotateLeft64(value: bigint, bits: bigint): bigint {
  return ((value << bits) | (value >> (64n - bits))) & MASK_64
}

/** SipHash 的 SipRound（四个状态字原地更新）。 */
function sipRound(state: SipState): void {
  state.v0 = (state.v0 + state.v1) & MASK_64
  state.v1 = rotateLeft64(state.v1, 13n)
  state.v1 ^= state.v0
  state.v0 = rotateLeft64(state.v0, 32n)
  state.v2 = (state.v2 + state.v3) & MASK_64
  state.v3 = rotateLeft64(state.v3, 16n)
  state.v3 ^= state.v2
  state.v0 = (state.v0 + state.v3) & MASK_64
  state.v3 = rotateLeft64(state.v3, 21n)
  state.v3 ^= state.v0
  state.v2 = (state.v2 + state.v1) & MASK_64
  state.v1 = rotateLeft64(state.v1, 17n)
  state.v1 ^= state.v2
  state.v2 = rotateLeft64(state.v2, 32n)
}

/**
 * `std::collections::hash_map::DefaultHasher`（SipHash-1-3，密钥全 0）的逐位实现。
 *
 * 的 `Hash for str` 在 UTF-8 字节后还写一个 `0xff` 终止符；这里照做，
 * 因此同一个 id 在 与 TS 两侧得到同一个 64 位哈希、同一个偏移。
 */
function defaultHasher(input: string): bigint {
  const encoded = new TextEncoder().encode(input)
  const data = new Uint8Array(encoded.length + 1)
  data.set(encoded)
  data[encoded.length] = 0xff

  const state: SipState = {
    v0: 0x736f6d6570736575n,
    v1: 0x646f72616e646f6dn,
    v2: 0x6c7967656e657261n,
    v3: 0x7465646279746573n,
  }

  let offset = 0
  while (offset + 8 <= data.length) {
    let word = 0n
    for (let index = 0; index < 8; index += 1) {
      word |= BigInt(data[offset + index]) << BigInt(8 * index)
    }
    state.v3 ^= word
    sipRound(state) // SipHash-1-3：压缩 1 轮
    state.v0 ^= word
    offset += 8
  }

  let tail = BigInt(data.length & 0xff) << 56n
  for (let index = offset; index < data.length; index += 1) {
    tail |= BigInt(data[index]) << BigInt(8 * (index - offset))
  }
  state.v3 ^= tail
  sipRound(state)
  state.v0 ^= tail
  state.v2 ^= 0xffn
  sipRound(state) // 终结 3 轮
  sipRound(state)
  sipRound(state)

  return (state.v0 ^ state.v1 ^ state.v2 ^ state.v3) & MASK_64
}

/**
 * 按 id 给每个点一个固定的小偏移，远近只够分开两颗点、不改变它落在哪个象限。
 *
 * 用 `DefaultHasher`（标准库、固定种子）的同一份算法而不是随机数：
 * 同一份数据每次渲染都落在同一处，且与既有行为逐位一致。
 */
export function jitterOf(id: string): readonly [number, number] {
  const bits = defaultHasher(id)
  const dx = Number(bits % 21n) - 10
  const dy = Number((bits >> 21n) % 21n) - 10
  return [dx, dy]
}

/**
 * 数据点的半径（px）：界面上的 `<circle r=…>` 与这里用的是**同一个数**
 * （改了半径就得跟着改留白，否则点又会被画布裁掉）。
 */
export const POINT_RADIUS = 9

/** 抖动偏移的绝对值上限（px）：{@link jitterOf} 的输出恒落在 `±JITTER_MAX` 之内。 */
export const JITTER_MAX = 10

/** 最外档位的点与画布边线之间还要留出的空隙（px）：与轴端标注那 8px 同一档。 */
export const PLOT_MARGIN = 8

/**
 * 绘图区四周的留白（px）= 点半径 + 白色描边的一半（`stroke-width: 2`）+ 抖动上限 + 空隙。
 *
 * 六个档位是**线性铺进绘图区**的，所以最外那两档离画布边线正好一个留白 —— 连"最大抖动"
 * 和"描边"都还在画布内。留白只改变"画布边线 ↔ 最外档位"这段距离（约 28px）：
 * 中间的档位、十字轴、象限底与水印都不动。
 */
export const PLOT_INSET = POINT_RADIUS + 1 + JITTER_MAX + PLOT_MARGIN

/**
 * 两轴档位的跨度（最外两档之差；六档 `-5..=5` ⇒ 10）。
 *
 * 与 `TODO_LEVELS` 是否一致由单测盯着（档位表加了更外的档而这里没跟上，
 * 那颗点就会跑到画布外）。
 */
export const LEVEL_SPAN = 10

/**
 * 十字轴（两轴的 0 档）在画布上的位置：绘图区的留白是**对称**的，所以轴恒在画布中心 ——
 * 图上的十字与"正负就是象限"（{@link quadrantFromLevels}）永远对齐。
 */
export function axisOf(w: number, h: number): readonly [number, number] {
  return [w / 2, h / 2]
}

/**
 * 一个事项在画布（`w × h`，px）上的**中心点**：档位线性铺进留白后的绘图区，
 * 0 档压在十字轴上（{@link axisOf}），最后叠上这个 id 自己的固定抖动（{@link jitterOf}）。
 *
 * **不变量**（`points never leave the canvas` 单测盯着）：任何档位、任何 id，
 * 点连同半径与描边都完整落在画布内；且点落在十字轴的哪一侧，与档位的正负一致。
 */
export function pointOf(
  urgency: number,
  importance: number,
  id: string,
  w: number,
  h: number,
): readonly [number, number] {
  const [dx, dy] = jitterOf(id)
  const [axisX, axisY] = axisOf(w, h)
  // 绘图区比画布小一圈（两侧各一个留白）。画布小到装不下留白时收成 0（界面上到不了：
  // 卡片有 220px 的最小高度、宽度是整个版心），那时点会叠在中心。
  const plotW = Math.max(w - 2 * PLOT_INSET, 0)
  const plotH = Math.max(h - 2 * PLOT_INSET, 0)
  return [
    axisX + (urgency / LEVEL_SPAN) * plotW + dx,
    // 纵轴向上为正：重要度越高，y 越小（越靠近画布顶边）
    axisY - (importance / LEVEL_SPAN) * plotH + dy,
  ]
}
