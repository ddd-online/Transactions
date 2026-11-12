/**
 * 导出网页（`src/pages/stock-ladder-page.ts`）里板块色的出处。
 *
 * 网页上的颜色只在两处：卡片描边与板块名。底色只表示状态（在板 = 纸白、断板 = 灰），
 * 所以这里只算三档：圆点 tone、描边 border、板块名 boardInk。
 *
 * 六个鲜艳色相（彼此差 45°）留给「多家涨停」的板块；只有一个涨停的板块统一用主色蓝 ——
 * 蓝色的色相取自 `#3964fe`（OKLCH 266.6°），明度与彩度跟其他六档一致：
 * 它只是身份，不是强调，孤家寡人不该比成群的热闹。
 * 蓝色附近的两个色相（245° / 290°）不算进鲜艳色板，否则「蓝 = 只有一家」这条读不出来。
 *
 * 用法：node scripts/ladder-board-palette.mjs
 */
import { fileURLToPath } from 'node:url'

/** 六个鲜艳色相：彼此差 45°（跨过蓝色那一段留白），避开纯黄绿（小字在浅底上最难读）。 */
const HUES = [20, 65, 110, 155, 200, 335]

/** 主色蓝：`--transactions-color-primary` 的色相，运行时从十六进制反算。 */
const ACCENT = '#3964fe'

/** 每个角色的 OKLCH（明度、彩度）：同一角色在所有色相上取值相同。 */
const ROLES = {
  light: {
    paper: '#f9fafb',
    sheet: '#ffffff',
    minor: '#f3f4f6',
    ink: '#0f1115',
    ink2: '#61666b',
    tint: [0.93, 0.06],
    tone: [0.6, 0.15],
    border: [0.64, 0.16],
    boardInk: [0.45, 0.14],
    subInk: [0.44, 0.045],
  },
  dark: {
    paper: '#0f1115',
    sheet: '#1c1f26',
    minor: '#14161a',
    ink: '#f2f4f8',
    ink2: '#b6bcc6',
    tint: [0.3, 0.055],
    tone: [0.76, 0.12],
    border: [0.62, 0.14],
    boardInk: [0.85, 0.1],
    subInk: [0.78, 0.04],
  },
}

const toLinear = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
const fromLinear = (channel) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

function oklchToRgb(lightness, chroma, hueDegrees) {
  const hue = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((value) => fromLinear(Math.min(1, Math.max(0, value))))
}

/** 十六进制 → OKLCH：主色蓝的色相不手抄，免得改了令牌、纸上还停在旧色相。 */
function rgbToOklch(hex) {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((offset) =>
    toLinear(Number.parseInt(value.slice(offset, offset + 2), 16) / 255),
  )
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const hue = (Math.atan2(bb, a) * 180) / Math.PI
  return { lightness, chroma: Math.hypot(a, bb), hue: hue < 0 ? hue + 360 : hue }
}

const inGamut = (rgb) => rgb.every((value) => value >= -0.0005 && value <= 1.0005)

/** OKLCH → `#rrggbb`；越界就把彩度往回收，直到落回 sRGB。 */
function oklchHex(lightness, chroma, hue) {
  let current = chroma
  let rgb = oklchToRgb(lightness, current, hue)
  while (!inGamut(rgb) && current > 0.004) {
    current -= 0.002
    rgb = oklchToRgb(lightness, current, hue)
  }
  return `#${rgb
    .map((value) =>
      Math.round(Math.min(1, Math.max(0, value)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

const channels = (hex) => {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
}

const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((value) => toLinear(value / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((left, right) => right - left)
  return (high + 0.05) / (low + 0.05)
}

const lab = (hex) => {
  const [r, g, b] = channels(hex).map((value) => toLinear(value / 255))
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (value) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const deltaE = (a, b) => {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

const accent = rgbToOklch(ACCENT)
console.log(`主色 ${ACCENT} 的 OKLCH 色相 ${accent.hue.toFixed(1)}°`)

const build = (roles) => {
  const make = (hue, [lightness, chroma]) => oklchHex(lightness, chroma, hue)
  const rows = [...HUES, accent.hue].map((hue) => ({
    hue,
    tone: make(hue, roles.tone),
    background: make(hue, roles.tint),
    border: make(hue, roles.border),
    boardInk: make(hue, roles.boardInk),
    subInk: make(hue, roles.subInk),
  }))
  return rows
}

let worstInk = 99
let worstBorder = 99
let worstDelta = 99
let worstInkGap = 360
for (const [theme, roles] of Object.entries(ROLES)) {
  const rows = build(roles)
  console.log(`\n${theme}:`)
  for (const row of rows) {
    console.log(
      `    { tone: '${row.tone}', background: '${row.background}', border: '${row.border}', boardInk: '${row.boardInk}', subInk: '${row.subInk}' },`,
    )
    worstInk = Math.min(worstInk, contrast(roles.ink, roles.sheet))
    worstInk = Math.min(worstInk, contrast(roles.ink2, roles.sheet), contrast(roles.ink2, roles.minor))
    for (const ink of [roles.ink, row.boardInk, row.subInk]) {
      worstInk = Math.min(worstInk, contrast(ink, row.background))
    }
    for (const ink of [row.boardInk, roles.ink2]) {
      for (const face of [roles.sheet, roles.minor]) {
        worstInk = Math.min(worstInk, contrast(ink, face))
      }
    }
    worstBorder = Math.min(
      worstBorder,
      contrast(row.border, row.background),
      contrast(row.border, roles.minor),
    )
    const toAccent = Math.abs(row.hue - accent.hue)
    if (row.hue !== accent.hue) worstInkGap = Math.min(worstInkGap, toAccent)
  }
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      worstDelta = Math.min(worstDelta, deltaE(rows[left].background, rows[right].background))
      worstDelta = Math.min(worstDelta, deltaE(rows[left].border, rows[right].border))
      worstDelta = Math.min(worstDelta, deltaE(rows[left].boardInk, rows[right].boardInk))
      worstDelta = Math.min(worstDelta, deltaE(rows[left].tone, rows[right].tone))
    }
  }
}

console.log(`\n最低字色对比度 ${worstInk.toFixed(2)}:1（正文 / 板块名 / 代码行 / 次要字，AA 要 4.5）`)
console.log(`最低描边对比度 ${worstBorder.toFixed(2)}:1（彩底与灰卡上 1px 线要看得见）`)
console.log(`两两最小 ΔE76 ${worstDelta.toFixed(1)}（低于 10 就分不出来了）`)
console.log(`鲜艳色相距主色蓝最近 ${worstInkGap.toFixed(1)}°（至少留 45° 才读得出「蓝 = 只有一家」）`)
console.log(`出自 ${fileURLToPath(import.meta.url)}`)
