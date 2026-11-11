import { useCallback, useEffect, useState, type JSX } from 'react'

import { Input } from 'antd'

import { centsToYuan, yuanToCents } from '../../shared/domain/money'
import type {
  StockOperationDto,
  StockReviewSettingDto,
  StockTradeTagSettingDto,
} from '../../shared/types/stock'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'
import { notify } from '../components/toast'
import { stockErrorMessage } from './stock-format'
import { StockSettingsDanger } from './stock-settings-danger'
import { StockSettingsFees, type StockFeeForm } from './stock-settings-fees'
import {
  StockSettingsTemplates,
  type StockReviewTemplateWrite,
} from './stock-settings-templates'

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
  const [feeForm, setFeeForm] = useState<StockFeeForm>({
    commission: '',
    minCommission: '',
    stamp: '',
    transfer: '',
  })
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

  const rollback = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.invoke('stock_operation_rollback', { ledger_id: ledgerId })
      notify(result.skipped ? `目标已不存在，已移除：${result.action}` : `已回滚：${result.action}`)
      await load()
    } catch (rollbackError) {
      notify(stockErrorMessage(rollbackError), 'error')
    }
  }, [ledgerId, load])

  const archive = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        await window.api.invoke('stock_archive', {
          ledger_id: ledgerId,
          name,
        })
        notify('股票数据已归档')
        onLedgerChanged?.()
        return true
      } catch (archiveError) {
        notify(stockErrorMessage(archiveError), 'error')
        return false
      }
    },
    [ledgerId, onLedgerChanged],
  )

  const reset = useCallback(async (): Promise<boolean> => {
    try {
      await window.api.invoke('stock_reset', { ledger_id: ledgerId })
      notify('股票数据已重置')
      await load()
      return true
    } catch (resetError) {
      notify(stockErrorMessage(resetError), 'error')
      return false
    }
  }, [ledgerId, load])

  return (
    <ScrollArea className="stock-settings-scroll">
      <div className="stock-settings-view">
      <section className="stock-setting-row">
        <div className="stock-setting-row__info">
          <h2>交易标签</h2>
          <p>最多 20 个、每个 8 字；删除不影响历史记录。</p>
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

      <StockSettingsDanger
        operations={operations}
        onRollback={rollback}
        onArchive={archive}
        onReset={reset}
      />
      </div>
    </ScrollArea>
  )
}
