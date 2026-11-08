/**
 * 更新命令：检查 / 下载 / 进度 / 取消 / 安装。
 *
 * 更新服务是主进程单例（在 context.ts 里构造），这里只转发命令。
 */
import { app } from 'electron'

import type { HandlerMap } from '../commands'
import { asObject, type HandlerContext } from './context'

export function createUpdateHandlers(
  ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'update_check'
  | 'update_download'
  | 'update_download_status'
  | 'update_cancel'
  | 'update_install'
> {
  return {
    async update_check() {
      return ctx.updater.check(app.getVersion())
    },

    async update_download(request) {
      const raw = asObject(request)
      return ctx.updater.download(String(raw.url ?? ''), String(raw.digest ?? ''))
    },

    update_download_status() {
      return ctx.updater.snapshot()
    },

    update_cancel() {
      return ctx.updater.cancel()
    },

    update_install() {
      return ctx.updater.install()
    },
  }
}
