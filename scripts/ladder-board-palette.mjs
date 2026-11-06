/**
 * 导出网页（`src/pages/stock-ladder-page.ts`）里那八个板块色相的出处。
 *
 * 软件里的账本身份色不能直接铺成卡片：八档里有四档是暖褐，做成卡片就是四张分不出来的米色。
 * 纸上另起一套 —— 八个色相等明度、等彩度，只有色相在走，所以八张卡一样重。
 * 这个脚本按 OKLCH 算出每个色相在每种角色上的十六进制，并复核对比度与色差；
 * 改了色相或明度就重跑、把打印出来的表贴回 `LADDER_BOARD_PALETTES`。
 *
 * 用法：node scripts/ladder-board-palette.mjs
 */
import { fileURLToPath } from 'node:url'

/** 八个色相角：彼此差 45°，避开纯黄绿（小字在浅底上最难读的那一段）。 */
const HUES = [20, 65, 110, 155, 200, 245, 290, 335]

/** 每个角色的 OKLCH（明度、彩度）：同一角色在八个色相上取值相同。 */
const ROLES = {
  light: {
    paper: '#f9fafb',
    sheet: '#ffffff',
    ink: '#0f1115',
    tint: [0.93, 0.06],
    broken: [0.955, 0.04],
    border: [0.7, 0.13],
    boardInk: [0.45, 0.14],
    subInk: [0.44, 0.045],
    tone: [0.6, 0.15],
  },
  dark: {
    paper: '#0f1115',
    sheet: '#1c1f26',
    ink: '#f2f4f8',
    tint: [0.3, 0.055],
    broken: [0.26, 0.04],
    border: [0.52, 0.11],
    boardInk: [0.85, 0.1],
    subInk: [0.78, 0.04],
    tone: [0.76, 0.12],
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

const build = (roles) => {
  const make = (hue, [lightness, chroma]) => oklchHex(lightness, chroma, hue)
  return HUES.map((hue) => ({
    tone: make(hue, roles.tone),
    background: make(hue, roles.tint),
    backgroundBroken: make(hue, roles.broken),
    border: make(hue, roles.border),
    boardInk: make(hue, roles.boardInk),
    subInk: make(hue, roles.subInk),
  }))
}

let worstInk = 99
let worstBorder = 99
let worstDelta = 99
for (const [theme, roles] of Object.entries(ROLES)) {
  const rows = build(roles)
  console.log(`\n${theme}:`)
  for (const row of rows) {
    console.log(
      `    { tone: '${row.tone}', background: '${row.background}', backgroundBroken: '${row.backgroundBroken}', border: '${row.border}', boardInk: '${row.boardInk}', subInk: '${row.subInk}' },`,
    )
    for (const ink of [row.boardInk, row.subInk]) {
      for (const face of [row.background, row.backgroundBroken]) {
        worstInk = Math.min(worstInk, contrast(ink, face))
      }
    }
    worstInk = Math.min(worstInk, contrast(roles.ink, row.background))
    worstInk = Math.min(worstInk, contrast(roles.ink, row.backgroundBroken))
    worstBorder = Math.min(worstBorder, contrast(row.border, row.background))
  }
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      worstDelta = Math.min(worstDelta, deltaE(rows[left].background, rows[right].background))
    }
  }
}

console.log(`\n最低字色对比度 ${worstInk.toFixed(2)}:1（正文 / 板块名 / 代码行，AA 要 4.5）`)
console.log(`最低描边对比度 ${worstBorder.toFixed(2)}:1（对着自己的卡面，虚线框要看得见）`)
console.log(`两两底色最小 ΔE76 ${worstDelta.toFixed(1)}（低于 10 就分不出来了）`)
console.log(`出自 ${fileURLToPath(import.meta.url)}`)

