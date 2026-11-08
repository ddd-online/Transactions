import { useState, type JSX } from 'react'

import { Input, Modal } from 'antd'

import type { StockOperationDto } from '../../shared/types/stock'
import { Button } from '../components/button'
import { ConfirmDialog } from '../components/confirm-dialog'

export interface StockSettingsDangerProps {
  /** 最近 10 条可回滚的操作；数量为 0 时回滚按钮禁用 */
  operations: StockOperationDto[]
  /** 回滚最近一次操作：页面负责 IPC、提示与重新载入 */
  onRollback: () => Promise<void>
  /** 归档到新账本；`name` 已 trim，返回是否成功（失败由页面提示） */
  onArchive: (name: string) => Promise<boolean>
  /** 重置全部股票数据（确认框已确认），返回是否成功（失败由页面提示） */
  onReset: () => Promise<boolean>
}

/** 操作记录 / 归档 / 重置：三个危险入口、各自弹窗；落库与提示仍在页面。 */
export function StockSettingsDanger({
  operations,
  onRollback,
  onArchive,
  onReset,
}: StockSettingsDangerProps): JSX.Element {
  const [operationsOpen, setOperationsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveName, setArchiveName] = useState('')
  const [resetOpen, setResetOpen] = useState(false)

  const archive = async (): Promise<void> => {
    if (!archiveName.trim()) return
    if (!(await onArchive(archiveName.trim()))) return
    setArchiveOpen(false)
    setArchiveName('')
  }

  const reset = async (): Promise<void> => {
    if (!(await onReset())) return
    setResetOpen(false)
  }

  return (
    <>
      <section className="stock-setting-row">
        <div className="stock-setting-row__info">
          <h2>操作记录</h2>
          <p>追加本金 / 支取 / 利息归本 / 建仓 / 加仓 / 减仓 / 清仓 各记一条，最多保留最近 10 条；回滚撤销最近一次操作。</p>
        </div>
        <div className="stock-setting-row__actions">
          <Button variant="secondary" testId="stock-operations-open" onClick={() => setOperationsOpen(true)}>
            查看记录
          </Button>
          <Button
            variant="secondary"
            testId="stock-operation-rollback"
            disabled={operations.length === 0}
            onClick={() => void onRollback()}
          >
            回滚
          </Button>
        </div>
      </section>

      <section className="stock-setting-row">
        <div className="stock-setting-row__info">
          <h2>归档</h2>
          <p>
            把当前账本的账户本金、资金记录、交易与轮次/复盘迁到一个新账本；原账本只保留交易标签、复盘模板与费用设置。需先清空全部持仓。
          </p>
        </div>
        <div className="stock-setting-row__actions">
          <Button variant="secondary" testId="stock-archive-open" onClick={() => setArchiveOpen(true)}>
            归档
          </Button>
        </div>
      </section>

      <section className="stock-setting-row">
        <div className="stock-setting-row__info">
          <h2>重置</h2>
          <p>
            清空当前账本的股票数据（账户本金、持仓、交易记录、资金记录、费用设置、交易标签与复盘模板），此操作不可恢复。
          </p>
        </div>
        <div className="stock-setting-row__actions">
          <Button variant="danger" testId="stock-reset" onClick={() => setResetOpen(true)}>
            重置
          </Button>
        </div>
      </section>

      <Modal
        open={operationsOpen}
        title="操作记录"
        width={560}
        centered
        footer={null}
        onCancel={() => setOperationsOpen(false)}
      >
        {operations.length === 0 ? (
          <p className="stock-muted">还没有可回滚的操作</p>
        ) : (
          <ul className="stock-operation-list">
            {operations.map((operation) => (
              <li key={operation.id} data-testid="stock-operation">
                <span>{operation.action}</span>
                <span className="stock-muted">{operation.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={archiveOpen}
        title="归档到新账本"
        width={440}
        centered
        footer={null}
        onCancel={() => setArchiveOpen(false)}
      >
        <div className="stock-modal-form">
          <label>
            <span className="stock-label">新账本名称</span>
            <Input
              data-testid="stock-archive-name"
              autoFocus
              value={archiveName}
              onChange={(event) => setArchiveName(event.target.value)}
              onPressEnter={() => void archive()}
            />
          </label>
          <div className="stock-modal-actions">
            <Button variant="secondary" onClick={() => setArchiveOpen(false)}>
              取消
            </Button>
            <Button variant="primary" testId="stock-archive" onClick={() => void archive()}>
              归档
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={resetOpen}
        title="重置全部股票数据"
        message="将清空当前账本的股票数据，且不可恢复。"
        confirmText="重置"
        danger
        onCancel={() => setResetOpen(false)}
        onConfirm={() => void reset()}
      />
    </>
  )
}
