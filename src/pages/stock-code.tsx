import { useCallback, type JSX } from 'react'

import { notify } from '../components/toast'

export interface StockCodeProps {
  code: string
  /** 外面那圈排版（等宽、字号、颜色）由调用方给，这里只负责「可点 + 反馈」。 */
  className?: string
  testId?: string
}

/**
 * 股票代码：点一下复制到系统剪贴板。
 *
 * 代码是要拿去券商 / 行情软件里粘的短文本，选中再复制要拖三次鼠标；
 * 这里做成按钮（键盘可达、有焦点环），复制完成用一条 toast 回执。
 */
export function StockCode({ code, className, testId = 'stock-code-copy' }: StockCodeProps): JSX.Element {
  const copy = useCallback((): void => {
    void (async () => {
      try {
        await window.api.invoke('clipboard_write_text', { text: code })
        notify(`已复制 ${code}`)
      } catch {
        notify(`复制失败：${code}`, 'error')
      }
    })()
  }, [code])

  return (
    <button
      type="button"
      className={`stock-code${className ? ` ${className}` : ''}`}
      data-testid={testId}
      title="点击复制代码"
      aria-label={`复制代码 ${code}`}
      onClick={copy}
    >
      {code}
    </button>
  )
}
