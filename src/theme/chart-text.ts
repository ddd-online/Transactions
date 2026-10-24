/** Canvas 图表读不到 CSS 变量：建图前把当前主题下解析好的令牌值取出来，一次性喂给坐标轴。
 *
 * 图表里的文字（刻度、图例）同样是正文，只是画在 canvas 上、不吃 `--transactions-*` 的继承。
 * 以前这里写死 `#8c8c8c` + `#e5e6eb`：深色主题下那条灰线几乎看不见，刻度也掉到 3.4:1
 * （低于正文 4.5:1 的下限）。改成从根元素读当前主题的取值 —— 浅色/深色各取各的，
 * 字体也跟正文同一套（canvas 默认是浏览器兜底字面，跟界面对不上）。 */
export interface ChartTextTokens {
  /** 刻度文字颜色：正文次要色（浅 5.8:1 / 深 6.4:1），够读又不与数据争 */
  labelFill: string
  /** 网格线：分隔线那一档，深色主题下自动变成低亮白 */
  gridStroke: string
  /** 字体族：与正文同栈（Inter + 中文系统字面） */
  fontFamily: string
}

function readToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function chartTextTokens(): ChartTextTokens {
  return {
    labelFill: readToken('--transactions-color-text-secondary', '#61666b'),
    gridStroke: readToken('--transactions-color-divider', '#eceef1'),
    fontFamily: readToken('--transactions-font-body', 'sans-serif'),
  }
}
