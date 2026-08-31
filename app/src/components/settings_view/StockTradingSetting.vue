<template>
  <SettingsPageWrapper title="股票交易">
    <div class="setting-list">
      <!-- 重置 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">重置</span>
          <span class="setting-desc">
            清空当前账本的股票交易数据（账户本金、持仓、交易记录、资金记录、费用设置）。此操作不可恢复。
          </span>
        </div>
        <div class="setting-action">
          <a-button type="primary" danger @click="confirmOpen = true">重置</a-button>
        </div>
      </div>
    </div>

    <!-- 重置确认弹窗 -->
    <a-modal
      v-model:open="confirmOpen"
      title="重置股票交易数据"
      ok-text="确认重置"
      cancel-text="取消"
      :ok-button-props="{ danger: true }"
      :confirm-loading="resetting"
      centered
      @ok="handleReset"
    >
      <p class="reset-modal-text">
        将清空当前账本的股票交易数据（账户本金、持仓、交易记录、资金记录、费用设置）。此操作不可恢复，确定继续吗？
      </p>
    </a-modal>
  </SettingsPageWrapper>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { resetStockData } from '@/backend/api/stock'
import { withErrorHandling } from '@/backend/errorHandler'
import NotificationUtil from '@/backend/notification'
import { useStockPositionStore } from '@/stores/stockPositionStore'
import { useStockAccountStore } from '@/stores/stockAccountStore'
import { useLedgerStore } from '@/stores/ledgerStore'

const resetting = ref(false)
const confirmOpen = ref(false)
const ledgerStore = useLedgerStore()

const handleReset = async () => {
  if (resetting.value) return
  const ledgerId = ledgerStore.currentLedgerId
  if (!ledgerId) {
    NotificationUtil.error('重置股票交易数据失败', '请先打开工作空间')
    return
  }
  resetting.value = true
  try {
    await withErrorHandling(() => resetStockData(ledgerId), {
      errorPrefix: '重置股票交易数据失败',
      rethrow: true,
    })
    // 刷新当前账本的内存数据，保证回到股票页时立即呈现空状态
    await Promise.all([useStockPositionStore().reloadAll(), useStockAccountStore().reloadAll()])
    NotificationUtil.success('股票交易数据已重置')
    confirmOpen.value = false
  } catch {
    // 错误已由 withErrorHandling 提示
  } finally {
    resetting.value = false
  }
}
</script>

<style scoped>
.setting-list {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-sm);
}

.setting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--transactions-space-md) var(--transactions-space-lg);
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-divider);
  border-radius: var(--transactions-radius-md);
  transition: background-color var(--transactions-transition-fast);
}

.setting-card:hover {
  background-color: var(--transactions-color-hover-bg);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-2xs);
  min-width: 0;
}

.setting-title {
  font-size: var(--transactions-size-text-body);
  font-weight: var(--transactions-weight-medium);
  color: var(--transactions-color-text-major);
}

.setting-desc {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-snug);
  max-width: 560px;
}

.setting-action {
  flex-shrink: 0;
  margin-left: var(--transactions-space-lg);
}

.reset-modal-text {
  margin: 0;
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-relaxed);
}

@media (prefers-reduced-motion: reduce) {
  .setting-card { transition: none; }
}
</style>
