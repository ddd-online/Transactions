/**
 * 设置 · 日记与关于两个分栏的面板。
 *
 * 日记分栏只有导入导出入口；关于分栏是应用标识、版本、更新面板与 GitHub 链接。
 * 两者都不持有状态：版本与更新快照由设置页从外壳接过来，原样往下传。
 */

import type { JSX } from 'react'

import type { UpdateSnapshot } from '../../shared/domain/update'
import { AppMark } from '../components/app-mark'
import { Icon } from '../components/icon'
import { DiaryTransfer } from './diary-transfer'
import { UpdatePanel } from './update-panel'

export interface SettingsDiaryProps {
  /** 日记按账本隔离；没有账本时为空串 */
  ledgerId: string
}

export function SettingsDiary({ ledgerId }: SettingsDiaryProps): JSX.Element {
  return <DiaryTransfer ledgerId={ledgerId} />
}

export interface SettingsAboutProps {
  version: string
  updateSnapshot: UpdateSnapshot | null
  onUpdateSnapshot: (snapshot: UpdateSnapshot | null) => void
}

export function SettingsAbout({
  version,
  updateSnapshot,
  onUpdateSnapshot,
}: SettingsAboutProps): JSX.Element {
  return (
    <div className="st-about">
      <div className="st-about-main">
        <div className="st-about-header">
          <div className="st-app-logo">
            <AppMark />
          </div>
          <h2 className="st-app-name">Transactions</h2>
          <p className="st-app-version">版本 {version}</p>
        </div>
        <UpdatePanel snapshot={updateSnapshot} onSnapshot={onUpdateSnapshot} />
        <div className="st-about-footer">
          <a
            className="st-about-link"
            href="https://github.com/ddd-online/Transactions"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="GitHub" size={14} />
            <span className="st-about-link-text">GitHub</span>
          </a>
          <p className="st-about-copyright">
            © {new Date().getFullYear()} Transactions. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
