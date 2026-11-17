/**
 * 标题栏左上角的应用菜单：账本切换 + 应用级动作。
 *
 * 它是窗口里唯一的「全局入口」——侧栏顶部的头像已经去掉，账本只能在菜单里切；
 * 因此菜单的第一节必须是账本（当前账本带对勾），应用动作排在分隔线之后。
 * 结构与交互照桌面包的习惯来：`role="menu"` + 方向键、Esc 关闭、点外面关闭，
 * 「主题」是二级菜单（与截图里「布局 ›」「缩放 ›」同一套读法）。
 *
 * 纯展示模块：数据与写操作都通过 props 进来，自己不碰 `window.api`。
 */

import { Input, Modal } from 'antd'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

import type { Ledger } from '../shared/domain/models'
import { AppMark } from './components/app-mark'
import { Button } from './components/button'
import { ConfirmDialog } from './components/confirm-dialog'
import { Icon } from './components/icon'
import { IdentityDot } from './components/identity-dot'
import { Tooltip } from './components/tooltip'

const THEME_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['light', '浅色'],
  ['dark', '深色'],
  ['system', '跟随系统'],
]

function normalizeAppearance(value: string): string {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function themeLabel(value: string): string {
  return THEME_OPTIONS.find(([key]) => key === normalizeAppearance(value))?.[1] ?? '跟随系统'
}

/** 菜单里可聚焦的项：方向键在这份顺序里走。 */
function menuItems(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>('[data-menu-item]'))
}

export interface AppMenuProps {
  ledgers: Ledger[]
  activeLedgerId: string
  activeLedgerName: string
  /** 空串 = 还没有工作空间：新建表单禁用。 */
  workspace: string
  version: string
  /** 当前外观，`light` / `dark` / 其它（`system`）。 */
  appearance: string
  busy: boolean
  onSelect: (id: string) => void
  /**
   * 新建账本；成功返回 null，失败返回给用户看的错误文案。
   * `onCreated` 在库表写完之后、列表刷新之前回调 —— 弹窗按原来的时机关掉。
   */
  onCreate: (
    name: string,
    description: string,
    onCreated: () => void,
  ) => Promise<string | null>
  onDelete: (id: string) => Promise<void>
  onAppearanceChange: (appearance: string) => void
  onOpenSettings: () => void
  onOpenAbout: () => void
  onOpenDevtools: () => void
}

export function AppMenu({
  ledgers,
  activeLedgerId,
  activeLedgerName,
  workspace,
  version,
  appearance,
  busy,
  onSelect,
  onCreate,
  onDelete,
  onAppearanceChange,
  onOpenSettings,
  onOpenAbout,
  onOpenDevtools,
}: AppMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const themeRowRef = useRef<HTMLButtonElement>(null)
  const themePanelRef = useRef<HTMLDivElement>(null)
  /** 键盘打开二级菜单时，等它挂上去再把焦点递进去。 */
  const themeFocusPending = useRef(false)
  /** 只有键盘打开菜单才把焦点送进第一项：鼠标打开时停在入口，
   *  当前账本行也就不会因为 focus-within 提前露出删除键。 */
  const keyOpened = useRef(false)

  const close = useCallback((restoreFocus = false): void => {
    setOpen(false)
    setThemeOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
        setOpen(false)
        setThemeOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close(true)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [close, open])

  // 键盘打开就把焦点交给第一项：键盘用户不必先 Tab 进面板。
  useEffect(() => {
    if (!open || !keyOpened.current) return
    menuItems(panelRef.current)[0]?.focus()
  }, [open])

  useEffect(() => {
    if (!themeOpen || !themeFocusPending.current) return
    themeFocusPending.current = false
    menuItems(themePanelRef.current)[0]?.focus()
  }, [themeOpen])

  const openDialog = useCallback((): void => {
    setOpen(false)
    setThemeOpen(false)
    setName('')
    setDescription('')
    setError('')
    setDialogOpen(true)
  }, [])

  const submit = useCallback(async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请输入账本名称')
      return
    }
    setError('')
    const failure = await onCreate(trimmed, description.trim(), () => {
      setName('')
      setDescription('')
      setDialogOpen(false)
    })
    if (failure) setError(failure)
  }, [description, name, onCreate])

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (themeOpen) {
        setThemeOpen(false)
        themeRowRef.current?.focus()
        return
      }
      close(true)
      return
    }
    if (event.key === 'ArrowRight' && document.activeElement === themeRowRef.current) {
      event.preventDefault()
      themeFocusPending.current = true
      setThemeOpen(true)
      return
    }
    if (
      event.key === 'ArrowLeft' &&
      themeOpen &&
      themePanelRef.current?.contains(document.activeElement)
    ) {
      event.preventDefault()
      setThemeOpen(false)
      themeRowRef.current?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const scope =
      themeOpen && themePanelRef.current?.contains(document.activeElement)
        ? themePanelRef.current
        : panelRef.current
    const items = menuItems(scope)
    if (items.length === 0) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLElement)
    const delta = event.key === 'ArrowDown' ? 1 : -1
    items[(index + delta + items.length) % items.length]?.focus()
  }

  return (
    <div
      className="app-menu-anchor"
      ref={anchorRef}
      onBlur={(event) => {
        if (!anchorRef.current?.contains(event.relatedTarget as Node)) close()
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`app-menu-trigger${open ? ' is-open' : ''}`}
        data-testid="app-menu-trigger"
        aria-label={`应用菜单，当前账本 ${activeLedgerName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          if (open) {
            close()
            return
          }
          keyOpened.current = event.detail === 0
          setOpen(true)
        }}
      >
        <AppMark />
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="app-menu"
          data-testid="app-menu"
          role="menu"
          aria-label="应用菜单"
          onKeyDown={onPanelKeyDown}
        >
          <div className="app-menu__caption">账本</div>
          {ledgers.length === 0 ? (
            <div className="app-menu__empty" data-testid="ledger-menu-empty">
              暂无账本
            </div>
          ) : (
            ledgers.map((ledger) => (
              <div
                key={ledger.id}
                data-testid="ledger-menu-row"
                className={`app-menu__row${ledger.id === activeLedgerId ? ' is-active' : ''}`}
              >
                <Tooltip text={ledger.description.trim() || '暂无描述'}>
                  <button
                    type="button"
                    className="app-menu__item app-menu__item--ledger"
                    role="menuitemradio"
                    aria-checked={ledger.id === activeLedgerId}
                    data-menu-item
                    onClick={() => {
                      onSelect(ledger.id)
                      close(true)
                    }}
                  >
                    <IdentityDot seed={ledger.id} size={6} />
                    <span className="app-menu__label">{ledger.name}</span>
                    {ledger.id === activeLedgerId ? (
                      <Icon name="Check" size={13} className="app-menu__check" />
                    ) : null}
                  </button>
                </Tooltip>
                <button
                  type="button"
                  className="app-menu__delete"
                  data-testid="ledger-delete"
                  aria-label={`删除账本 ${ledger.name}`}
                  onClick={() => {
                    close()
                    setDeleteTarget(ledger.id)
                  }}
                >
                  <Icon name="Trash" size={14} />
                </button>
              </div>
            ))
          )}

          <button
            type="button"
            className="app-menu__item app-menu__item--create"
            data-testid="ledger-open-create"
            role="menuitem"
            data-menu-item
            onClick={openDialog}
          >
            <Icon name="Plus" size={14} />
            <span className="app-menu__label">创建账本</span>
          </button>

          <div className="app-menu__divider" />

          <button
            type="button"
            className="app-menu__item"
            data-testid="app-menu-settings"
            role="menuitem"
            data-menu-item
            onClick={() => {
              close(true)
              onOpenSettings()
            }}
          >
            <Icon name="Setting" size={15} />
            <span className="app-menu__label">应用设置</span>
          </button>

          <div
            className="app-menu__sub-anchor"
            onPointerEnter={() => setThemeOpen(true)}
            onPointerLeave={() => {
              if (!themePanelRef.current?.contains(document.activeElement)) setThemeOpen(false)
            }}
          >
            <button
              ref={themeRowRef}
              type="button"
              className="app-menu__item"
              data-testid="app-menu-theme"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={themeOpen}
              data-menu-item
              onClick={() => setThemeOpen(true)}
            >
              <Icon name="Sun" size={15} />
              <span className="app-menu__label">主题</span>
              <span className="app-menu__value">{themeLabel(appearance)}</span>
              <Icon name="ChevronRight" size={11} className="app-menu__chevron" />
            </button>
            {themeOpen ? (
              <div
                ref={themePanelRef}
                className="app-menu__submenu"
                data-testid="app-menu-theme-menu"
                role="menu"
                aria-label="主题"
                onKeyDown={onPanelKeyDown}
              >
                {THEME_OPTIONS.map(([value, label]) => {
                  const active = normalizeAppearance(appearance) === value
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`app-menu__item${active ? ' is-checked' : ''}`}
                      data-testid={`app-menu-theme-${value}`}
                      role="menuitemradio"
                      aria-checked={active}
                      data-menu-item
                      onClick={() => {
                        close(true)
                        if (!active) onAppearanceChange(value)
                      }}
                    >
                      <Icon name="Check" size={13} className="app-menu__check" />
                      <span className="app-menu__label">{label}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="app-menu__item"
            data-testid="app-menu-about"
            role="menuitem"
            data-menu-item
            onClick={() => {
              close(true)
              onOpenAbout()
            }}
          >
            <Icon name="InfoCircle" size={15} />
            <span className="app-menu__label">关于软件</span>
            <span className="app-menu__value app-menu__value--mono">{version}</span>
          </button>

          <button
            type="button"
            className="app-menu__item"
            data-testid="app-menu-devtools"
            role="menuitem"
            data-menu-item
            onClick={() => {
              close(true)
              onOpenDevtools()
            }}
          >
            <Icon name="Code" size={15} />
            <span className="app-menu__label">开发者工具</span>
          </button>
        </div>
      ) : null}

      <Modal
        open={dialogOpen}
        title="创建账本"
        width={400}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setDialogOpen(false)}
      >
        <div className="tr-modal-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">名称</span>
            {/* 输入法确认候选词的那次回车不算提交：antd 的 onPressEnter 自带 isComposing 守卫 */}
            <Input
              data-testid="ledger-name"
              placeholder="请输入账本名称"
              value={name}
              disabled={busy || !workspace}
              onChange={(event) => setName(event.target.value)}
              onPressEnter={() => void submit()}
            />
          </div>
          <div className="tr-modal-field">
            <span className="tr-modal-label">描述</span>
            <Input
              data-testid="ledger-description"
              placeholder="请输入账本描述"
              value={description}
              disabled={busy || !workspace}
              onChange={(event) => setDescription(event.target.value)}
              onPressEnter={() => void submit()}
            />
          </div>
          {error ? (
            <p role="alert" className="m0-error" data-testid="ledger-error">
              {error}
            </p>
          ) : null}
          <div className="tr-modal-footer">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="ledger-create"
              disabled={busy || !workspace}
              onClick={() => void submit()}
            >
              创建
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除账本"
        message="确定删除该账本及其全部记录？此操作不可撤销。"
        confirmText="删除"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (target) void onDelete(target)
        }}
      />
    </div>
  )
}
