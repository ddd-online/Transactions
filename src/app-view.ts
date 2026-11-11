/**
 * 视图（左侧导航的一页）与功能开关：导航顺序、某一页对应哪个开关，以及被关掉之后落在哪一页。
 *
 * 纯数据 + 纯函数，不碰 React —— 外壳拿它渲染导航与标题，单测直接测落位规则。
 */

import type { FeatureFlags } from '../shared/types/config'

export type View = 'accounting' | 'stock' | 'events' | 'diary' | 'todo' | 'settings'

export interface NavView {
  view: View
  label: string
  feature: keyof FeatureFlags
}

/** 左侧导航从上到下的顺序 —— 也就是「第一个还开着的功能」的优先级。 */
export const NAV_VIEWS: ReadonlyArray<NavView> = [
  { view: 'accounting', label: '记账', feature: 'accounting' },
  { view: 'stock', label: '股票', feature: 'stock' },
  { view: 'todo', label: '待办', feature: 'todo' },
  { view: 'events', label: '事件', feature: 'keyEvent' },
  { view: 'diary', label: '日记', feature: 'diary' },
]

/** 某个视图对应的功能开关；设置页不受开关约束，返回 null。 */
export function viewFeature(view: View): keyof FeatureFlags | null {
  return NAV_VIEWS.find((entry) => entry.view === view)?.feature ?? null
}

/** 顶栏标题：导航那几页用导航上的名字，设置页单独一条。 */
export function viewLabel(view: View): string {
  return view === 'settings'
    ? '应用设置'
    : (NAV_VIEWS.find((entry) => entry.view === view)?.label ?? '记账')
}

/**
 * 默认页：导航里第一个还开着的功能。
 *
 * `features === null`（配置还没读到）按全开算，落回记账 —— 与没有开关时一样；
 * 配置到了之后再按开关落位。功能全关掉时只剩设置页，它本来就不受开关约束。
 */
export function defaultView(features: FeatureFlags | null): View {
  return NAV_VIEWS.find((entry) => features?.[entry.feature] !== false)?.view ?? 'settings'
}

/**
 * 真正要渲染的页：当前页被开关关掉时落到 `defaultView`。
 *
 * 派生而不是在 effect 里改 state —— 配置到达或开关写回都会换一份 `features` 对象，
 * 派生出来第一帧就是对的，不会先渲染一帧记账页再跳走。回退的落点也不能写死记账：
 * 记账自己就可能是被关掉的那个。
 */
export function resolveView(view: View, features: FeatureFlags | null): View {
  const feature = viewFeature(view)
  if (!feature || features?.[feature] !== false) return view
  return defaultView(features)
}
