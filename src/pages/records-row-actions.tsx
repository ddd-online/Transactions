/**
 * 记录表每一行右侧的三枚动作：编辑、同步到别的账本、删除。
 *
 * 只收一行记录、可同步的目标账本与三个回调；同步请求本身（`tr_create` 到目标账本）留在
 * 记录页，这里只负责菜单、禁用与进行中的转圈。
 */

import { Dropdown, Popconfirm, type MenuProps } from 'antd'
import type { JSX } from 'react'

import type { Ledger } from '../../shared/domain/models'
import type { TransactionRecordDto } from '../../shared/types/transaction'

import { Icon } from '../components/icon'
import { Tooltip } from '../components/tooltip'

export interface RecordRowActionsProps {
  record: TransactionRecordDto
  /** 这一行正在同步：同步按钮禁用并转圈，编辑/删除跟着禁用（与拆出前一致） */
  syncing: boolean
  /** 可同步的目标账本（不含当前账本） */
  otherLedgers: Ledger[]
  onEdit: (record: TransactionRecordDto) => void
  onSync: (record: TransactionRecordDto, targetLedgerId: string) => void
  onRemove: (id: string) => void
}

export function RecordRowActions({
  record,
  syncing,
  otherLedgers,
  onEdit,
  onSync,
  onRemove,
}: RecordRowActionsProps): JSX.Element {
  const syncMenu: MenuProps = {
    items:
      otherLedgers.length > 0
        ? otherLedgers.map((ledger) => ({ key: ledger.id, label: ledger.name }))
        : [{ key: '__none__', label: '无可用账本', disabled: true }],
    onClick: ({ key }) => {
      if (key !== '__none__') onSync(record, key)
    },
  }

  return (
    <div className="tr-cell-actions">
      <Tooltip text="编辑记录">
        <button
          type="button"
          className="tr-icon-btn"
          data-testid="tr-edit"
          aria-label="编辑记录"
          onClick={() => onEdit(record)}
        >
          <Icon name="Edit" size={15} />
        </button>
      </Tooltip>

      <Tooltip text="同步到其他账本">
        <Dropdown trigger={['click']} disabled={syncing} menu={syncMenu}>
          <button
            type="button"
            className="tr-icon-btn"
            data-testid="tr-sync"
            aria-label="同步到其他账本"
            disabled={syncing}
          >
            <span className={syncing ? 'tr-sync-icon is-spinning' : 'tr-sync-icon'}>
              <Icon name="Sync" size={15} />
            </span>
          </button>
        </Dropdown>
      </Tooltip>

      <Popconfirm
        title="删除这条消费记录？"
        okText="删除"
        okType="danger"
        showCancel={false}
        placement="topRight"
        onConfirm={() => onRemove(record.transactionId)}
      >
        <button
          type="button"
          className="tr-icon-btn is-danger"
          data-testid="tr-delete"
          aria-label="删除记录"
        >
          <Icon name="Trash" size={15} />
        </button>
      </Popconfirm>
    </div>
  )
}
