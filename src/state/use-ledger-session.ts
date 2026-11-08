import { useCallback, useEffect, useState } from 'react'

import type { ConfigSnapshot, FeatureFlags } from '../../shared/types/config'
import type { Ledger } from '../../shared/domain/models'
import { errorMessage, isWorkspaceNotOpenedError } from '../../shared/errors'
import { notify } from '../components/toast'

export interface LedgerSessionOptions {
  workspace: string
  config: ConfigSnapshot | null
  setBusy: (busy: boolean) => void
  onError: (message: string) => void
}

export interface LedgerSession {
  ledgers: Ledger[]
  activeLedgerId: string
  setActiveLedgerId: (id: string) => void
  /** 当前账本名；账本列表还没到时回落到「默认账本」。 */
  activeLedgerName: string
  /** 全局默认 + 当前账本的覆盖，已在外壳里算好 —— 导航可见性与设置页读的是同一份。 */
  effectiveFeatures: FeatureFlags | null
  refreshLedgers: () => Promise<void>
  /**
   * 新建账本；成功返回 null，失败返回给用户看的错误文案。
   * `onCreated` 在库表写完之后、列表刷新之前回调 —— 新建弹窗按原来的时机关掉。
   */
  createLedger: (
    name: string,
    description: string,
    onCreated: () => void,
  ) => Promise<string | null>
  deleteLedger: (id: string) => Promise<void>
}

/**
 * 账本会话：账本列表、当前账本，以及新建 / 删除之后的刷新与提示。
 *
 * `ledger_list` 的「未打开工作空间」错误要吞掉：工作空间打不开时它必然出现，
 * 不能盖住上一条真正可操作的话（数据库已损坏…请从备份恢复）。
 */
export function useLedgerSession({
  workspace,
  config,
  setBusy,
  onError,
}: LedgerSessionOptions): LedgerSession {
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [activeLedgerId, setActiveLedgerId] = useState('')

  const refreshLedgers = useCallback(async (): Promise<void> => {
    if (!workspace) {
      setLedgers([])
      return
    }
    try {
      const rows = await window.api.invoke('ledger_list', { id: 'all' })
      setLedgers(rows)
    } catch (listError) {
      if (!isWorkspaceNotOpenedError(listError)) onError(errorMessage(listError))
    }
  }, [workspace, onError])

  useEffect(() => {
    void refreshLedgers()
  }, [refreshLedgers])

  useEffect(() => {
    if (ledgers.length === 0) {
      setActiveLedgerId('')
      return
    }
    if (!ledgers.some((ledger) => ledger.id === activeLedgerId)) {
      setActiveLedgerId(ledgers[0].id)
    }
  }, [activeLedgerId, ledgers])

  const createLedger = useCallback(
    async (name: string, description: string, onCreated: () => void): Promise<string | null> => {
      setBusy(true)
      try {
        const ledgerId = await window.api.invoke('ledger_create', { name, description })
        await window.api.invoke('category_initialize', { ledgerId })
        onCreated()
        await refreshLedgers()
        setActiveLedgerId(ledgerId)
        notify('账本已创建')
        return null
      } catch (createError) {
        return errorMessage(createError)
      } finally {
        setBusy(false)
      }
    },
    [refreshLedgers, setBusy],
  )

  const deleteLedger = useCallback(
    async (id: string): Promise<void> => {
      setBusy(true)
      onError('')
      try {
        await window.api.invoke('ledger_delete', { id })
        await refreshLedgers()
        notify('账本已删除')
      } catch (deleteError) {
        notify(errorMessage(deleteError), 'error')
      } finally {
        setBusy(false)
      }
    },
    [onError, refreshLedgers, setBusy],
  )

  const effectiveFeatures = config
    ? { ...config.features, ...(config.ledgerFeatures[activeLedgerId] ?? {}) }
    : null
  const activeLedgerName =
    ledgers.find((ledger) => ledger.id === activeLedgerId)?.name ?? '默认账本'

  return {
    ledgers,
    activeLedgerId,
    setActiveLedgerId,
    activeLedgerName,
    effectiveFeatures,
    refreshLedgers,
    createLedger,
    deleteLedger,
  }
}
