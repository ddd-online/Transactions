/**
 * 底栏最右的「?」：一张小菜单，装着外面那一侧的去处。
 *
 * 两行常驻 —— 「访问 GitHub 项目」与「检查更新」；检查到新版本后，菜单顶部多出
 * 一行「下载新版本 x.y.z」，点它落回设置 · 关于软件（下载与安装只在那里做，不在这里复制一套）。
 *
 * 检查本身走 `update_check`（主进程是状态机唯一的持有者），结果按全站规矩走底部轻提示；
 * 查到可下载的版本时菜单**不关**，让那一行就出现在指针下面。
 */
import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'

import {
  UPDATE_STATUS_AVAILABLE,
  UPDATE_STATUS_DOWNLOADED,
  UPDATE_STATUS_DOWNLOADING,
  UPDATE_STATUS_FAILED,
  UPDATE_STATUS_NO_UPDATE,
  updateStatusLabel,
  type UpdateSnapshot,
} from '../../shared/domain/update'
import { errorMessage } from '../../shared/errors'
import { Icon } from './icon'
import { IconButton } from './icon-button'
import { notify } from './toast'

/** 与「关于软件」里那颗链接同一个去处。 */
const REPOSITORY_URL = 'https://github.com/ddd-online/Transactions'

const ITEM_SELECTOR = '[data-help-item]'

export interface FooterHelpProps {
  /** 打开设置 · 关于软件：下载 / 安装更新的唯一入口。 */
  onOpenAbout: () => void
  /** 主进程推送的更新快照：查到新版本 / 下载完成都由它驱动菜单顶部那一行。 */
  snapshot: UpdateSnapshot | null
  onSnapshot: (snapshot: UpdateSnapshot) => void
}

interface UpdateOffer {
  label: string
}

/** 已经查到的版本能不能从底栏往下走一步：下载或安装都落到关于页。 */
function updateOffer(snapshot: UpdateSnapshot): UpdateOffer | null {
  if (snapshot.status === UPDATE_STATUS_AVAILABLE) {
    return { label: `下载新版本 ${snapshot.latestVersion}` }
  }
  if (snapshot.status === UPDATE_STATUS_DOWNLOADED) {
    return { label: `安装新版本 ${snapshot.latestVersion}` }
  }
  return null
}

export function FooterHelp({ onOpenAbout, snapshot, onSnapshot }: FooterHelpProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const offer = snapshot ? updateOffer(snapshot) : null
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  /** 菜单是被键盘打开的：展开后把焦点送进第一行（鼠标打开不抢焦点）。 */
  const keyboardOpened = useRef(false)

  const close = useCallback((restoreFocus = false): void => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open || !keyboardOpened.current) return
    keyboardOpened.current = false
    panelRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus()
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close(true)
      return
    }
    if (!open && (event.key === 'Enter' || event.key === ' ')) {
      // 回车 / 空格打开的菜单要把焦点送进第一行；鼠标点开则不抢。
      keyboardOpened.current = true
    }
    if (!open) return
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])]
    if (items.length === 0) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLElement)
    const delta = event.key === 'ArrowDown' ? 1 : -1
    items[(index + delta + items.length) % items.length]?.focus()
  }

  const check = useCallback(async (): Promise<void> => {
    if (checking) return
    setChecking(true)
    try {
      const result = await window.api.invoke('update_check', {})
      onSnapshot(result)
      if (updateOffer(result)) {
        // 有下一步可走时菜单留在原位：新出现的那一行就在指针下面。
        notify(
          result.status === UPDATE_STATUS_AVAILABLE
            ? `发现新版本 ${result.latestVersion}`
            : '新版本已下载，可在「设置 · 关于软件」安装',
          'info',
        )
        return
      }
      close(true)
      if (result.status === UPDATE_STATUS_NO_UPDATE) {
        notify(updateStatusLabel(result.status))
      } else if (result.status === UPDATE_STATUS_FAILED) {
        notify(result.error ?? updateStatusLabel(result.status), 'error')
      } else if (result.status === UPDATE_STATUS_DOWNLOADING) {
        notify('更新正在下载，可在「设置 · 关于软件」查看进度', 'info')
      }
    } catch (checkError) {
      close(true)
      notify(errorMessage(checkError), 'error')
    } finally {
      setChecking(false)
    }
  }, [checking, close, onSnapshot])

  const openAbout = useCallback((): void => {
    close(true)
    onOpenAbout()
  }, [close, onOpenAbout])

  return (
    <div
      className="app-help"
      ref={rootRef}
      onPointerDown={() => {
        keyboardOpened.current = false
      }}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) close()
      }}
      onKeyDown={onKeyDown}
    >
      <IconButton
        icon="Question"
        label="帮助与更新"
        ariaLabel="帮助与更新：GitHub 项目、检查更新"
        active={open}
        expanded={open}
        hasPopup="menu"
        buttonRef={triggerRef}
        testId="footer-help"
        onClick={() => {
          if (open) {
            close()
            return
          }
          setOpen(true)
        }}
      />

      {open ? (
        <div
          className="app-help__panel"
          ref={panelRef}
          role="menu"
          aria-label="帮助与更新"
          data-testid="footer-help-menu"
        >
          {offer ? (
            <button
              type="button"
              className="app-help__item app-help__item--primary"
              role="menuitem"
              data-help-item
              data-testid="footer-help-offer"
              onClick={openAbout}
            >
              <Icon name="Download" size={15} />
              <span className="app-help__label">{offer.label}</span>
            </button>
          ) : null}

          <a
            className="app-help__item"
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            data-help-item
            data-testid="footer-help-github"
            onClick={() => close()}
          >
            <Icon name="GitHub" size={15} />
            <span className="app-help__label">访问 GitHub 项目</span>
          </a>

          <button
            type="button"
            className="app-help__item"
            role="menuitem"
            data-help-item
            data-testid="footer-help-check"
            aria-busy={checking || undefined}
            onClick={() => void check()}
          >
            <Icon name={checking ? 'Loading' : 'Reload'} size={15} />
            <span className="app-help__label">
              {checking ? updateStatusLabel('checking') : '检查更新'}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
