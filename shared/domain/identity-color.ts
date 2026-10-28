/**
 * 账本 / 板块的身份色。
 *
 * 八个自然色是设计系统里已有的「账本身份」色（tokens.css），
 * 由 seed 稳定映射到其中一个：同一个账本每次打开都是同一种颜色，
 * 不需要数据库字段，也不需要用户选色。
 *
 * 连板天梯的板块名也用这一组色（按板块名哈希）：同名的板块在任何一列、
 * 任何一天都是同一色。那边是**文字**，对比度靠 CSS 的 color-mix 压到 4.5:1 以上。
 */

export const IDENTITY_TONES = [
  'forest',
  'amber',
  'slate-blue',
  'vermillion',
  'warm-brown',
  'ochre',
  'moss',
  'camel',
] as const

export type IdentityTone = (typeof IDENTITY_TONES)[number]

/** FNV-1a：32 位、对短字符串足够均匀，且跨平台稳定。 */
export function identityTone(seed: string): IdentityTone {
  let hash = 0x811c9dc5
  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return IDENTITY_TONES[hash % IDENTITY_TONES.length]
}

/** 返回 CSS 变量引用；调用方不接触裸色值，主题切换由 token 完成。 */
export function identityColor(seed: string): string {
  return `var(--transactions-ledger-${identityTone(seed)})`
}
