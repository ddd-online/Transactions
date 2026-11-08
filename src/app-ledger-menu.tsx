import { Input, Modal } from 'antd'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import type { Ledger } from '../shared/domain/models'
import { AppMark } from './components/app-mark'
import { Button } from './components/button'
import { ConfirmDialog } from './components/confirm-dialog'
import { Icon } from './components/icon'
import { IdentityDot } from './components/identity-dot'
import { Tooltip } from './components/tooltip'

export interface AppLedgerMenuProps {
  ledgers: Ledger[]
  activeLedgerId: string
  activeLedgerName: string
  workspaceIconUrl: string
  /** 空串 = 还没有工作空间：新建表单禁用。 */
  workspace: string
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
}

/**
 * 左侧栏的账本切换：触发器、下拉菜单、新建 / 删除弹窗与错误提示。
 *
 * 纯展示模块：数据与写操作都通过 props 进来，自己不碰 `window.api`。
 */
export function AppLedgerMenu({
  ledgers,
  activeLedgerId,
  activeLedgerName,
  workspaceIconUrl,
  workspace,
  busy,
  onSelect,
  onCreate,
  onDelete,
}: AppLedgerMenuProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const openDialog = useCallback((): void => {
    setMenuOpen(false)
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

  return (
    <>
      <div className="ledger-anchor" ref={anchorRef}>
        <button
          type="button"
          className={`ledger-btn workspace-btn${menuOpen ? ' is-open' : ''}`}
          data-testid="ledger-trigger"
          aria-label={`切换账本，当前 ${activeLedgerName}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="workspace-mark">
            {workspaceIconUrl ? (
              <img
                className="workspace-mark__image"
                data-testid="workspace-icon"
                src={workspaceIconUrl}
                alt=""
              />
            ) : (
              <AppMark />
            )}
          </span>
          <span className="ledger-btn-name">{activeLedgerName}</span>
          <span className="ledger-btn-arrow">
            <Icon name="Down" size={10} />
          </span>
        </button>
        {menuOpen ? (
          <div className="ledger-menu-layer">
            <div className="ledger-menu" role="menu">
              {ledgers.length === 0 ? (
                <div className="ledger-menu-empty" data-testid="ledger-menu-empty">
                  暂无账本
                </div>
              ) : (
                ledgers.map((ledger) => (
                  <div
                    key={ledger.id}
                    data-testid="ledger-menu-row"
                    className={`ledger-menu-row${ledger.id === activeLedgerId ? ' is-active' : ''}`}
                  >
                    <Tooltip text={ledger.description.trim() || '暂无描述'}>
                      <button
                        type="button"
                        className="ledger-menu-name"
                        role="menuitem"
                        onClick={() => {
                          onSelect(ledger.id)
                          setMenuOpen(false)
                        }}
                      >
                        <IdentityDot seed={ledger.id} size={6} />
                        <span className="ledger-menu-name-text">{ledger.name}</span>
                      </button>
                    </Tooltip>
                    <Button
                      className="ledger-menu-delete"
                      variant="text-danger"
                      size="sm"
                      testId="ledger-delete"
                      aria-label={`删除账本 ${ledger.name}`}
                      icon={<Icon name="Trash" size={14} />}
                      onClick={() => {
                        setMenuOpen(false)
                        setDeleteTarget(ledger.id)
                      }}
                    />
                  </div>
                ))
              )}
              <div className="ledger-menu-divider" />
              <button
                type="button"
                className="ledger-menu-create"
                data-testid="ledger-open-create"
                role="menuitem"
                onClick={openDialog}
              >
                <span className="ledger-menu-create-icon">
                  <Icon name="Plus" size={14} />
                </span>
                <span>创建账本</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

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
            <Input
              data-testid="ledger-name"
              placeholder="请输入账本名称"
              value={name}
              disabled={busy || !workspace}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
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
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
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
    </>
  )
}
