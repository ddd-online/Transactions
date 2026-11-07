import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { AppError } from '../../shared/errors'

/**
 * 天梯网页的导出：一个 module，两条 adapter。
 *
 * 实现里有三件事：把构建产物里的四个字重内嵌成 base64、把页面写到临时目录、
 * 交给系统浏览器打开。调用方只需要知道「给我日期与 HTML，还我一个路径」——
 * 临时目录与「打开」由 deps 递进来：生产那边是 `app.getPath('temp')` + `shell.openPath`，
 * 测试那边是一个临时目录 + 一个只记下路径的 recorder（两个 adapter 才让这条 seam 成立）。
 *
 * 文件名单调：`transactions-ladder-<date>.html`，同一天重复导出覆盖同一个文件。
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

interface FontFace {
  family: string
  weight: number
  pattern: RegExp
}

/** 和软件同一套字：Inter 三个字重 + JetBrains Mono 500。文件名带构建哈希，只能按前缀找。 */
const FONT_FACES: readonly FontFace[] = [
  { family: 'Inter', weight: 400, pattern: /^inter-latin-400-normal-.*\.woff2$/ },
  { family: 'Inter', weight: 600, pattern: /^inter-latin-600-normal-.*\.woff2$/ },
  { family: 'Inter', weight: 700, pattern: /^inter-latin-700-normal-.*\.woff2$/ },
  { family: 'JetBrains Mono', weight: 500, pattern: /^jetbrains-mono-latin-500-normal-.*\.woff2$/ },
]

export interface LadderExportDeps {
  /** 写到哪里：生产是系统临时目录 */
  tempDirectory: string
  /** 交给谁打开：生产是 `shell.openPath`，返回空串表示成功、非空表示失败原因 */
  openPath: (file: string) => Promise<string>
  /** 字体产物在哪：默认构建产物里的 renderer/assets，测试可以指到自己的目录 */
  assetsDirectory?: string
}

export interface LadderExportInput {
  /** 交易日：`YYYY-MM-DD` */
  date: string
  /** 整张网页的 HTML（未内嵌字体） */
  html: string
}

/**
 * 把一份天梯 HTML 写成单文件网页并交给浏览器。返回写出的完整路径。
 *
 * 失败都落成 `AppError`：日期格式 / 空内容 / 「打开」失败 —— 调用方只负责把它交给界面。
 */
export async function exportLadderPage(
  input: LadderExportInput,
  deps: LadderExportDeps,
): Promise<string> {
  if (!DATE_PATTERN.test(input.date)) throw new AppError('日期格式无效', { status: 400 })
  if (!input.html) throw new AppError('页面内容为空', { status: 400 })

  const file = join(deps.tempDirectory, `transactions-ladder-${input.date}.html`)
  writeFileSync(file, embedLadderPageFonts(input.html, deps.assetsDirectory), 'utf8')

  const failure = await deps.openPath(file)
  if (failure) throw new AppError(`打开网页失败：${failure}`, { status: 500 })
  return file
}

/**
 * 把字体以 base64 塞进页面（页面本身不联网、不引外部资源）。
 *
 * 找不到（开发模式走 Vite dev，没有 renderer/assets）就什么都不加 —— 模板里已经写好系统字体回退。
 */
export function embedLadderPageFonts(html: string, assetsDirectory?: string): string {
  const directory = assetsDirectory ?? join(__dirname, '../renderer/assets')
  let css = ''
  try {
    const files = readdirSync(directory)
    for (const face of FONT_FACES) {
      const name = files.find((file) => face.pattern.test(file))
      if (!name) continue
      const data = readFileSync(join(directory, name)).toString('base64')
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
