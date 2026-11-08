/**
 * 股票天梯命令：拉取涨停池并组装天梯，以及把渲染层生成的天梯单页交给系统浏览器。
 *
 * 涨停池的交易日校验在 services/stock-limit；写文件与内嵌字体在 services/ladder-export。
 */
import { app, shell } from 'electron'

import { todayYmd } from '../../../shared/domain/time'
import { logInfo } from '../../logging'
import { exportLadderPage } from '../../services/ladder-export'
import { getLimitLadder } from '../../services/stock-limit'
import type { HandlerMap } from '../commands'
import {
  asObject,
  createLimitPoolSource,
  createQuoteFetcher,
  limitNowSeconds,
  workspaceDb,
  type HandlerContext,
} from './context'

export function createStockLadderHandlers(
  _ctx: HandlerContext,
): Pick<HandlerMap, 'stock_limit_ladder' | 'stock_ladder_open_page'> {
  return {
    async stock_limit_ladder(request) {
      const raw = asObject(request)
      const date = String(raw.date ?? '') || todayYmd()
      return getLimitLadder(workspaceDb(), createLimitPoolSource(), date, {
        refresh: raw.refresh === true,
        now: limitNowSeconds(),
        quotes: createQuoteFetcher(),
      })
    },

    /**
     * 把渲染层生成的天梯单页写到临时目录，再交给系统浏览器打开。
     *
     * 文件名由主进程按日期生成（不接受调用方给路径）：这条命令只做「一张当天网页」，
     * 不是通用的文件写入。字体在这里内嵌，页面离开这台机器也还是这套字。
     */
    async stock_ladder_open_page(request) {
      const raw = asObject(request)
      // 写文件 + 内嵌字体 + 交给浏览器都在 ladder-export 里；这里只做 adapter。
      const file = await exportLadderPage(
        { date: String(raw.date ?? ''), html: String(raw.html ?? '') },
        { tempDirectory: app.getPath('temp'), openPath: (target) => shell.openPath(target) },
      )
      logInfo(`天梯以网页打开: ${file}`)
      return file
    },
  }
}
