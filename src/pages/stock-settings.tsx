import { useCallback, useEffect, useState, type JSX } from 'react'

import { Input, Modal } from 'antd'

import { centsToYuan, yuanToCents } from '../../shared/domain/money'
import type {
  StockOperationDto,
  StockReviewSettingDto,
  StockTradeTagSettingDto,
} from '../../shared/types/stock'
import { Button } from '../components/button'
import { ConfirmDialog } from '../components/confirm-dialog'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'
import { notify } from '../components/toast'
import { stockErrorMessage } from './stock-format'
import { StockSettingsFees } from './stock-settings-fees'
import { StockSettingsTemplates, type StockReviewTemplateWrite } from './stock-settings-templates'

export interface StockSettingsPanelProps {
  ledgerId: string
  onLedgerChanged?: () => void
}

export function StockSettingsPanel({ ledgerId, onLedgerChanged }: StockSettingsPanelProps): JSX.Element {
  const [tags, setTags] = useState<StockTradeTagSettingDto | null>(null)
  const [review, setReview] = useState<StockReviewSettingDto | null>(null)
  const [feeOpen, setFeeOpen] = useState(false)
  const [operations, setOperations] = useState<StockOperationDto[]>([])
  const [newTag, setNewTag] = useState('')
  const [feeForm, setFeeForm] = useState({
    commission: '',
    minCommission: '',
    stamp: '',
    transfer: '',
  })
  const [operationsOpen, setOperationsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveName, setArchiveName] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) return
    try {
      const [tagSettings, reviewSettings, feeSettings, operationRows] = await Promise.all([
        window.api.invoke('stock_tag_settings_get', { ledger_id: ledgerId }),
        window.api.invoke('stock_review_template_get', { ledger_id: ledgerId }),
        window.api.invoke('stock_fee_settings_get', { ledger_id: ledgerId }),
        window.api.invoke('stock_operation_list', { ledger_id: ledgerId }),
      ])
      setTags(tagSettings)
      setReview(reviewSettings as StockReviewSettingDto)
      setOperations(operationRows)
      setFeeForm({
        commission: (feeSettings.commissionRate * 10000).toString(),
        minCommission: centsToYuan(feeSettings.minCommission),
        stamp: (feeSettings.stampDutyRate * 100).toString(),
        transfer: (feeSettings.transferFeeRate * 100).toString(),
      })
    } catch (loadError) {
      notify(stockErrorMessage(loadError), 'error')
    }
  }, [ledgerId])

  useEffect(() => {
    void load()
  }, [load])

  const saveTags = useCallback(
    async (next: string[]): Promise<void> => {
      try {
        const result = await window.api.invoke('stock_tag_settings_put', {
          ledger_id: ledgerId,
          tags: next,
        })
        setTags(result)
        setNewTag('')
      } catch (tagError) {
        notify(stockErrorMessage(tagError), 'error')
      }
    },
    [ledgerId],
  )

  /** 模板的保存与恢复默认共用：`dailyTemplate` 省略时服务端保持每日模板不动。 */
  const saveReview = useCallback(
    async (write: StockReviewTemplateWrite): Promise<StockReviewSettingDto | null> => {
      try {
        const result = await window.api.invoke('stock_review_template_put', {
          ledger_id: ledgerId,
          template: write.template,
          ...(write.dailyTemplate === undefined ? {} : { daily_template: write.dailyTemplate }),
        })
        setReview(result)
        return result
      } catch (templateError) {
        notify(stockErrorMessage(templateError), 'error')
        return null
      }
    },
    [ledgerId],
  )

  const saveFees = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.api.invoke('stock_fee_settings_put', {
        ledger_id: ledgerId,
        commission_rate: Number(feeForm.commission) / 10000,
        min_commission: yuanToCents(feeForm.minCommission),
        stamp_duty_rate: Number(feeForm.stamp) / 100,
        transfer_fee_rate: Number(feeForm.transfer) / 100,
      })
      setFeeForm({
        commission: (result.commissionRate * 10000).toString(),
        minCommission: centsToYuan(result.minCommission),
        stamp: (result.stampDutyRate * 100).toString(),
        transfer: (result.transferFeeRate * 100).toString(),
      })
      notify('交易费用已保存')
      setFeeOpen(false)
    } catch (feeError) {
      notify(stockErrorMessage(feeError), 'error')
    } finally {
      setBusy(false)
    }
  }, [feeForm, ledgerId])

  const rollback = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.invoke('stock_operation_rollback', { ledger_id: ledgerId })
      notify(result.skipped ? `目标已不存在，已移除：${result.action}` : `已回滚：${result.action}`)
      await load()
    } catch (rollbackError) {
      notify(stockErrorMessage(rollbackError), 'error')
    }
  }, [ledgerId, load])

  const archive = useCallback(async (): Promise<void> => {
    if (!archiveName.trim()) return
    try {
      await window.api.invoke('stock_archive', {
        ledger_id: ledgerId,
        name: archiveName.trim(),
      })
      setArchiveOpen(false)
      setArchiveName('')
      notify('股票数据已归档')
      onLedgerChanged?.()
    } catch (archiveError) {
      notify(stockErrorMessage(archiveError), 'error')
    }
  }, [archiveName, ledgerId, onLedgerChanged])

  const reset = useCallback(async (): Promise<void> => {
    try {
      await window.api.invoke('stock_reset', { ledger_id: ledgerId })
      setResetOpen(false)
      notify('股票数据已重置')
      await load()
    } catch (resetError) {
      notify(stockErrorMessage(resetError), 'error')
    }
  }, [ledgerId, load])

  return (
    <ScrollArea className="stock-settings-scroll">
      <div className="stock-settings-view">
      <section className="stock-setting-row">
        <div className="stock-setting-row__info">
          <h2>交易标签</h2>
          <p>每轮交易可选（最多 20 个、单个不超过 8 字）；删除不影响历史记录。</p>
          <div className="stock-tag-list">
            {(tags?.tags ?? []).map((tag) => (
              <span key={tag} className="stock-tag-chip">
                {tag}
                {tag !== tags?.defaultTag ? (
                  <button
                    type="button"
                    aria-label={`删除标签 ${tag}`}
                    onClick={() => void saveTags((tags?.tags ?? []).filter((item) => item !== tag))}
                  >
                    <Icon name="Close" size={10} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        </div>
        <div className="stock-setting-row__actions">
          <Input
            data-testid="stock-tag-input"
            aria-label="新增交易标签"
            value={newTag}
            placeholder="如：低吸"
            onChange={(event) => setNewTag(event.target.value)}
            onPressEnter={() => void saveTags([...(tags?.tags ?? []), newTag.trim()])}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (!newTag.trim()) return
              void saveTags([...(tags?.tags ?? []), newTag.trim()])
            }}
          >
            添加
          </Button>
        </div>
      </section>

      <StockSettingsTemplates settings={review} onSave={saveReview} />

      <StockSettingsFees
        open={feeOpen}
        form={feeForm}
        busy={busy}
        onOpen={() => setFeeOpen(true)}
        onChange={setFeeForm}
        onSave={() => void saveFees()}
        onClose={() => setFeeOpen(false)}
      />

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
            onClick={() => void rollback()}
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
      </div>
    </ScrollArea>
  )
}
