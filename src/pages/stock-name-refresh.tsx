import { useCallback, useState, type JSX } from 'react'

import { Icon } from '../components/icon'
import { notify } from '../components/toast'
import { stockErrorMessage } from './stock-format'

export interface StockNameRefreshProps {
  ledgerId: string
  stockCode: string
  /** 当前显示的名字：刷新回来跟它一样就报「名称未变」，点这一下总要有句回执 */
  stockName: string
  testId?: string
  /** 拿到新名字：页面就地改名，不重拉整页（重拉会丢掉展开的轮次与滚动位置） */
  onRenamed: (stockName: string) => void
}

/**
 * 刷新股票名称：名称是行情源的**显示名**，代码才是不变的那个 ——
 * 除权除息（`XD` / `DR` 前缀）、摘帽、公司更名都会让名字变，
 * 所以这里按代码重新问一次行情，写回账本里该股的全部名称副本。
 */
export function StockNameRefresh({
  ledgerId,
  stockCode,
  stockName,
  testId = 'stock-name-refresh',
  onRenamed,
}: StockNameRefreshProps): JSX.Element {
  const [busy, setBusy] = useState(false)

  const refresh = useCallback((): void => {
    if (busy) return
    setBusy(true)
    void (async () => {
      try {
        const next = await window.api.invoke('stock_name_refresh', {
          ledger_id: ledgerId,
          stock_code: stockCode,
        })
        onRenamed(next.stockName)
        notify(
          next.stockName === stockName ? '名称未变' : `名称已更新：${next.stockName}`,
        )
      } catch (error) {
        notify(stockErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    })()
  }, [busy, ledgerId, onRenamed, stockCode, stockName])

  return (
    <button
      type="button"
      className={`stock-name-refresh${busy ? ' is-spinning' : ''}`}
      data-testid={testId}
      title="刷新名称"
      aria-label={`刷新 ${stockCode} 的名称`}
      aria-busy={busy}
      onClick={refresh}
    >
      <Icon name="Reload" size={12} />
    </button>
  )
}
