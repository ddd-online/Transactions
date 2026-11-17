/**
 * 标题栏左上角的应用菜单：工作空间名 + 账本切换 + 应用级动作。
 *
 * 入口是**工作空间目录名 + 下箭头**的文字按钮（桌面包的惯例），不再放软件图标。
 * 它是窗口里唯一的「全局入口」——账本只能在菜单里切，因此第一节必须是账本
 * （当前账本带对勾），应用动作排在分隔线之后。外观切换已经搬到标题栏的太阳 / 月亮键，
 * 不再占菜单一行。
 *
 * 结构与交互照桌面包的习惯来：`role="menu"` + 方向键、Esc 关闭、点外面关闭。
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
import { Button } from './components/button'
import { ConfirmDialog } from './components/confirm-dialog'
import { Icon } from './components/icon'
import { IdentityDot } from './components/identity-dot'
import { Tooltip } from './components/tooltip'

/** 工作空间的显示名：目录路径的最后一段（`D:\记账\家庭` → `家庭`）。 */
function workspaceName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? 'Transactions'
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
  busy,
  onSelect,
  onCreate,
  onDelete,
  onOpenSettings,
  onOpenAbout,
  onOpenDevtools,
}: AppMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /** 只有键盘打开菜单才把焦点送进第一项：鼠标打开时停在入口，
   *  当前账本行也就不会因为 focus-within 提前露出删除键。 */
  const keyOpened = useRef(false)

  const close = useCallback((restoreFocus = false): void => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
        setOpen(false)
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

  const openDialog = useCallback((): void => {
    setOpen(false)
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
      close(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = menuItems(panelRef.current)
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
        aria-label={`应用菜单，工作空间 ${workspaceName(workspace)}，当前账本 ${activeLedgerName}`}
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
        <span className="app-menu-trigger__name">{workspaceName(workspace)}</span>
        <Icon name="Down" size={10} className="app-menu-trigger__chevron" />
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
