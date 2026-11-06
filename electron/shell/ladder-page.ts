import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 导出网页的字体：和软件同一套（Inter / JetBrains Mono）。
 *
 * 网页是单文件、会被拷到别处打开，所以在这里把构建产物里的四个字重内嵌成 base64 ——
 * 不联网、不依赖安装字体，离开这台机器也还是这个长相。
 * 文件名带构建哈希，只能按前缀找；找不到（开发模式走 Vite dev，没有 renderer/assets）
 * 就什么都不加，模板里已经写好了系统字体回退。
 */
const FONT_FACES = [
  { family: 'Inter', weight: 400, pattern: /^inter-latin-400-normal-.*\.woff2$/ },
  { family: 'Inter', weight: 600, pattern: /^inter-latin-600-normal-.*\.woff2$/ },
  { family: 'Inter', weight: 700, pattern: /^inter-latin-700-normal-.*\.woff2$/ },
  {
    family: 'JetBrains Mono',
    weight: 500,
    pattern: /^jetbrains-mono-latin-500-normal-.*\.woff2$/,
  },
] as const

export function embedLadderPageFonts(
  html: string,
  assetsDirectory = join(__dirname, '../renderer/assets'),
): string {
  let css = ''
  try {
    const files = readdirSync(assetsDirectory)
    for (const face of FONT_FACES) {
      const name = files.find((file) => face.pattern.test(file))
      if (!name) continue
      const data = readFileSync(join(assetsDirectory, name)).toString('base64')
      css +=
        `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${face.weight};` +
        `font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');` +
        'unicode-range:U+0000-00FF,U+2000-206F}\n'
    }
  } catch {
    return html
  }
  if (!css) return html
  return html.replace('</head>', `<style>\n${css}</style>\n</head>`)
}
