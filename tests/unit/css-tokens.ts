/**
 * `tokens.css` 的读取工具：单元测试只读这段样式文本，不开浏览器。
 *
 * 设计令牌是仓库里唯一写着颜色字面量的地方，所以「这些取值有没有落进判据」只能对文本断言。
 * `antd-theme.spec.ts` 与 `pie-colors.spec.ts` 共用这份解析。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** 令牌原文（含注释；解析时会先剥掉注释，免得注释里的示例选择器被当成真规则）。 */
export const tokensCss = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8')

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 取某个选择器的声明块：从选择器后的第一个 `{` 起做大括号配平（`@media` 里嵌的那块也能取）。 */
export function block(source: string, selector: string): string {
  const css = withoutComments(source)
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`missing ${selector}`)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  throw new Error(`unclosed ${selector}`)
}

/** 取一条 `--transactions-<name>` 令牌的值。 */
export function token(css: string, name: string): string {
  const match = withoutComments(css).match(new RegExp(`--transactions-${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`missing token ${name}`)
  return match[1].trim()
}
