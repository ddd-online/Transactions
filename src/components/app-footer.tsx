/**
 * 常驻底栏：窗口最下面那一条 44px 的灰带，横贯整宽。
 *
 * 结构是「骨架三段」的最后一段 —— 标题栏 / 中栏（侧栏 + 内容）/ 底栏。
 * 中间那块 `.app-footer-bar__page` 是页面自己的底栏（收支合计、股票汇总…）的挂载点，
 * 由 `PageLayout` 用 portal 投进来；页面没有底栏时它就空着，右端只剩「?」。
 */
import type { JSX } from 'react'

import type { UpdateSnapshot } from '../../shared/domain/update'
import { FooterHelp } from './footer-help'

export interface AppFooterProps {
  /** 页面底栏插槽挂载 / 卸载时回传节点（外壳据此把 portal 的目标交给页面）。 */
  onSlotChange: (node: HTMLDivElement | null) => void
  /** 「?」菜单里的「下载 / 安装新版本」落到设置 · 关于软件。 */
  onOpenAbout: () => void
  /** 全局更新快照：菜单顶部那一行由它派生（下载完成会自己换成「安装」）。 */
  updateSnapshot: UpdateSnapshot | null
  onUpdateSnapshot: (snapshot: UpdateSnapshot) => void
  inert?: boolean
}

export function AppFooter({
  onSlotChange,
  onOpenAbout,
  updateSnapshot,
  onUpdateSnapshot,
  inert,
}: AppFooterProps): JSX.Element {
  return (
    <footer className="app-footer-bar" inert={inert}>
      <div className="app-footer-bar__page" ref={onSlotChange} />
      <div className="app-footer-bar__help">
        <FooterHelp
          onOpenAbout={onOpenAbout}
          snapshot={updateSnapshot}
          onSnapshot={onUpdateSnapshot}
        />
      </div>
    </footer>
  )
}
