/**
 * 事件的 20 个身份色。
 *
 * 事件和账本一样，靠**颜色 + 名称**认人：名称永远在旁边，颜色只做辅助。这些色不是 chrome，
 * 是用户自己挑的内容 —— 挑中的那一个十六进制会写进库，所以这份清单是它的权威来源，
 * 改色必须配一条迁移（见 `electron/db/migrate.ts` 的 `event_tone_contrast`）。
 *
 * 判据：每个色在**纸白与画布**上都要过 3:1（WCAG 1.4.11 非文本对比 —— 6px 圆点和 3px
 * 竖条都算有意义的图形）。原来土黄 `#C6963A` 只有 2.57:1、橘黄 `#D48838` 2.72:1，
 * 一列事件里最先糊掉的就是它们，所以各压暗了一档；色相和名字都没动。
 *
 * 深色下这 20 个值由 CSS 往白里提 32%（`.key-event-tone`）：中间色调压在近黑底上会读成
 * 一团暗色，和账本那八个身份色「深色各提亮一档」是同一条规矩。提亮只会拉高对比度，
 * 所以深色不需要另一套判据。
 */

export interface EventTone {
  /** 存进 `key_event.color` 的值。 */
  value: string
  /** 选择器里的名字，也是读屏名。 */
  name: string
}

export const EVENT_TONES: readonly EventTone[] = [
  { value: '#D9705A', name: '砖红' },
  { value: '#C25460', name: '玫红' },
  { value: '#D07048', name: '橘红' },
  { value: '#C17C33', name: '橘黄' },
  { value: '#B08534', name: '土黄' },
  { value: '#A09040', name: '橄榄黄' },
  { value: '#5C9858', name: '草绿' },
  { value: '#4A8E70', name: '松绿' },
  { value: '#5C9E7C', name: '豆绿' },
  { value: '#3D8878', name: '墨绿' },
  { value: '#389098', name: '青蓝' },
  { value: '#4A78A0', name: '钢蓝' },
  { value: '#5C8DB5', name: '天蓝' },
  { value: '#6070A0', name: '靛蓝' },
  { value: '#7868A0', name: '蓝紫' },
  { value: '#8C6B9E', name: '紫罗兰' },
  { value: '#A06088', name: '紫红' },
  { value: '#B06078', name: '胭脂' },
  { value: '#8C7B6E', name: '茶褐' },
  { value: '#7E8890', name: '青灰' },
]

/** 深色下往白里提的比例：与 `.key-event-tone` 里那条 `color-mix` 保持一致。 */
export const EVENT_TONE_DARK_LIFT = 0.32
